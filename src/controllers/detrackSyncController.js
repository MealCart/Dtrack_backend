// src/controllers/detrackSyncController.js
const { pool } = require('../config/database');
const DetrackService = require('../services/detrackService');
const Job = require('../models/Job');
const Collection = require('../models/Collection');

// ============================================
// HELPER: Fetch ALL jobs for a date (auto-paginates if needed)
// Detrack returns `links.next: null` when done, so this is usually
// a single round-trip for a given date.
// ============================================
const fetchAllForDate = async (date, type) => {
  const results = [];
  let page = 1;
  const limit = 1000;
  let hasNext = true;
  let safety = 0;

  while (hasNext && safety < 20) {
    const res = await DetrackService.getJobsWithFilters({
      date,
      type,
      page,
      limit,
    });

    const batch = res?.data || [];
    results.push(...batch);

    // Stop when we get fewer than `limit` OR Detrack says next is null
    hasNext =
      Array.isArray(batch) &&
      batch.length === limit &&
      res?.links?.next !== null &&
      res?.links?.next !== undefined;

    page++;
    safety++;
  }

  return results;
};

// ============================================
// HELPER: Filter Detrack jobs by group_id (client-side)
// Detrack's /api/v2/jobs does NOT honor group_id as a query filter,
// so we filter the response ourselves.
// ============================================
const filterByGroup = (jobs, groupId) => {
  const target = String(groupId || '').trim();
  if (!target) return [];
  return jobs.filter((j) => String(j.group_id || '').trim() === target);
};

// ============================================
// HELPER: Map a Detrack delivery job → jobs table row
// ============================================
const mapDetrackToJobRow = (job, userId, groupId, groupName) => {
  const shippingLabels =
    job.number_of_shipping_labels || job.cartons || job.boxes || 1;

  const recipientName =
    job.deliver_to_collect_from || job.deliver_to || 'Unknown';

  return {
    do_number: job.do_number || `DO-${Date.now()}`,
    customer_name: recipientName,
    customer_company: job.company_name || '',
    phone: job.phone_number || job.phone || '',
    delivery_address: job.address || job.address_1 || '',
    postcode: job.postal_code || '',
    recipient_name: recipientName,
    recipient_phone: job.phone_number || job.phone || '',
    boxes: parseInt(shippingLabels) || 1,
    weight: parseFloat(job.weight) || 0,
    contents: job.note || job.instructions || '',
    status: job.status || job.primary_job_status || 'pending',
    scheduled_date: job.date || new Date().toISOString().split('T')[0],
    special_instructions: job.instructions || '',
    barcodes: [], // user generates labels later
    detrack_id: job.id || '',
    source: 'detrack_sync',
    group_name: groupName || '',
    group_id: groupId || '',
    pickup_address: '',
    user_id: userId,
    state: job.state || '',
    city: job.city || '',
    country: job.country || 'Australia',
    address_1: job.address_1 || job.address || '',
    address_2: job.address_2 || '',
  };
};

// ============================================
// HELPER: Map a Detrack collection job → collections table row
// ============================================
const mapDetrackToCollectionRow = (job, userId, groupId, groupName) => {
  const recipientName =
    job.deliver_to_collect_from || job.collect_from || 'Unknown Sender';

  return {
    do_number: job.do_number || `COL-${Date.now()}`,
    recipient_name: recipientName,
    recipient_company: job.company_name || '',
    collection_address: job.address || job.address_1 || '',
    postcode: job.postal_code || '',
    city: job.city || '',
    state: job.state || '',
    country: job.country || 'Australia',
    recipient_phone: job.phone_number || job.phone || '',
    special_instructions: job.instructions || '',
    scheduled_date: job.date || null,
    time_window: job.collection_time || job.time_window || '07:00-18:00',
    collection_type: 'Collection',
    group_id: groupId || '',
    group_name: groupName || '',
    status: job.status || job.primary_job_status || 'pending',
    detrack_id: job.id || '',
    tracking_link: job.tracking_link || '',
    verification_code: job.verification_code ? String(job.verification_code) : '',
    source: 'detrack_sync',
    user_id: userId,
  };
};

// ============================================
// HELPER: Check which DO numbers already exist in our DB
// (either in jobs OR collections table)
// ============================================
const findExistingDoNumbers = async (doNumbers) => {
  if (!doNumbers || doNumbers.length === 0) return new Set();

  const jobsRes = await pool.query(
    `SELECT do_number FROM jobs WHERE do_number = ANY($1)`,
    [doNumbers]
  );
  const colRes = await pool.query(
    `SELECT do_number FROM collections WHERE do_number = ANY($1)`,
    [doNumbers]
  );

  const set = new Set();
  jobsRes.rows.forEach((r) => set.add(r.do_number));
  colRes.rows.forEach((r) => set.add(r.do_number));
  return set;
};

// ============================================
// PREVIEW SYNC
// GET /api/detrack-sync/preview?date=YYYY-MM-DD
// ============================================
exports.previewSync = async (req, res) => {
  try {
    // ✅ Only customers can use this
    if (req.user.role !== 'customer') {
      return res.status(403).json({
        success: false,
        error: 'Only customers can sync from Detrack.',
      });
    }

    const { date } = req.query;
    if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return res.status(400).json({
        success: false,
        error: 'Valid date (YYYY-MM-DD) is required.',
      });
    }

    const userId = req.user.id;
    const groupId = req.user.group_id;
    const groupName = req.user.group_name || '';

    if (!groupId) {
      return res.status(400).json({
        success: false,
        error: 'No group assigned to your account.',
      });
    }

    console.log(
      `🔄 [Sync Preview] date=${date}, user=${userId}, groupId=${groupId}, groupName=${groupName}`
    );

    // ===== Fetch ALL for the date =====
    const allDeliveries = await fetchAllForDate(date, 'Delivery');
    const allCollections = await fetchAllForDate(date, 'Collection');

    console.log(
      `📦 Detrack total for date: ${allDeliveries.length} deliveries, ${allCollections.length} collections`
    );

    // ===== Filter by this customer's group (client-side) =====
    const detrackDeliveries = filterByGroup(allDeliveries, groupId);
    const detrackCollections = filterByGroup(allCollections, groupId);

    console.log(
      `🔒 After group filter (groupId=${groupId}): ${detrackDeliveries.length} deliveries, ${detrackCollections.length} collections`
    );

    // ===== Dedupe against DB =====
    const allDoNumbers = [
      ...detrackDeliveries.map((j) => j.do_number),
      ...detrackCollections.map((j) => j.do_number),
    ].filter(Boolean);

    const existing = await findExistingDoNumbers(allDoNumbers);
    console.log(`🔍 Found ${existing.size} existing DO numbers in DB`);

    const missingJobs = detrackDeliveries.filter(
      (j) => j.do_number && !existing.has(j.do_number)
    );
    const missingCollections = detrackCollections.filter(
      (j) => j.do_number && !existing.has(j.do_number)
    );

    // ===== Shape for the modal =====
    const shapeJob = (j) => ({
      do_number: j.do_number,
      recipient_name:
        j.deliver_to_collect_from || j.deliver_to || 'Unknown',
      company_name: j.company_name || '',
      address: j.address || j.address_1 || '',
      postcode: j.postal_code || '',
      state: j.state || '',
      city: j.city || '',
      phone: j.phone_number || j.phone || '',
      boxes:
        parseInt(
          j.number_of_shipping_labels || j.cartons || j.boxes || 1
        ) || 1,
      weight: parseFloat(j.weight) || 0,
      status: j.status || j.primary_job_status || 'pending',
      scheduled_date: j.date || date,
      detrack_id: j.id || '',
      instructions: j.instructions || '',
      group_id: groupId,
      group_name: groupName,
      _raw: j,
    });

    const shapeCollection = (j) => ({
      do_number: j.do_number,
      recipient_name:
        j.deliver_to_collect_from || j.collect_from || 'Unknown Sender',
      company_name: j.company_name || '',
      address: j.address || j.address_1 || '',
      postcode: j.postal_code || '',
      state: j.state || '',
      city: j.city || '',
      phone: j.phone_number || j.phone || '',
      status: j.status || j.primary_job_status || 'pending',
      scheduled_date: j.date || date,
      detrack_id: j.id || '',
      instructions: j.instructions || '',
      group_id: groupId,
      group_name: groupName,
      _raw: j,
    });

    return res.json({
      success: true,
      date,
      groupId,
      groupName,
      missingJobs: missingJobs.map(shapeJob),
      missingCollections: missingCollections.map(shapeCollection),
      summary: {
        detrackTotal: detrackDeliveries.length + detrackCollections.length,
        existingInDb: existing.size,
        missingJobs: missingJobs.length,
        missingCollections: missingCollections.length,
      },
    });
  } catch (error) {
    console.error('❌ [Sync Preview] error:', error.message);
    return res.status(500).json({
      success: false,
      error: 'Failed to preview Detrack sync.',
      details: error.message,
    });
  }
};

// ============================================
// COMMIT SYNC
// POST /api/detrack-sync/commit
// body: { date, jobs: [...], collections: [...] }
// ============================================
exports.commitSync = async (req, res) => {
  try {
    // ✅ Only customers
    if (req.user.role !== 'customer') {
      return res.status(403).json({
        success: false,
        error: 'Only customers can sync from Detrack.',
      });
    }

    const userId = req.user.id;
    const groupId = req.user.group_id;
    const groupName = req.user.group_name || '';

    if (!groupId) {
      return res.status(400).json({
        success: false,
        error: 'No group assigned to your account.',
      });
    }

    const { date, jobs = [], collections = [] } = req.body;

    if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return res.status(400).json({
        success: false,
        error: 'Valid date (YYYY-MM-DD) is required.',
      });
    }

    if (jobs.length === 0 && collections.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'Nothing to import.',
      });
    }

    console.log(
      `🔄 [Sync Commit] date=${date}, jobs=${jobs.length}, collections=${collections.length}, groupId=${groupId}`
    );

    // ===== Server-side re-check (prevent race conditions) =====
    const allDoNumbers = [
      ...jobs.map((j) => j.do_number),
      ...collections.map((j) => j.do_number),
    ].filter(Boolean);

    const existing = await findExistingDoNumbers(allDoNumbers);

    const insertedJobs = [];
    const insertedCollections = [];
    const skipped = [];
    const failed = [];

    // ===== Insert Jobs =====
    for (const job of jobs) {
      try {
        if (!job.do_number) {
          failed.push({
            do_number: 'Unknown',
            type: 'job',
            error: 'Missing do_number',
          });
          continue;
        }

        if (existing.has(job.do_number)) {
          skipped.push({ do_number: job.do_number, type: 'job' });
          continue;
        }

        const raw = job._raw || job;

        // ✅ Extra safety: only insert jobs that really belong to this group
        if (raw.group_id && String(raw.group_id) !== String(groupId)) {
          skipped.push({ do_number: job.do_number, type: 'job' });
          console.log(
            `⏭️ Skipping job ${job.do_number} — group mismatch (${raw.group_id} != ${groupId})`
          );
          continue;
        }

        const row = mapDetrackToJobRow(raw, userId, groupId, groupName);
        await Job.create(row);
        insertedJobs.push(job.do_number);
        console.log(`✅ Inserted job ${job.do_number}`);
      } catch (err) {
        console.error(
          `❌ Failed to insert job ${job.do_number}:`,
          err.message
        );
        failed.push({
          do_number: job.do_number || 'Unknown',
          type: 'job',
          error: err.message,
        });
      }
    }

    // ===== Insert Collections =====
    for (const col of collections) {
      try {
        if (!col.do_number) {
          failed.push({
            do_number: 'Unknown',
            type: 'collection',
            error: 'Missing do_number',
          });
          continue;
        }

        if (existing.has(col.do_number)) {
          skipped.push({ do_number: col.do_number, type: 'collection' });
          continue;
        }

        const raw = col._raw || col;

        // ✅ Extra safety: only insert collections that really belong to this group
        if (raw.group_id && String(raw.group_id) !== String(groupId)) {
          skipped.push({ do_number: col.do_number, type: 'collection' });
          console.log(
            `⏭️ Skipping collection ${col.do_number} — group mismatch (${raw.group_id} != ${groupId})`
          );
          continue;
        }

        const row = mapDetrackToCollectionRow(raw, userId, groupId, groupName);
        await Collection.create(row);
        insertedCollections.push(col.do_number);
        console.log(`✅ Inserted collection ${col.do_number}`);
      } catch (err) {
        console.error(
          `❌ Failed to insert collection ${col.do_number}:`,
          err.message
        );
        failed.push({
          do_number: col.do_number || 'Unknown',
          type: 'collection',
          error: err.message,
        });
      }
    }

    return res.json({
      success: true,
      message: `Synced ${insertedJobs.length} jobs and ${insertedCollections.length} collections.`,
      inserted: {
        jobs: insertedJobs.length,
        collections: insertedCollections.length,
      },
      insertedDoNumbers: {
        jobs: insertedJobs,
        collections: insertedCollections,
      },
      skipped,
      failed,
    });
  } catch (error) {
    console.error('❌ [Sync Commit] error:', error.message);
    return res.status(500).json({
      success: false,
      error: 'Failed to commit Detrack sync.',
      details: error.message,
    });
  }
};