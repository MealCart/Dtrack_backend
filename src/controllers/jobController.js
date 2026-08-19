// src/controllers/jobController.js
const xlsx = require('xlsx');
const fs = require('fs');
const axios = require('axios');
const { pool } = require('../config/database');
const Job = require('../models/Job');
const DetrackService = require('../services/detrackService');
const { getValue, getNumber, getValidDate, generateBarcodes, V2_VALID_FIELDS } = require('../utils/helpers');
const Collection = require('../models/Collection');
const PODService = require('../services/podService');

// ===== HELPER: MAP DETRACK JOB TO FRONTEND FORMAT =====
function mapDetrackJobToBooking(job) {
  const doNumber = job.do_number || job.id || 'N/A';
  const shippingLabels = job.number_of_shipping_labels || job.cartons || job.boxes || 1;

  let barcodes = job.barcodes || [];
  if (typeof barcodes === 'string') {
    try {
      barcodes = JSON.parse(barcodes);
    } catch (e) {
      barcodes = [];
    }
  }

  if (barcodes.length === 0) {
    for (let i = 0; i < shippingLabels; i++) {
      barcodes.push(doNumber + '-' + String(i + 1).padStart(2, '0'));
    }
  }

  let scans = job.scans || [];
  if (typeof scans === 'string') {
    try {
      scans = JSON.parse(scans);
    } catch (e) {
      scans = [];
    }
  }

  const statusMap = {
    'pending': 'pending',
    'ready': 'ready',
    'in_transit': 'in_transit',
    'delivered': 'delivered',
    'failed': 'failed',
    'dispatched': 'dispatched',
    'completed': 'completed',
    'cancelled': 'cancelled'
  };
  const mappedStatus = statusMap[job.status?.toLowerCase()] || 'pending';

  return {
    id: job.id || doNumber,
    reference: doNumber,
    type: job.type || 'delivery',
    source: job.source || 'detrack',
    customerName: job.deliver_to_collect_from || job.deliver_to || 'Unknown',
    customerCompany: job.company_name || '',
    customerEmail: job.notify_email || '',
    pickupAddress: '',
    deliveryAddress: job.address || '',
    postcode: job.postal_code || '',
    recipientName: job.deliver_to_collect_from || job.deliver_to || 'Unknown',
    recipientPhone: job.phone || job.phone_number || '',
    boxes: shippingLabels,
    number_of_shipping_labels: shippingLabels,
    weight: job.weight || 0,
    contents: job.contents || job.note || '',
    status: mappedStatus,
    assignedVehicleId: job.assign_to || null,
    createdAt: job.created_at || new Date().toISOString(),
    scheduledDate: job.date || new Date().toISOString().split('T')[0],
    deliveredDate: job.delivered_date || undefined,
    cost: job.job_fee || 0,
    specialInstructions: job.instructions || '',
    barcodes: barcodes,
    scans: scans,
    labelUrl: job.label_url || job.labelUrl || '',
    detrackId: job.id || '',
    groupName: job.group_name || '',
    groupId: job.group_id || '',
    runNumber: job.run_number || '',
    podTime: job.pod_time || '',
    trackingLink: job.tracking_link || '',
    verificationCode: job.verification_code || '',
    updatedAt: job.updated_at || job.created_at || new Date().toISOString(),
    primaryJobStatus: job.primary_job_status || '',
    trackingStatus: job.tracking_status || '',
    trackingStatusCode: job.tracking_status_code || '',
    driver: job.assign_to || '',
    liveEta: job.live_eta || null,
    etaTime: job.eta_time || null,
    podFileUrl: job.pod_file_url || job.pod_url || null,
    photos: {
      photo_1: job.photo_1_file_url,
      photo_2: job.photo_2_file_url,
      photo_3: job.photo_3_file_url,
      photo_4: job.photo_4_file_url,
      photo_5: job.photo_5_file_url,
      photo_6: job.photo_6_file_url,
      photo_7: job.photo_7_file_url,
      photo_8: job.photo_8_file_url,
      photo_9: job.photo_9_file_url,
      photo_10: job.photo_10_file_url
    },
    milestones: job.milestones || [],
    cartons: job.cartons || shippingLabels,
    state: job.state || '',
    city: job.city || '',
    country: job.country || '',
    address_1: job.address_1 || '',
    address_2: job.address_2 || ''
  };
}

// ===== GENERATE POD PDF =====
exports.generatePod = async (req, res) => {
  try {
    const { doNumber } = req.params;

    if (!doNumber) {
      return res.status(400).json({ error: 'DO number is required' });
    }

    console.log(`📄 Generating POD for DO: ${doNumber}`);

    const job = await DetrackService.getJobByDoNumber(doNumber);

    if (!job) {
      return res.status(404).json({ error: 'Job not found' });
    }

    if (job.status !== 'completed' && job.status !== 'delivered') {
      return res.status(400).json({
        error: 'POD not available',
        message: 'Job is not completed yet. POD is only available for completed jobs.'
      });
    }

    const photos = [
      job.photo_1_file_url,
      job.photo_2_file_url,
      job.photo_3_file_url,
      job.photo_4_file_url,
      job.photo_5_file_url,
      job.photo_6_file_url,
      job.photo_7_file_url,
      job.photo_8_file_url,
      job.photo_9_file_url,
      job.photo_10_file_url
    ].filter(url => url && url !== null && url !== '');

    console.log(`📸 Found ${photos.length} photos`);
    console.log(`📄 Generating PDF with job data:`, {
      do_number: job.do_number,
      status: job.status,
      recipient: job.deliver_to_collect_from || job.deliver_to,
      hasPhotos: photos.length > 0
    });

    const pdfDoc = await PODService.generatePOD(job, photos);
    const pdfBytes = await pdfDoc.save();
    
    console.log(`📄 PDF size: ${pdfBytes.length} bytes`);

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="POD_${doNumber}.pdf"`);
    res.setHeader('Content-Length', pdfBytes.length);
    res.setHeader('Cache-Control', 'no-cache');
    res.send(Buffer.from(pdfBytes));

    console.log(`✅ POD generated for ${doNumber}`);

  } catch (error) {
    console.error('❌ Generate POD error:', error.message);
    console.error('❌ Stack:', error.stack);
    res.status(500).json({
      error: 'Failed to generate POD',
      details: error.message,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
};

// ===== FETCH JOBS FROM DATABASE (WITH GROUP FILTERING) =====
exports.getJobs = async (req, res) => {
  try {
    const { date } = req.query;
    const userId = req.user.id;
    const userRole = req.user.role;
    const userGroupId = req.user.group_id;

    let jobs;

    if (userRole === 'admin' || userRole === 'staff') {
      if (date) {
        const query = 'SELECT * FROM jobs WHERE scheduled_date = $1 ORDER BY created_at DESC';
        const result = await pool.query(query, [date]);
        jobs = result.rows;
      } else {
        const query = 'SELECT * FROM jobs ORDER BY scheduled_date DESC, created_at DESC';
        const result = await pool.query(query);
        jobs = result.rows;
      }
      console.log(`✅ Admin/Staff fetched ${jobs.length} jobs (all users)`);
    } else {
      if (userGroupId) {
        const query = `
          SELECT j.*, u.group_name as customer_group_name 
          FROM jobs j
          LEFT JOIN users u ON j.user_id = u.id
          WHERE j.group_id = $1
          ORDER BY j.scheduled_date DESC, j.created_at DESC
        `;
        const result = await pool.query(query, [userGroupId]);
        jobs = result.rows;
        console.log(`✅ Customer fetched ${jobs.length} jobs for group: ${userGroupId}`);
      } else {
        jobs = await Job.findAll(userId, date);
        console.log(`✅ Customer fetched ${jobs.length} jobs for user ${userId}`);
      }
    }

    return res.json({
      success: true,
      data: jobs
    });
  } catch (error) {
    console.error('❌ Database fetch error:', error.message);
    return res.status(500).json({
      error: 'Failed to fetch jobs from database',
      details: error.message
    });
  }
};

// ===== FETCH SINGLE JOB FROM DATABASE =====
exports.getJob = async (req, res) => {
  try {
    const id = req.params.id;
    const userId = req.user.id;
    const userRole = req.user.role;
    const userGroupId = req.user.group_id;

    let job;

    if (userRole === 'admin' || userRole === 'staff') {
      const query = 'SELECT * FROM jobs WHERE id = $1 OR do_number = $1';
      const result = await pool.query(query, [id]);
      job = result.rows[0];
    } else {
      const query = `
        SELECT j.* FROM jobs j
        WHERE (j.id = $1 OR j.do_number = $1) AND j.group_id = $2
      `;
      const result = await pool.query(query, [id, userGroupId]);
      job = result.rows[0];

      if (!job) {
        job = await Job.findById(userId, id);
      }
    }

    if (!job) {
      return res.status(404).json({ error: 'Job not found' });
    }
    return res.json({
      success: true,
      data: job
    });
  } catch (error) {
    console.error('❌ Database fetch error:', error.message);
    return res.status(500).json({
      error: 'Failed to fetch job from database',
      details: error.message
    });
  }
};

// ===== FETCH JOB BY DO NUMBER FROM DETRACK API =====
exports.getJobByDoNumber = async (req, res) => {
  try {
    // ✅ FIX: Get do_number from query and decode it
    let do_number = req.query.do_number;
    
    if (!do_number) {
      return res.status(400).json({ error: 'do_number is required' });
    }

    // ✅ Decode URL-encoded characters
    // This handles: %23 -> #, etc.
    do_number = decodeURIComponent(do_number);
    
    console.log(`📡 Fetching job by DO number: ${do_number} from Detrack...`);
    
    const job = await DetrackService.getJobByDoNumber(do_number);
    console.log(`✅ ${job ? 'Found' : 'No'} job found for DO number: ${do_number}`);
    
    return res.json({
      success: true,
      data: job
    });
  } catch (error) {
    console.error('❌ Fetch job by DO number error:', error.message);
    return res.status(500).json({
      error: 'Failed to fetch job from Detrack',
      details: error.response?.data?.message || error.message
    });
  }
};

// ===== CREATE SINGLE JOB =====
exports.createJob = async (req, res) => {
  try {
    const jobData = req.body;
    const userId = req.user.id;
    const userRole = req.user.role;
    const userGroupId = req.user.group_id;
    const userGroupName = req.user.group_name;

    console.log(`📦 Creating single job in Detrack for user ${userId}...`);

    const requiredFields = ['do_number', 'address', 'deliver_to'];
    for (const field of requiredFields) {
      if (!jobData[field]) {
        return res.status(400).json({
          error: `Missing required field: ${field}`
        });
      }
    }

    let groupId = jobData.group_id || '';
    let groupName = jobData.group || '';

    if (userRole === 'customer' && userGroupId) {
      groupId = userGroupId;
      groupName = userGroupName || '';
      console.log(`🔒 Customer forced to use group: ${groupId}`);
    }

    const detrackPayload = {
      do_number: jobData.do_number,
      address: jobData.address,
     deliver_to_collect_from: jobData.deliver_to || jobData.recipient_name || 'Recipient required',
      date: jobData.date || null,
      phone: jobData.phone || '',
      notify_email: jobData.notify_email || '',
      instructions: jobData.instructions || '',
      group: groupName || jobData.group || '',
      group_id: groupId || jobData.group_id || '',
      delivery_type: jobData.delivery_type || 'Home Delivery',
      time_window: jobData.time_window || '07:00-18:00',
      cartons: jobData.cartons || jobData.boxes || 1,
      boxes: jobData.boxes || jobData.cartons || 1,
      weight: jobData.weight || 0,
      address_1: jobData.address_1 || jobData.address || '',
      address_2: jobData.address_2 || '',
      postal_code: jobData.postal_code || '',
      city: jobData.city || '',
      state: jobData.state || '',
      country: jobData.country || 'Australia',
      company_name: jobData.company_name || '',
      zone: jobData.zone || '',
      pieces: jobData.pieces || 0,
      pallets: jobData.pallets || 0,
      latitude: jobData.latitude || '',
      longitude: jobData.longitude || '',
      assign_to: jobData.assign_to || '',
      run_no: jobData.run_no || '',
      depot: jobData.depot || '',
      reason: jobData.reason || '',
      received_by: jobData.received_by || '',
      note: jobData.note || '',
      remarks: jobData.remarks || '',
      carrier: jobData.carrier || '',
      payment_mode: jobData.payment_mode || '',
      payment_amount: jobData.payment_amount || 0,
      invoice_no: jobData.invoice_no || '',
      account_no: jobData.account_no || '',
      delivery_sequence: jobData.delivery_sequence || 0,
      service_type: jobData.service_type || '',
      service_time: jobData.service_time || '',
      start_time: jobData.start_time || '',
      end_time: jobData.end_time || '',
      depot_contact: jobData.depot_contact || '',
      depot_contact_no: jobData.depot_contact_no || '',
      depot_address: jobData.depot_address || '',
      payment_collected: jobData.payment_collected || false,
      auto_reschedule: jobData.auto_reschedule || false,
      attachment_url: jobData.attachment_url || ''
    };

    const response = await DetrackService.createJob(detrackPayload);

    if (response && response.data && response.data.id) {
      const detrackId = response.data.id;
      const totalBoxes = jobData.boxes || jobData.cartons || 1;
      const barcodes = generateBarcodes(jobData.do_number, totalBoxes);

      const job = await Job.create({
        do_number: jobData.do_number,
        customer_name: jobData.deliver_to || jobData.customer_name || '',
        customer_company: jobData.company_name || '',
        phone: jobData.phone || '',
        delivery_address: jobData.address || '',
        postcode: jobData.postal_code || '',
        recipient_name: jobData.deliver_to || '',
        recipient_phone: jobData.phone || '',
        boxes: totalBoxes,
        weight: jobData.weight || 0,
        contents: jobData.contents || '',
        status: 'pending',
        scheduled_date: jobData.date || null,
        special_instructions: jobData.instructions || '',
        barcodes: barcodes,
        detrack_id: detrackId,
        source: 'customer',
        group_name: groupName || jobData.group || '',
        group_id: groupId || jobData.group_id || '',
        pickup_address: jobData.pickup_address || '',
        user_id: userId
      });

      console.log(`✅ Job ${jobData.do_number} created with ID: ${detrackId} for user ${userId}`);

      return res.json({
        success: true,
        job: {
          id: job.id,
          do_number: jobData.do_number,
          detrack_id: detrackId,
          boxes: totalBoxes,
          barcodes: barcodes
        }
      });
    } else {
      throw new Error('Failed to create job in Detrack');
    }

  } catch (error) {
    console.error('❌ Error creating job:', error);
    return res.status(500).json({
      error: 'Failed to create job',
      details: error.response?.data?.message || error.message
    });
  }
};

exports.getDetrackCollections = async (req, res) => {
  try {
    const { date, groupId, page, limit } = req.query;
    const userRole = req.user.role;
    const userGroupId = req.user.group_id;

    console.log('📡 Fetching Detrack collections with filters:', { 
      date, 
      groupId, 
      page, 
      limit, 
      role: userRole,
      userGroupId: userGroupId
    });

    const queryParams = {
      type: 'Collection'
    };

    if (date) {
      queryParams.date = date;
    }
    
    if (page) {
      queryParams.page = parseInt(page);
    }
    if (limit) {
      queryParams.limit = parseInt(limit);
    }

    console.log('📤 Fetching from Detrack with params:', queryParams);

    const response = await DetrackService.getJobsWithFilters(queryParams);

    let mappedCollections = response?.data?.map(job => mapDetrackJobToBooking(job)) || [];

    mappedCollections.forEach(collection => {
      collection.type = 'collection';
    });

    const targetGroupId = userRole === 'customer' ? userGroupId : (groupId || null);

    let filteredCollections = mappedCollections;
    let totalCount = 0;
    const currentPage = parseInt(page) || 1;
    const itemsPerPage = parseInt(limit) || 100;

    if (targetGroupId) {
      // ✅ Customer: Fetch all pages for collections
      try {
        let allGroupCollections = [];
        let currentPageTemp = 1;
        let hasNextTemp = true;
        let safetyLimit = 0;
        
        while (hasNextTemp && safetyLimit < 20) {
          const tempParams = { 
            ...queryParams, 
            page: currentPageTemp, 
            limit: 100 
          };
          
          const tempResponse = await DetrackService.getJobsWithFilters(tempParams);
          
          if (tempResponse?.data && tempResponse.data.length > 0) {
            const tempCollections = tempResponse.data.map(job => mapDetrackJobToBooking(job));
            tempCollections.forEach(c => c.type = 'collection');
            const groupCollections = tempCollections.filter(collection => 
              collection.groupId === targetGroupId || collection.group_id === targetGroupId
            );
            allGroupCollections = allGroupCollections.concat(groupCollections);
          }
          
          hasNextTemp = tempResponse?.links?.next !== null && tempResponse.data?.length > 0;
          currentPageTemp++;
          safetyLimit++;
        }
        
        totalCount = allGroupCollections.length;
        console.log(`📊 Total collections for group ${targetGroupId}: ${totalCount}`);
        
        // Apply pagination
        const startIndex = (parseInt(page || 1) - 1) * itemsPerPage;
        const endIndex = Math.min(startIndex + itemsPerPage, allGroupCollections.length);
        filteredCollections = allGroupCollections.slice(startIndex, endIndex);
        
      } catch (error) {
        console.error('Error counting group collections:', error);
        totalCount = filteredCollections.length;
      }
    } else {
      // ✅ Admin/Staff: Use Detrack's total_count
      totalCount = response?.total_count || 0;
      filteredCollections = mappedCollections;
    }

    const totalPages = Math.ceil(totalCount / itemsPerPage) || 1;
    const hasNext = currentPage < totalPages;

    console.log(`📊 Total collections: ${totalCount}, Pages: ${totalPages}, Current: ${currentPage}`);

    return res.json({
      success: true,
      data: filteredCollections,
      source: 'detrack',
      meta: {
        total: totalCount,  // ✅ Correct filtered total
        page: currentPage,
        limit: itemsPerPage,
        hasNext: hasNext,
        totalPages: totalPages,
        date: date,
        groupId: targetGroupId,
        role: userRole
      },
      links: response?.links || null,
      total_count: totalCount
    });

  } catch (error) {
    console.error('❌ Fetch Detrack collections error:', error.message);
    return res.status(500).json({
      error: 'Failed to fetch collections from Detrack',
      details: error.response?.data?.message || error.message
    });
  }
};

exports.downloadLabels = (req, res) => {
  try {
    const filename = req.params.filename;
    const filepath = path.join(LABELS_DIR, filename);

    if (!fs.existsSync(filepath)) {
      return res.status(404).json({ error: 'File not found' });
    }

    res.download(filepath, filename);
  } catch (error) {
    console.error('❌ Error downloading labels:', error);
    return res.status(500).json({
      error: 'Failed to download labels',
      details: error.message
    });
  }
};
// ===== UPLOAD MANIFEST =====
exports.uploadManifest = async (req, res) => {
  try {
    const userId = req.user.id;
    const userRole = req.user.role;
    const userGroupId = req.user.group_id;
    const userGroupName = req.user.group_name;

    const selectedGroupId = req.body.groupId || '';
    const selectedGroupName = req.body.groupName || '';

    console.log(`📁 File upload received from user ${userId}`);
    console.log('📄 File name:', req.file.originalname);
    console.log('📏 File size:', req.file.size, 'bytes');
    console.log('📦 Selected Group ID from request:', selectedGroupId);
    console.log('📦 Selected Group Name from request:', selectedGroupName);

    const workbook = xlsx.read(req.file.buffer, { type: 'buffer' });
    const sheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[sheetName];
    const rawData = xlsx.utils.sheet_to_json(worksheet, { header: 1, defval: '' });

    let headerRowIndex = -1;
    let dataStartIndex = -1;

    for (let i = 0; i < rawData.length; i++) {
      const row = rawData[i];
      if (row && row.length > 0) {
        const rowStr = row.join(' ').toLowerCase();
        if (rowStr.includes('d.o. no') || rowStr.includes('do no') || rowStr.includes('tracking no')) {
          headerRowIndex = i;
          dataStartIndex = i + 1;
          break;
        }
      }
    }

    if (headerRowIndex === -1) {
      return res.status(400).json({ error: 'No header row found in Excel file' });
    }

    const headers = rawData[headerRowIndex].map(function (h) { return h?.toString().trim() || ''; });
    const dataRows = [];

    for (let i = dataStartIndex; i < rawData.length; i++) {
      const row = rawData[i];
      if (!row || row.every(function (cell) { return !cell || cell === ''; })) continue;
      const obj = {};
      headers.forEach(function (header, idx) {
        obj[header.trim()] = row[idx] || '';
      });
      dataRows.push(obj);
    }

    const validRows = [];
    const errors = [];
    const doNumbers = [];

    for (let i = 0; i < dataRows.length; i++) {
      const row = dataRows[i];
      const rowErrors = [];
      const hasData = Object.values(row).some(function (v) { return v && v !== ''; });
      if (!hasData) continue;

      const doNumber = getValue(row, 'D.O. No.', 'Tracking No.', 'DO No');
      const address = getValue(row, 'Address 1', 'Address');

      if (!doNumber) rowErrors.push('Missing D.O. No.');
      if (!address) rowErrors.push('Missing Address');

      if (rowErrors.length > 0) {
        errors.push({ row: i + 1, doNumber: doNumber || 'Unknown', errors: rowErrors });
      } else {
        validRows.push(row);
        doNumbers.push(doNumber.toString().trim());
      }
    }

    console.log(`✅ Valid rows: ${validRows.length}`);
    console.log(`❌ Errors: ${errors.length}`);

    if (validRows.length === 0) {
      return res.status(400).json({
        error: 'No valid rows found in the Excel file',
        errors: errors,
        sampleData: dataRows.slice(0, 3)
      });
    }

    console.log('🔍 Checking for duplicate DO numbers in database...');
    const duplicateCheck = await Job.checkDoNumbersExists(doNumbers);
    const duplicateDoNumbers = Object.keys(duplicateCheck).filter(key => duplicateCheck[key] === true);

    if (duplicateDoNumbers.length > 0) {
      console.log(`❌ Found ${duplicateDoNumbers.length} duplicate DO numbers:`, duplicateDoNumbers);
      return res.status(409).json({
        success: false,
        error: 'Duplicate DO numbers found in database',
        duplicateDoNumbers: duplicateDoNumbers,
        message: `The following DO numbers already exist in the database: ${duplicateDoNumbers.join(', ')}. Please remove or change them in your Excel file and try again.`
      });
    }

    console.log('✅ No duplicate DO numbers found. Proceeding with job creation...');

    const jobs = [];

    for (const row of validRows) {
      const doNumber = getValue(row, 'D.O. No.', 'Tracking No.', 'DO No', 'Order No.').toString().trim();
      const dateStr = getValidDate(getValue(row, 'Date', 'Processing Date'));
      const address = getValue(row, 'Address 1', 'Address');
      const address2 = getValue(row, 'Address 2');
      const city = getValue(row, 'City');
      const state = getValue(row, 'State');
      const postalCode = getValue(row, 'Postal Code');
      const country = getValue(row, 'Country');

      const fullAddress = [address, address2, city, state, postalCode, country].filter(Boolean).join(', ');
      const deliverTo = getValue(row, 'Deliver to', 'Deliver To');
      const noOfShippingLabels = getNumber(row, 'No. of Shipping Labels', 'Cartons');
      const cartons = getNumber(row, 'Cartons', 'No. of Shipping Labels');
      const boxes = noOfShippingLabels || cartons || 1;

      let groupId = getValue(row, 'Group ID', 'Group Id', 'GroupID', 'group_id');
      let groupName = getValue(row, 'Group Name', 'Group', 'group_name', 'group');

      if (!groupId && selectedGroupId) {
        groupId = selectedGroupId;
        groupName = selectedGroupName;
        console.log(`📌 Using selected group ID from request: ${groupId}`);
      }

      if (!groupId && userRole === 'customer' && userGroupId) {
        groupId = userGroupId;
        groupName = userGroupName || '';
        console.log(`🔒 Customer forced to use group: ${groupId}`);
      }

      const job = {
        date: dateStr,
        do_number: doNumber || 'DO-' + Date.now(),
        address: fullAddress || address || 'Address not provided',
        deliver_to: deliverTo || 'Unknown Recipient',
        phone: getValue(row, 'Phone No.', 'Phone'),
        notify_email: getValue(row, 'Notify Email', 'Notify email'),
        instructions: getValue(row, 'Instructions'),
        group_id: groupId || '',
        group: groupName || '',
        delivery_type: getValue(row, 'Delivery Type', 'Job type', 'Home Delivery'),
        time_window: getValue(row, 'Time Window', '07:00-18:00'),
        cartons: cartons,
        boxes: boxes,
        weight: getNumber(row, 'Weight'),
        pieces: getNumber(row, 'Pieces'),
        pallets: getNumber(row, 'Pallets'),
        address_1: address,
        address_2: address2,
        postal_code: postalCode,
        city: city,
        state: state,
        country: country,
        company_name: getValue(row, 'Company Name'),
        barcodes: generateBarcodes(doNumber, boxes || cartons || 1)
      };

      jobs.push(job);
    }

    const results = [];
    const failedJobs = [];
    const labels = [];

    for (const job of jobs) {
      try {
        const detrackPayload = {
          do_number: job.do_number,
          address: job.address,
          deliver_to: job.deliver_to,
          date: job.date,
          phone: job.phone,
          notify_email: job.notify_email,
          instructions: job.instructions,
          group_id: job.group_id,
          group: job.group,
          delivery_type: job.delivery_type,
          time_window: job.time_window,
          cartons: job.cartons,
          boxes: job.boxes,
          weight: job.weight,
          pieces: job.pieces,
          pallets: job.pallets,
          address_1: job.address_1,
          address_2: job.address_2,
          postal_code: job.postal_code,
          city: job.city,
          state: job.state,
          country: job.country,
          company_name: job.company_name
        };

        const response = await DetrackService.createJob(detrackPayload);

        if (response && response.data && response.data.id) {
          const detrackId = response.data.id;
          const barcodes = generateBarcodes(job.do_number, job.boxes || 1);

          await Job.upsert({
            do_number: job.do_number,
            customer_name: job.deliver_to || '',
            customer_company: job.company_name || '',
            phone: job.phone || '',
            delivery_address: job.address || '',
            postcode: job.postal_code || '',
            recipient_name: job.deliver_to || '',
            recipient_phone: job.phone || '',
            boxes: job.boxes || 1,
            weight: job.weight || 0,
            contents: job.instructions || '',
            status: 'pending',
            scheduled_date: job.date || null,
            special_instructions: job.instructions || '',
            barcodes: barcodes,
            detrack_id: detrackId,
            source: 'customer',
            group_name: job.group || '',
            group_id: job.group_id || '',
            pickup_address: '',
            user_id: userId
          });

          results.push({
            do_number: job.do_number,
            status: 'success',
            detrack_id: detrackId,
            boxes: job.boxes,
            barcodes: barcodes
          });
        }
      } catch (error) {
        failedJobs.push({
          do_number: job.do_number,
          error: error.response?.data?.message || error.message
        });
      }
    }

    return res.json({
      success: true,
      total: jobs.length,
      created: results.length,
      failed: failedJobs.length,
      results: results,
      failedJobs: failedJobs,
      validationErrors: errors,
      labels: labels
    });

  } catch (error) {
    console.error('❌ Upload error:', error);
    return res.status(500).json({
      error: 'Failed to process upload',
      details: error.message
    });
  }
};

exports.getDetrackJobsWithFilters = async (req, res) => {
  try {
    const { date, groupId, page, limit } = req.query;
    const userRole = req.user.role;
    const userGroupId = req.user.group_id;

    console.log('📡 Fetching Detrack jobs with filters:', { 
      date, 
      groupId, 
      page, 
      limit, 
      role: userRole,
      userGroupId: userGroupId
    });

    const queryParams = {
      type: 'Delivery'
    };

    if (date) {
      queryParams.date = date;
    }
    
    if (page) {
      queryParams.page = parseInt(page);
    }
    
    const effectiveLimit = limit ? parseInt(limit) : 100;
    queryParams.limit = effectiveLimit;

    console.log('📤 Fetching from Detrack with params:', queryParams);

    // ✅ Get jobs from Detrack
    const response = await DetrackService.getJobsWithFilters(queryParams);

    let mappedJobs = response?.data?.map(job => mapDetrackJobToBooking(job)) || [];

    // ✅ Determine target group
    const targetGroupId = userRole === 'customer' ? userGroupId : (groupId || null);

    // ✅ Filter by group if needed
    let filteredJobs = mappedJobs;
    if (targetGroupId) {
      const beforeFilter = mappedJobs.length;
      filteredJobs = mappedJobs.filter(job => 
        job.groupId === targetGroupId || job.group_id === targetGroupId
      );
      console.log(`🔒 Filtered ${beforeFilter} jobs to ${filteredJobs.length} jobs for group: ${targetGroupId}`);
    } else {
      console.log('👑 Showing ALL jobs (admin/staff)');
    }

    // ✅ Calculate the CORRECT total count
    let totalCount = 0;
    const currentPage = parseInt(page) || 1;
    const itemsPerPage = parseInt(limit) || 100;

    if (targetGroupId) {
      // ✅ For customers: We need to get the total count for this group
      // Option 1: If Detrack supports group_id filter, use it
      // Option 2: Count all jobs for this group by fetching all pages
      
      // For now, let's use the filtered count from the current page
      // BUT this is only the count for the current page, not the total
      // So we need to fetch ALL pages for customers to get correct total
      
      // ✅ SIMPLE FIX: Fetch all pages for customers to get correct total
      try {
        let allGroupJobs = [];
        let currentPageTemp = 1;
        let hasNextTemp = true;
        let safetyLimit = 0;
        
        // Fetch all pages (with safety limit of 20 pages)
        while (hasNextTemp && safetyLimit < 20) {
          const tempParams = { 
            ...queryParams, 
            page: currentPageTemp, 
            limit: 100 
          };
          
          const tempResponse = await DetrackService.getJobsWithFilters(tempParams);
          
          if (tempResponse?.data && tempResponse.data.length > 0) {
            const tempJobs = tempResponse.data.map(job => mapDetrackJobToBooking(job));
            const groupJobs = tempJobs.filter(job => 
              job.groupId === targetGroupId || job.group_id === targetGroupId
            );
            allGroupJobs = allGroupJobs.concat(groupJobs);
          }
          
          hasNextTemp = tempResponse?.links?.next !== null && tempResponse.data?.length > 0;
          currentPageTemp++;
          safetyLimit++;
        }
        
        totalCount = allGroupJobs.length;
        console.log(`📊 Total jobs for group ${targetGroupId}: ${totalCount}`);
        
        // ✅ Apply pagination to the filtered results
        const startIndex = (parseInt(page || 1) - 1) * itemsPerPage;
        const endIndex = Math.min(startIndex + itemsPerPage, allGroupJobs.length);
        filteredJobs = allGroupJobs.slice(startIndex, endIndex);
        
      } catch (error) {
        console.error('Error counting group jobs:', error);
        // Fallback: use the filtered count from the current page
        totalCount = filteredJobs.length;
      }
    } else {
      // ✅ Admin/Staff: Use Detrack's total_count
      totalCount = response?.total_count || 0;
    }

    const totalPages = Math.ceil(totalCount / itemsPerPage) || 1;
    const hasNext = currentPage < totalPages;

    console.log(`📊 Total jobs: ${totalCount}, Pages: ${totalPages}, Current: ${currentPage}`);

    return res.json({
      success: true,
      data: filteredJobs,
      source: 'detrack',
      meta: {
        total: totalCount,  // ✅ Now this is the CORRECT filtered total
        page: currentPage,
        limit: itemsPerPage,
        hasNext: hasNext,
        totalPages: totalPages,
        date: date,
        groupId: targetGroupId,
        role: userRole
      },
      links: response?.links || null,
      total_count: totalCount  // ✅ Also return as total_count
    });

  } catch (error) {
    console.error('❌ Fetch Detrack jobs error:', error.message);
    return res.status(500).json({
      error: 'Failed to fetch jobs from Detrack',
      details: error.response?.data?.message || error.message
    });
  }
};
// ===== CANCEL JOB =====
exports.cancelJob = async (req, res) => {
  try {
    const { doNumber } = req.params;
    const userId = req.user.id;
    const userRole = req.user.role;
    const userGroupId = req.user.group_id;

    if (!doNumber) {
      return res.status(400).json({ error: 'DO number is required' });
    }

    console.log(`🚫 Cancelling job: ${doNumber} by user ${userId}`);

    // 1. Check if job exists in Detrack
    let detrackJob = null;
    try {
      detrackJob = await DetrackService.getJobByDoNumber(doNumber);
    } catch (error) {
      console.error('Error fetching job from Detrack:', error.message);
    }

    // 2. Check if job exists in database
    let job = await Job.findByDoNumberAny(doNumber);

    // 3. If job doesn't exist in either, return error
    if (!job && !detrackJob) {
      return res.status(404).json({ 
        error: 'Job not found',
        message: `No job found with DO number: ${doNumber}`
      });
    }

    // 4. Check if job is already completed or cancelled
    const currentStatus = job?.status || detrackJob?.status || detrackJob?.primary_job_status || '';
    
    if (currentStatus === 'completed' || currentStatus === 'delivered') {
      return res.status(400).json({
        error: 'Cannot cancel completed job',
        message: `Job ${doNumber} is already ${currentStatus}`
      });
    }

    if (currentStatus === 'cancelled') {
      return res.status(400).json({
        error: 'Job already cancelled',
        message: `Job ${doNumber} is already cancelled`
      });
    }

    // 5. Cancel in Detrack (if job exists there)
    let detrackResult = null;
    if (detrackJob) {
      try {
        detrackResult = await DetrackService.cancelJob(doNumber);
        console.log(`✅ Job ${doNumber} cancelled in Detrack`);
      } catch (detrackError) {
        console.error('❌ Failed to cancel in Detrack:', detrackError.message);
        // Continue with database update even if Detrack fails
      }
    }

    // 6. Update or create job in database with cancelled status
    if (job) {
      await Job.updateStatus(doNumber, 'cancelled');
      console.log(`✅ Job ${doNumber} status updated to cancelled in database`);
    } else if (detrackJob) {
      // Create job record if it doesn't exist (sync from Detrack)
      const jobData = {
        do_number: doNumber,
        customer_name: detrackJob.deliver_to_collect_from || detrackJob.deliver_to || 'Unknown',
        customer_company: detrackJob.company_name || '',
        phone: detrackJob.phone || detrackJob.phone_number || '',
        delivery_address: detrackJob.address || '',
        postcode: detrackJob.postal_code || '',
        recipient_name: detrackJob.deliver_to_collect_from || detrackJob.deliver_to || 'Unknown',
        recipient_phone: detrackJob.phone || detrackJob.phone_number || '',
        boxes: detrackJob.number_of_shipping_labels || detrackJob.cartons || detrackJob.boxes || 1,
        weight: detrackJob.weight || 0,
        contents: detrackJob.note || '',
        status: 'cancelled',
        scheduled_date: detrackJob.date || new Date().toISOString().split('T')[0],
        special_instructions: detrackJob.instructions || '',
        barcodes: [],
        detrack_id: detrackJob.id || '',
        source: 'detrack_sync',
        group_name: detrackJob.group_name || '',
        group_id: detrackJob.group_id || '',
        pickup_address: '',
        user_id: userId,
        state: detrackJob.state || '',
        city: detrackJob.city || ''
      };
      await Job.create(jobData);
      console.log(`✅ Job ${doNumber} created in database with cancelled status`);
    }

    res.json({
      success: true,
      message: `Job ${doNumber} cancelled successfully`,
      do_number: doNumber,
      status: 'cancelled',
      detrack_synced: !!detrackResult
    });

  } catch (error) {
    console.error('❌ Cancel job error:', error);
    res.status(500).json({
      error: 'Failed to cancel job',
      details: error.message
    });
  }
};

// src/controllers/jobController.js - Update Job

exports.updateJob = async (req, res) => {
  try {
    const { doNumber } = req.params;
    const userId = req.user.id;
    const userRole = req.user.role;
    const userGroupId = req.user.group_id;
    const updateData = req.body;

    if (!doNumber) {
      return res.status(400).json({ error: 'DO number is required' });
    }

    console.log(`✏️ Updating job: ${doNumber} by user ${userId}`);
    console.log('📦 Received update data:', JSON.stringify(updateData, null, 2));

    // 1. Check if job exists in Detrack
    let detrackJob = null;
    try {
      detrackJob = await DetrackService.getJobByDoNumber(doNumber);
    } catch (error) {
      console.error('Error fetching job from Detrack:', error.message);
    }

    if (!detrackJob) {
      return res.status(404).json({ 
        error: 'Job not found in Detrack',
        message: `No job found with DO number: ${doNumber}`
      });
    }

    // 2. Check if job is completed (cannot update completed jobs)
    const currentStatus = detrackJob.status || detrackJob.primary_job_status || '';
    if (currentStatus === 'completed' || currentStatus === 'delivered') {
      return res.status(400).json({
        error: 'Cannot update completed job',
        message: `Job ${doNumber} is already ${currentStatus}`
      });
    }

    if (currentStatus === 'cancelled') {
      return res.status(400).json({
        error: 'Cannot update cancelled job',
        message: `Job ${doNumber} is already cancelled`
      });
    }

    // 3. Build update payload with CORRECT field mappings
    const payload = {};
    
    // Address fields
    if (updateData.address) payload.address = updateData.address;
    if (updateData.address_1) payload.address_1 = updateData.address_1;
    if (updateData.address_2) payload.address_2 = updateData.address_2;
    if (updateData.city) payload.city = updateData.city;
    if (updateData.state) payload.state = updateData.state;
    if (updateData.postal_code) payload.postal_code = updateData.postal_code;
    if (updateData.country) payload.country = updateData.country;
    
    // Recipient fields
    if (updateData.deliver_to) payload.deliver_to = updateData.deliver_to;
    
    // 👇 FIX: Use 'phone_number' for Detrack
    if (updateData.phone) payload.phone_number = updateData.phone;
    
    if (updateData.instructions) payload.instructions = updateData.instructions;
    if (updateData.company_name) payload.company_name = updateData.company_name;
    if (updateData.notify_email) payload.notify_email = updateData.notify_email;
    if (updateData.time_window) payload.time_window = updateData.time_window;
    if (updateData.date) payload.date = updateData.date;
    if (updateData.weight) payload.weight = parseFloat(updateData.weight);
    
    // 👇 FIX: Use 'number_of_shipping_labels' for Detrack
    if (updateData.boxes) payload.number_of_shipping_labels = parseInt(updateData.boxes);
    if (updateData.cartons) payload.cartons = parseInt(updateData.cartons);
    
    // Also set boxes for Detrack (some versions use this)
    if (updateData.boxes) payload.boxes = String(parseInt(updateData.boxes));

    // Log what we're sending
    console.log('📤 Detrack update payload:', JSON.stringify(payload, null, 2));

    // 4. Update in Detrack
    const detrackResult = await DetrackService.updateJob(doNumber, payload);
    console.log(`✅ Job ${doNumber} updated in Detrack`);

    // 5. Update in database if exists
    let job = await Job.findByDoNumberAny(doNumber);
    if (job) {
      const dbUpdateData = {
        customer_name: updateData.deliver_to || detrackJob.deliver_to_collect_from || detrackJob.deliver_to || job.customer_name,
        customer_company: updateData.company_name || detrackJob.company_name || job.customer_company,
        phone: updateData.phone || detrackJob.phone_number || detrackJob.phone || job.phone,
        delivery_address: updateData.address || detrackJob.address || job.delivery_address,
        postcode: updateData.postal_code || detrackJob.postal_code || job.postcode,
        recipient_name: updateData.deliver_to || detrackJob.deliver_to_collect_from || detrackJob.deliver_to || job.recipient_name,
        recipient_phone: updateData.phone || detrackJob.phone_number || detrackJob.phone || job.recipient_phone,
        scheduled_date: updateData.date || detrackJob.date || job.scheduled_date,
        special_instructions: updateData.instructions || detrackJob.instructions || job.special_instructions,
        boxes: updateData.boxes || job.boxes || detrackJob.number_of_shipping_labels || detrackJob.cartons || 1,
        weight: updateData.weight || job.weight || detrackJob.weight || 0,
        contents: job.contents || detrackJob.note || '',
        status: job.status || detrackJob.status || detrackJob.primary_job_status || 'pending',
        barcodes: job.barcodes || [],
        group_name: job.group_name || detrackJob.group_name || '',
        group_id: job.group_id || detrackJob.group_id || '',
        state: updateData.state || detrackJob.state || job.state || '',
        city: updateData.city || detrackJob.city || job.city || '',
        country: updateData.country || detrackJob.country || job.country || 'Australia',
        address_1: updateData.address_1 || detrackJob.address_1 || job.address_1 || '',
        address_2: updateData.address_2 || detrackJob.address_2 || job.address_2 || '',
      };
      
      await Job.update(doNumber, dbUpdateData);
      console.log(`✅ Job ${doNumber} updated in database`);
    }

    // 6. Return success response
    res.json({
      success: true,
      message: `Job ${doNumber} updated successfully`,
      do_number: doNumber,
      updated_fields: payload
    });

  } catch (error) {
    console.error('❌ Update job error:', error);
    res.status(500).json({
      error: 'Failed to update job',
      details: error.message
    });
  }
};

// ===== DOWNLOAD POD FOR A JOB =====
exports.downloadPod = async (req, res) => {
  try {
    const { doNumber } = req.params;

    if (!doNumber) {
      return res.status(400).json({ error: 'DO number is required' });
    }

    console.log(`📄 Downloading POD for DO: ${doNumber}`);

    const job = await DetrackService.getJobByDoNumber(doNumber);

    if (!job) {
      return res.status(404).json({ error: 'Job not found' });
    }

    if (job.status !== 'completed' && job.status !== 'delivered') {
      return res.status(400).json({
        error: 'POD not available',
        message: 'Job is not completed yet. POD is only available for completed jobs.'
      });
    }

    const jobId = job.id || job._id;
    
    if (!jobId) {
      return res.status(404).json({
        error: 'Job ID not found',
        message: 'Could not find job ID for this job.'
      });
    }

    console.log(`📄 Job ID: ${jobId}`);

    const podUrl = `https://app.detrack.com/api/v2/jobs/export/${jobId}.pdf`;
    
    console.log(`📄 POD URL: ${podUrl}`);

    const response = await axios.get(podUrl, {
      responseType: 'arraybuffer',
      headers: {
        'X-API-KEY': process.env.DETRACK_API_KEY,
        'User-Agent': 'curl/7.68.0'
      },
      timeout: 30000
    });

    const contentType = response.headers['content-type'] || 'application/pdf';
    
    if (!contentType.includes('pdf') && !contentType.includes('application/octet-stream')) {
      console.log('⚠️ Unexpected content type:', contentType);
    }

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="POD_${doNumber}.pdf"`);
    res.setHeader('Content-Length', response.data.length);
    res.send(response.data);

    console.log(`✅ POD downloaded for ${doNumber}`);

  } catch (error) {
    console.error('❌ Download POD error:', error.message);
    
    if (error.response?.status === 404) {
      return res.status(404).json({
        error: 'POD not available',
        message: 'Could not download POD. The job may not have a POD document yet.',
        trackingLink: job.tracking_link || null
      });
    }

    res.status(500).json({
      error: 'Failed to download POD',
      details: error.message
    });
  }
};

// ===== GET GROUPS =====
exports.getGroups = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const search = req.query.search || '';

    console.log(`📡 Getting groups: page=${page}, limit=${limit}, search=${search}`);

    const result = await DetrackService.getGroups(page, limit, search);

    res.json({
      success: true,
      data: result
    });
  } catch (error) {
    console.error('❌ Get groups error:', error);
    res.status(500).json({
      error: 'Failed to fetch groups',
      details: error.message
    });
  }
};

// ===== SEARCH ALL GROUPS =====
exports.searchAllGroups = async (req, res) => {
  try {
    const search = req.query.search || '';

    console.log(`📡 Searching all groups with term: "${search}"`);

    const groups = await DetrackService.searchAllGroups(search);

    res.json({
      success: true,
      data: groups
    });
  } catch (error) {
    console.error('❌ Search groups error:', error);
    res.status(500).json({
      error: 'Failed to search groups',
      details: error.message
    });
  }
};

// ===== FETCH JOBS FROM DETRACK API =====
exports.getDetrackJobs = async (req, res) => {
  try {
    console.log('📡 Fetching jobs from Detrack...');
    const response = await DetrackService.getJobs();
    console.log('✅ Fetched ' + (response?.data?.length || 0) + ' jobs from Detrack');
    return res.json({
      success: true,
      data: response
    });
  } catch (error) {
    console.error('❌ Fetch jobs error:', error.message);
    return res.status(500).json({
      error: 'Failed to fetch jobs from Detrack',
      details: error.response?.data?.message || error.message
    });
  }
};

// ===== FETCH SINGLE JOB FROM DETRACK API =====
exports.getDetrackJob = async (req, res) => {
  try {
    const jobId = req.params.id;
    console.log('📡 Fetching job ' + jobId + ' from Detrack...');
    const response = await DetrackService.getJobById(jobId);
    return res.json({
      success: true,
      data: response
    });
  } catch (error) {
    console.error('❌ Fetch job error:', error.message);
    return res.status(500).json({
      error: 'Failed to fetch job',
      details: error.response?.data?.message || error.message
    });
  }
};

// ===== GET BOX STATUS =====
exports.getBoxStatus = async (req, res) => {
  try {
    // ✅ FIX: Decode the DO number from URL parameter
    let do_number = req.params.do_number;
    
    if (do_number) {
      try {
        do_number = decodeURIComponent(do_number);
        console.log(`📦 Decoded DO number: ${do_number}`);
      } catch (e) {
        console.log(`⚠️ Could not decode do_number: ${do_number}`);
      }
    }
    
    const userId = req.user.id;
    const userRole = req.user.role;
    const userGroupId = req.user.group_id;

    let job;

    if (userRole === 'admin' || userRole === 'staff') {
      const query = 'SELECT barcodes, scans FROM jobs WHERE do_number = $1';
      const result = await pool.query(query, [do_number]);
      job = result.rows[0];
    } else {
      const query = `
        SELECT barcodes, scans FROM jobs 
        WHERE do_number = $1 AND group_id = $2
      `;
      const result = await pool.query(query, [do_number, userGroupId]);
      job = result.rows[0];

      if (!job) {
        job = await Job.getBoxStatus(userId, do_number);
      }
    }

    // If job not in database, try Detrack
    if (!job) {
      console.log(`📡 Job ${do_number} not in DB, checking Detrack...`);
      
      try {
        const detrackJob = await DetrackService.getJobByDoNumber(do_number);
        
        if (!detrackJob) {
          return res.status(404).json({ 
            error: 'Job not found in Detrack or database',
            do_number: do_number
          });
        }

        // Generate barcodes from Detrack data
        const shippingLabels = detrackJob.number_of_shipping_labels || 
                              detrackJob.cartons || 
                              detrackJob.boxes || 1;
        
        let barcodes = [];
        for (let i = 0; i < shippingLabels; i++) {
          barcodes.push(`${do_number}-${String(i + 1).padStart(2, '0')}`);
        }

        let scans = [];
        if (detrackJob.milestones && detrackJob.milestones.length > 0) {
          scans = detrackJob.milestones
            .filter(m => m.status === 'completed' || m.status === 'delivered')
            .map(m => ({
              barcode: do_number,
              checkpoint: m.status,
              timestamp: m.pod_at || m.created_at,
              staff: m.user_name || 'System',
              location: m.pod_address || detrackJob.address || '',
              scanned_by: m.user_name || 'System'
            }));
        }

        if ((detrackJob.status === 'completed' || detrackJob.status === 'delivered') && scans.length === 0) {
          scans = barcodes.map(code => ({
            barcode: code,
            checkpoint: 'Delivered',
            timestamp: detrackJob.pod_at || detrackJob.updated_at || new Date().toISOString(),
            staff: 'System',
            location: detrackJob.address || '',
            scanned_by: 'System'
          }));
        }

        job = {
          barcodes: barcodes,
          scans: scans
        };

        // Sync to database
        try {
          const jobData = {
            do_number: do_number,
            customer_name: detrackJob.deliver_to_collect_from || detrackJob.deliver_to || 'Unknown',
            customer_company: detrackJob.company_name || '',
            phone: detrackJob.phone || detrackJob.phone_number || '',
            delivery_address: detrackJob.address || '',
            postcode: detrackJob.postal_code || '',
            recipient_name: detrackJob.deliver_to_collect_from || detrackJob.deliver_to || 'Unknown',
            recipient_phone: detrackJob.phone || detrackJob.phone_number || '',
            boxes: shippingLabels,
            weight: detrackJob.weight || 0,
            contents: detrackJob.note || '',
            status: detrackJob.status || detrackJob.primary_job_status || 'pending',
            scheduled_date: detrackJob.date || new Date().toISOString().split('T')[0],
            special_instructions: detrackJob.instructions || '',
            barcodes: barcodes,
            detrack_id: detrackJob.id || '',
            source: 'detrack_sync',
            group_name: detrackJob.group_name || '',
            group_id: detrackJob.group_id || '',
            pickup_address: '',
            user_id: userId,
            state: detrackJob.state || '',
            city: detrackJob.city || ''
          };

          const existingJob = await Job.findByDoNumberAny(do_number);
          if (!existingJob) {
            await Job.create(jobData);
            console.log(`✅ Job ${do_number} synced to database`);
          } else {
            await Job.update(do_number, jobData);
            console.log(`✅ Job ${do_number} updated in database`);
          }
        } catch (dbError) {
          console.warn(`⚠️ Could not save job ${do_number} to database:`, dbError.message);
        }

      } catch (detrackError) {
        console.error(`❌ Failed to fetch job ${do_number} from Detrack:`, detrackError.message);
        return res.status(404).json({ 
          error: 'Job not found',
          do_number: do_number,
          details: detrackError.message
        });
      }
    }

    // Parse barcodes and scans
    let barcodes = job.barcodes || [];
    let scans = job.scans || [];

    if (typeof barcodes === 'string') {
      try { barcodes = JSON.parse(barcodes); } catch (e) { barcodes = []; }
    }
    if (typeof scans === 'string') {
      try { scans = JSON.parse(scans); } catch (e) { scans = []; }
    }

    // Build box status
    var scannedBarcodes = scans.map(function (s) { return s.barcode; });

    var boxStatus = barcodes.map(function (barcode) {
      var scan = scans.find(function (s) { return s.barcode === barcode; });
      return {
        barcode: barcode,
        scanned: !!scan,
        scanTime: scan?.timestamp || null,
        scannedBy: scan?.scanned_by || scan?.staff || null,
        location: scan?.location || null,
        checkpoint: scan?.checkpoint || 'Pending'
      };
    });

    res.json({
      success: true,
      data: {
        do_number: do_number,
        totalBoxes: barcodes.length,
        scannedCount: scannedBarcodes.length,
        remainingCount: barcodes.length - scannedBarcodes.length,
        allScanned: scannedBarcodes.length === barcodes.length,
        boxStatus: boxStatus
      }
    });

  } catch (error) {
    console.error('❌ Get box status error:', error);
    res.status(500).json({
      error: 'Failed to get box status',
      details: error.message
    });
  }
};

// ===== SCAN BOX =====
exports.scanBox = async (req, res) => {
  try {
    // ✅ FIX: Get and decode do_number if it was URL-encoded
    let do_number = req.body.do_number;
    let barcode = req.body.barcode;
    
    // If do_number was passed as URL parameter (not likely, but safe)
    if (req.params.do_number) {
      do_number = decodeURIComponent(req.params.do_number);
    }
    
    // ✅ Decode the DO number in case it was encoded
    if (do_number && typeof do_number === 'string') {
      try {
        do_number = decodeURIComponent(do_number);
      } catch (e) {
        // If decoding fails, use as-is
        console.log(`⚠️ Could not decode do_number: ${do_number}`);
      }
    }
    
    // ✅ Also decode barcode if needed
    if (barcode && typeof barcode === 'string') {
      try {
        barcode = decodeURIComponent(barcode);
      } catch (e) {
        // If decoding fails, use as-is
      }
    }

    console.log(`📦 Scanning box: ${barcode} for job: ${do_number}`);
    
    const location = req.body.location || 'Warehouse';
    const userId = req.user.id;
    const userRole = req.user.role;
    const userGroupId = req.user.group_id;

    if (!do_number || !barcode) {
      return res.status(400).json({ 
        error: 'Missing required fields: do_number and barcode' 
      });
    }

    let job;

    if (userRole === 'admin' || userRole === 'staff') {
      const query = 'SELECT barcodes, scans FROM jobs WHERE do_number = $1';
      const result = await pool.query(query, [do_number]);
      job = result.rows[0];
    } else {
      const query = `
        SELECT barcodes, scans FROM jobs 
        WHERE do_number = $1 AND group_id = $2
      `;
      const result = await pool.query(query, [do_number, userGroupId]);
      job = result.rows[0];

      if (!job) {
        job = await Job.getBoxStatus(userId, do_number);
      }
    }

    // If job not found, try to fetch from Detrack
    if (!job) {
      console.log(`📡 Job ${do_number} not in DB, attempting to sync...`);
      try {
        const detrackJob = await DetrackService.getJobByDoNumber(do_number);
        if (detrackJob) {
          // Sync job to database first
          const shippingLabels = detrackJob.number_of_shipping_labels || 
                                detrackJob.cartons || 
                                detrackJob.boxes || 1;
          let barcodes = [];
          for (let i = 0; i < shippingLabels; i++) {
            barcodes.push(`${do_number}-${String(i + 1).padStart(2, '0')}`);
          }

          const jobData = {
            do_number: do_number,
            customer_name: detrackJob.deliver_to_collect_from || detrackJob.deliver_to || 'Unknown',
            customer_company: detrackJob.company_name || '',
            phone: detrackJob.phone || detrackJob.phone_number || '',
            delivery_address: detrackJob.address || '',
            postcode: detrackJob.postal_code || '',
            recipient_name: detrackJob.deliver_to_collect_from || detrackJob.deliver_to || 'Unknown',
            recipient_phone: detrackJob.phone || detrackJob.phone_number || '',
            boxes: shippingLabels,
            weight: detrackJob.weight || 0,
            contents: detrackJob.note || '',
            status: detrackJob.status || detrackJob.primary_job_status || 'pending',
            scheduled_date: detrackJob.date || new Date().toISOString().split('T')[0],
            special_instructions: detrackJob.instructions || '',
            barcodes: barcodes,
            detrack_id: detrackJob.id || '',
            source: 'detrack_sync',
            group_name: detrackJob.group_name || '',
            group_id: detrackJob.group_id || '',
            pickup_address: '',
            user_id: userId,
            state: detrackJob.state || '',
            city: detrackJob.city || ''
          };

          const existingJob = await Job.findByDoNumberAny(do_number);
          if (!existingJob) {
            await Job.create(jobData);
            console.log(`✅ Job ${do_number} synced to database`);
          } else {
            await Job.update(do_number, jobData);
            console.log(`✅ Job ${do_number} updated in database`);
          }

          // Now fetch the job again
          const query = 'SELECT barcodes, scans FROM jobs WHERE do_number = $1';
          const result = await pool.query(query, [do_number]);
          job = result.rows[0];
        }
      } catch (syncError) {
        console.error(`❌ Failed to sync job ${do_number}:`, syncError.message);
        return res.status(404).json({ 
          error: 'Job not found. Please generate labels first.',
          do_number: do_number
        });
      }
    }

    if (!job) {
      return res.status(404).json({ 
        error: 'Job not found. Please generate labels first.',
        do_number: do_number
      });
    }

    // Parse barcodes and scans
    let barcodes = job.barcodes || [];
    let scans = job.scans || [];

    if (typeof barcodes === 'string') {
      try { barcodes = JSON.parse(barcodes); } catch (e) { barcodes = []; }
    }
    if (typeof scans === 'string') {
      try { scans = JSON.parse(scans); } catch (e) { scans = []; }
    }

    // Check if barcode is valid for this job
    if (!barcodes.includes(barcode)) {
      return res.status(400).json({ 
        error: 'Invalid barcode for this job',
        barcode: barcode,
        expectedBarcodes: barcodes
      });
    }

    // Check if already scanned
    var existingScan = scans.find(function (s) { return s.barcode === barcode; });
    if (existingScan) {
      return res.status(400).json({
        error: 'Box already scanned',
        scan: existingScan
      });
    }

    // Add the scan
    var newScan = {
      barcode: barcode,
      checkpoint: 'Scanned',
      timestamp: new Date().toISOString(),
      staff: (req.user?.first_name || '') + ' ' + (req.user?.last_name || '') || 'System',
      location: location || 'Warehouse',
      scanned_by: req.user?.email || 'system'
    };

    scans.push(newScan);

    // Update database
    if (userRole === 'admin' || userRole === 'staff') {
      await pool.query(
        'UPDATE jobs SET scans = $1, updated_at = CURRENT_TIMESTAMP WHERE do_number = $2',
        [JSON.stringify(scans), do_number]
      );
    } else {
      await Job.updateScans(userId, do_number, scans);
    }

    var scannedCount = scans.length;
    var totalBoxes = barcodes.length;

    console.log('✅ Box ' + barcode + ' scanned for job ' + do_number + ' by ' + req.user?.email);

    res.json({
      success: true,
      message: 'Box scanned successfully',
      data: {
        do_number: do_number,
        barcode: barcode,
        scan: newScan,
        totalBoxes: totalBoxes,
        scannedCount: scannedCount,
        remainingBoxes: totalBoxes - scannedCount,
        allScanned: scannedCount === totalBoxes
      }
    });

  } catch (error) {
    console.error('❌ Scan box error:', error);
    res.status(500).json({
      error: 'Failed to scan box',
      details: error.message
    });
  }
};
// ===== BULK SCAN =====
exports.bulkScan = async (req, res) => {
  try {
    const { do_number, barcodes: scannedBarcodes, location } = req.body;
    const userId = req.user.id;
    const userRole = req.user.role;
    const userGroupId = req.user.group_id;

    let job;

    if (userRole === 'admin' || userRole === 'staff') {
      const query = 'SELECT barcodes, scans FROM jobs WHERE do_number = $1';
      const result = await pool.query(query, [do_number]);
      job = result.rows[0];
    } else {
      const query = `
        SELECT barcodes, scans FROM jobs 
        WHERE do_number = $1 AND group_id = $2
      `;
      const result = await pool.query(query, [do_number, userGroupId]);
      job = result.rows[0];

      if (!job) {
        job = await Job.getBoxStatus(userId, do_number);
      }
    }

    if (!job) {
      return res.status(404).json({ error: 'Job not found' });
    }

    let barcodes = job.barcodes || [];
    let scans = job.scans || [];

    if (typeof barcodes === 'string') {
      try { barcodes = JSON.parse(barcodes); } catch (e) { barcodes = []; }
    }
    if (typeof scans === 'string') {
      try { scans = JSON.parse(scans); } catch (e) { scans = []; }
    }

    var scanned = [];
    var errors = [];

    for (var barcode of scannedBarcodes) {
      if (!barcodes.includes(barcode)) {
        errors.push({ barcode: barcode, error: 'Invalid barcode for this job' });
        continue;
      }

      var existingScan = scans.find(function (s) { return s.barcode === barcode; });
      if (existingScan) {
        errors.push({ barcode: barcode, error: 'Already scanned' });
        continue;
      }

      var newScan = {
        barcode: barcode,
        checkpoint: 'Scanned',
        timestamp: new Date().toISOString(),
        staff: (req.user?.first_name || '') + ' ' + (req.user?.last_name || '') || 'System',
        location: location || 'Warehouse',
        scanned_by: req.user?.email || 'system'
      };

      scans.push(newScan);
      scanned.push(barcode);
    }

    if (userRole === 'admin' || userRole === 'staff') {
      await pool.query(
        'UPDATE jobs SET scans = $1, updated_at = CURRENT_TIMESTAMP WHERE do_number = $2',
        [JSON.stringify(scans), do_number]
      );
    } else {
      await Job.updateScans(userId, do_number, scans);
    }

    console.log('✅ Bulk scanned ' + scanned.length + ' boxes for ' + do_number);

    res.json({
      success: true,
      message: scanned.length + ' boxes scanned successfully',
      data: {
        do_number: do_number,
        scanned: scanned,
        errors: errors,
        totalScanned: scans.length,
        totalBoxes: barcodes.length,
        allScanned: scans.length === barcodes.length
      }
    });

  } catch (error) {
    console.error('❌ Bulk scan error:', error);
    res.status(500).json({
      error: 'Failed to process bulk scan',
      details: error.message
    });
  }
};

// ===== GET DASHBOARD STATISTICS =====
exports.getDashboardStats = async (req, res) => {
  try {
    var userId = req.user.id;
    var userRole = req.user.role;
    var userGroupId = req.user.group_id;

    console.log('📊 Fetching dashboard stats for user ' + userId + ' (' + userRole + ')');

    var jobQuery = '';
    var jobParams = [];

    if (userRole === 'admin' || userRole === 'staff') {
      jobQuery = `
        SELECT 
          do_number,
          customer_name,
          recipient_name,
          boxes,
          created_at,
          scheduled_date,
          delivery_address,
          postcode,
          group_id,
          group_name
        FROM jobs
        ORDER BY created_at DESC
      `;
    } else if (userGroupId) {
      jobQuery = `
        SELECT 
          do_number,
          customer_name,
          recipient_name,
          boxes,
          created_at,
          scheduled_date,
          delivery_address,
          postcode,
          group_id,
          group_name
        FROM jobs
        WHERE group_id = $1
        ORDER BY created_at DESC
      `;
      jobParams = [userGroupId];
    } else {
      jobQuery = `
        SELECT 
          do_number,
          customer_name,
          recipient_name,
          boxes,
          created_at,
          scheduled_date,
          delivery_address,
          postcode,
          group_id,
          group_name
        FROM jobs
        WHERE user_id = $1
        ORDER BY created_at DESC
      `;
      jobParams = [userId];
    }

    var jobResult = await pool.query(jobQuery, jobParams);
    var jobs = jobResult.rows;

    console.log('📦 Found ' + jobs.length + ' jobs');

    if (jobs.length === 0) {
      return res.json({
        success: true,
        data: {
          stats: {
            totalJobs: 0,
            totalBoxes: 0,
            todayJobs: 0,
            totalCustomers: 0
          },
          recentJobs: [],
          jobsByDate: [],
          todayJobsList: []
        }
      });
    }

    var totalJobs = jobs.length;
    var totalBoxes = 0;
    var customerSet = {};
    var today = new Date();
    today.setHours(0, 0, 0, 0);
    var todayStr = today.toISOString().split('T')[0];
    var todayJobs = [];
    var jobsByDateMap = {};

    for (var i = 0; i < jobs.length; i++) {
      var job = jobs[i];
      var boxes = parseInt(job.boxes) || 1;
      var scheduledDate = job.scheduled_date;
      var customerName = job.customer_name || job.recipient_name || 'Unknown';

      totalBoxes += boxes;

      if (customerName && customerName !== 'Unknown') {
        customerSet[customerName] = true;
      }

      if (scheduledDate === todayStr) {
        todayJobs.push({
          reference: job.do_number,
          customerName: customerName,
          recipientName: job.recipient_name || job.customer_name || 'Unknown',
          deliveryAddress: job.delivery_address || '',
          postcode: job.postcode || '',
          boxes: boxes,
          scheduledDate: scheduledDate,
          groupName: job.group_name || ''
        });
      }

      if (scheduledDate) {
        var dateKey = scheduledDate;
        if (!jobsByDateMap[dateKey]) {
          jobsByDateMap[dateKey] = {
            date: dateKey,
            count: 0,
            boxes: 0
          };
        }
        jobsByDateMap[dateKey].count++;
        jobsByDateMap[dateKey].boxes += boxes;
      }
    }

    var jobsByDate = Object.keys(jobsByDateMap)
      .sort()
      .slice(-7)
      .map(function (key) {
        var dateObj = new Date(key);
        return {
          date: key,
          day: dateObj.toLocaleDateString('en-US', { weekday: 'short' }),
          count: jobsByDateMap[key].count,
          boxes: jobsByDateMap[key].boxes
        };
      });

    var recentJobs = jobs.slice(0, 10).map(function (job) {
      return {
        reference: job.do_number,
        customerName: job.customer_name || job.recipient_name || 'Unknown',
        recipientName: job.recipient_name || job.customer_name || 'Unknown',
        boxes: parseInt(job.boxes) || 1,
        createdAt: job.created_at,
        scheduledDate: job.scheduled_date,
        deliveryAddress: job.delivery_address || '',
        postcode: job.postcode || '',
        groupName: job.group_name || ''
      };
    });

    var stats = {
      totalJobs: totalJobs,
      totalBoxes: totalBoxes,
      todayJobs: todayJobs.length,
      totalCustomers: Object.keys(customerSet).length
    };

    console.log('📊 Stats:', stats);

    res.json({
      success: true,
      data: {
        stats: stats,
        recentJobs: recentJobs,
        jobsByDate: jobsByDate,
        todayJobsList: todayJobs
      }
    });

  } catch (error) {
    console.error('❌ Dashboard stats error:', error);
    res.status(500).json({
      error: 'Failed to fetch dashboard statistics',
      details: error.message
    });
  }
};

// ===== UPLOAD COLLECTION MANIFEST =====
exports.uploadCollectionManifest = async (req, res) => {
  try {
    const userId = req.user.id;
    const userRole = req.user.role;
    const userGroupId = req.user.group_id;
    const userGroupName = req.user.group_name;

    console.log(`📁 Collection file upload received from user ${userId}`);
    console.log('📄 File name:', req.file.originalname);
    console.log('📏 File size:', req.file.size, 'bytes');

    const workbook = xlsx.read(req.file.buffer, { type: 'buffer' });
    const sheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[sheetName];
    const rawData = xlsx.utils.sheet_to_json(worksheet, { header: 1, defval: '' });

    console.log('📊 Total rows in Excel:', rawData.length);

    let headerRowIndex = -1;
    let dataStartIndex = -1;

    for (let i = 0; i < rawData.length; i++) {
      const row = rawData[i];
      if (row && row.length > 0) {
        const rowStr = row.join(' ').toLowerCase();
        if (rowStr.includes('d.o. no') || rowStr.includes('do no') || rowStr.includes('tracking no')) {
          headerRowIndex = i;
          dataStartIndex = i + 1;
          break;
        }
      }
    }

    if (headerRowIndex === -1) {
      return res.status(400).json({ error: 'No header row found in Excel file' });
    }

    console.log('📊 Header row found at index:', headerRowIndex);
    console.log('📊 Data starts at row:', dataStartIndex);

    const headers = rawData[headerRowIndex].map(function (h) { return h?.toString().trim() || ''; });
    console.log('📊 Headers:', headers);

    const dataRows = [];

    for (let i = dataStartIndex; i < rawData.length; i++) {
      const row = rawData[i];
      if (!row || row.every(function (cell) { return !cell || cell === ''; })) {
        console.log(`⏭️ Skipping empty row ${i}`);
        continue;
      }
      const obj = {};
      headers.forEach(function (header, idx) {
        obj[header.trim()] = row[idx] || '';
      });
      dataRows.push(obj);
    }

    console.log(`📊 Found ${dataRows.length} data rows`);

    const validRows = [];
    const errors = [];
    const doNumbers = [];

    for (let i = 0; i < dataRows.length; i++) {
      const row = dataRows[i];
      const rowErrors = [];
      const hasData = Object.values(row).some(function (v) { return v && v !== ''; });
      if (!hasData) continue;

      const doNumber = getValue(row, 'D.O. No.', 'Tracking No.', 'DO No');
      const address = getValue(row, 'Address 1', 'Address');
      const collectFrom = getValue(row, 'Collect From', 'Collect from', 'Sender Name', 'collect_from');

      if (!doNumber) rowErrors.push('Missing D.O. No.');
      if (!address) rowErrors.push('Missing Address');
      if (!collectFrom) rowErrors.push('Missing Collect From');

      if (rowErrors.length > 0) {
        errors.push({ row: i + 1, doNumber: doNumber || 'Unknown', errors: rowErrors });
      } else {
        validRows.push(row);
        doNumbers.push(doNumber.toString().trim());
      }
    }

    console.log(`✅ Valid rows: ${validRows.length}`);
    console.log(`❌ Errors: ${errors.length}`);

    if (validRows.length === 0) {
      return res.status(400).json({
        error: 'No valid rows found in the Excel file',
        errors: errors,
        sampleData: dataRows.slice(0, 3)
      });
    }

    console.log('🔍 Checking for duplicate DO numbers in collections database...');
    const duplicateCheck = await Collection.checkDoNumbersExists(doNumbers);
    const duplicateDoNumbers = Object.keys(duplicateCheck).filter(key => duplicateCheck[key] === true);

    if (duplicateDoNumbers.length > 0) {
      console.log(`❌ Found ${duplicateDoNumbers.length} duplicate DO numbers:`, duplicateDoNumbers);
      return res.status(409).json({
        success: false,
        error: 'Duplicate DO numbers found in database',
        duplicateDoNumbers: duplicateDoNumbers,
        message: `The following DO numbers already exist in the collections database: ${duplicateDoNumbers.join(', ')}. Please remove or change them in your Excel file and try again.`
      });
    }

    console.log('✅ No duplicate DO numbers found. Proceeding with collection creation...');

    const collections = [];

    for (const row of validRows) {
      const doNumber = getValue(row, 'D.O. No.', 'Tracking No.', 'DO No', 'Order No.').toString().trim();
      const dateStr = getValidDate(getValue(row, 'Date', 'Processing Date'));
      const address = getValue(row, 'Address 1', 'Address');
      const address2 = getValue(row, 'Address 2');
      const city = getValue(row, 'City');
      const state = getValue(row, 'State');
      const postalCode = getValue(row, 'Postal Code');
      const country = getValue(row, 'Country');
      const collectFrom = getValue(row, 'Collect From', 'Collect from', 'Sender Name', 'collect_from');

      const fullAddress = [address, address2, city, state, postalCode, country].filter(Boolean).join(', ');

      let groupId = getValue(row, 'Group ID', 'Group Id', 'GroupID', 'group_id');
      let groupName = getValue(row, 'Group Name', 'Group', 'group_name', 'group');

      if (userRole === 'customer' && userGroupId) {
        groupId = userGroupId;
        groupName = userGroupName || '';
      }

      const collection = {
        date: dateStr,
        do_number: doNumber || 'COL-' + Date.now(),
        address: fullAddress || address || 'Address not provided',
        collect_from: collectFrom || 'Unknown Sender',
        phone: getValue(row, 'Phone No.', 'Phone'),
        notify_email: getValue(row, 'Notify Email', 'Notify email'),
        instructions: getValue(row, 'Instructions'),
        group_id: groupId || '',
        group: groupName || '',
        collection_type: getValue(row, 'Collection Type', 'Job type', 'Home Collection'),
        collection_time: getValue(row, 'Time Window', '07:00-18:00'),
        address_1: address,
        address_2: address2,
        postal_code: postalCode,
        city: city,
        state: state,
        country: country,
        company_name: getValue(row, 'Company Name'),
        recipient_phone: getValue(row, 'Phone No.', 'Phone'),
        recipient_company: getValue(row, 'Company Name'),
        type: 'Collection'
      };

      collections.push(collection);
    }

    console.log(`📦 Processing ${collections.length} collections...`);

    const results = [];
    const failedJobs = [];
    const labels = [];

    for (let i = 0; i < collections.length; i++) {
      const collection = collections[i];
      console.log(`📤 Processing collection ${i + 1}/${collections.length}: ${collection.do_number}`);

      try {
        const detrackPayload = {
          do_number: collection.do_number,
          address: collection.address,
          collect_from: collection.collect_from,
          date: collection.date,
          phone: collection.phone,
          notify_email: collection.notify_email,
          instructions: collection.instructions,
          group_id: collection.group_id,
          group: collection.group,
          collection_type: collection.collection_type,
          collection_time: collection.collection_time,
          address_1: collection.address_1,
          address_2: collection.address_2,
          postal_code: collection.postal_code,
          city: collection.city,
          state: collection.state,
          country: collection.country,
          company_name: collection.company_name,
          type: 'Collection'
        };

        console.log(`📤 Sending to Detrack: ${collection.do_number}`);
        const response = await DetrackService.createCollectionJob(detrackPayload);

        if (response && response.data && response.data.id) {
          const detrackId = response.data.id;
          const barcodes = [collection.do_number];

          console.log(`✅ Collection ${collection.do_number} created in Detrack with ID: ${detrackId}`);

          const savedCollection = await Collection.create({
            do_number: collection.do_number,
            recipient_name: collection.collect_from || '',
            recipient_company: collection.company_name || '',
            collection_address: collection.address || '',
            postcode: collection.postal_code || '',
            city: collection.city || '',
            state: collection.state || '',
            country: collection.country || 'Australia',
            recipient_phone: collection.phone || '',
            special_instructions: collection.instructions || '',
            scheduled_date: collection.date || null,
            time_window: collection.collection_time || '07:00-18:00',
            collection_type: collection.collection_type || 'Home Collection',
            group_id: collection.group_id || '',
            group_name: collection.group || '',
            status: 'pending',
            detrack_id: detrackId,
            tracking_link: response.data.tracking_link || '',
            verification_code: response.data.verification_code || '',
            source: 'customer',
            user_id: userId
          });

          console.log(`✅ Collection ${collection.do_number} saved to database`);

          results.push({
            do_number: collection.do_number,
            status: 'success',
            detrack_id: detrackId,
            barcodes: barcodes
          });
        } else {
          console.log(`❌ Failed to create ${collection.do_number} in Detrack - No ID returned`);
          failedJobs.push({
            do_number: collection.do_number,
            error: 'Failed to create in Detrack - No ID returned'
          });
        }
      } catch (error) {
        console.error(`❌ Failed to create collection ${collection.do_number}:`, error.message);
        failedJobs.push({
          do_number: collection.do_number,
          error: error.response?.data?.message || error.message
        });
      }
    }

    console.log(`📊 Summary: ${results.length} created, ${failedJobs.length} failed`);

    return res.json({
      success: true,
      total: collections.length,
      created: results.length,
      failed: failedJobs.length,
      results: results,
      failedJobs: failedJobs,
      validationErrors: errors,
      labels: labels
    });

  } catch (error) {
    console.error('❌ Upload collection error:', error);
    return res.status(500).json({
      error: 'Failed to process collection upload',
      details: error.message
    });
  }
};