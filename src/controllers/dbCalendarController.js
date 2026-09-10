// src/controllers/dbCalendarController.js
const { pool } = require('../config/database');

// ===== GET CALENDAR DATA FROM LOCAL DB =====
// Returns per-day counts of jobs and collections for a date range.
exports.getDbCalendar = async (req, res) => {
  try {
    const { from, to } = req.query;
    const userId = req.user.id;
    const userRole = req.user.role;
    const userGroupId = req.user.group_id;

    if (!from || !to) {
      return res.status(400).json({
        success: false,
        error: 'Missing required params: from and to (YYYY-MM-DD)',
      });
    }

    // Build role filter
    const conditions = [];
    const params = [];

    if (userRole === 'customer') {
      if (userGroupId) {
        params.push(userGroupId);
        conditions.push(`group_id = $${params.length}`);
      } else {
        params.push(userId);
        conditions.push(`user_id = $${params.length}`);
      }
    }

    // Date range (append after role params)
    params.push(from);
    const fromIdx = params.length;
    params.push(to);
    const toIdx = params.length;

    const whereRole = conditions.length > 0 ? ` AND ${conditions.join(' AND ')}` : '';

    // ===== JOBS AGGREGATION =====
    const jobsQuery = `
      SELECT
        scheduled_date::date AS date,
        COUNT(*)::int AS total,
        COALESCE(SUM(boxes), 0)::int AS total_boxes,
        COUNT(CASE WHEN status = 'pending' THEN 1 END)::int AS pending,
        COUNT(CASE WHEN status = 'dispatched' THEN 1 END)::int AS dispatched,
        COUNT(CASE WHEN status = 'in_transit' THEN 1 END)::int AS in_transit,
        COUNT(CASE WHEN status = 'completed' THEN 1 END)::int AS completed,
        COUNT(CASE WHEN status = 'delivered' THEN 1 END)::int AS delivered,
        COUNT(CASE WHEN status = 'failed' THEN 1 END)::int AS failed,
        COUNT(CASE WHEN status = 'cancelled' THEN 1 END)::int AS cancelled
      FROM jobs
      WHERE scheduled_date >= $${fromIdx}
        AND scheduled_date <= $${toIdx}
        ${whereRole}
      GROUP BY scheduled_date::date
      ORDER BY scheduled_date::date
    `;

    // ===== COLLECTIONS AGGREGATION =====
    const collectionsQuery = `
      SELECT
        scheduled_date::date AS date,
        COUNT(*)::int AS total,
        COUNT(CASE WHEN status = 'pending' THEN 1 END)::int AS pending,
        COUNT(CASE WHEN status = 'in_progress' THEN 1 END)::int AS in_progress,
        COUNT(CASE WHEN status = 'completed' THEN 1 END)::int AS completed,
        COUNT(CASE WHEN status = 'cancelled' THEN 1 END)::int AS cancelled
      FROM collections
      WHERE scheduled_date >= $${fromIdx}
        AND scheduled_date <= $${toIdx}
        ${whereRole}
      GROUP BY scheduled_date::date
      ORDER BY scheduled_date::date
    `;

    const [jobsResult, collectionsResult] = await Promise.all([
      pool.query(jobsQuery, params),
      pool.query(collectionsQuery, params),
    ]);

    // ===== MERGE INTO PER-DAY MAP =====
    const calendarMap = {};

    // Helper to normalize date to YYYY-MM-DD string
    const toDateStr = (d) => {
      if (!d) return null;
      if (typeof d === 'string') return d.slice(0, 10);
      // JS Date
      const y = d.getFullYear();
      const m = String(d.getMonth() + 1).padStart(2, '0');
      const day = String(d.getDate()).padStart(2, '0');
      return `${y}-${m}-${day}`;
    };

    jobsResult.rows.forEach((row) => {
      const key = toDateStr(row.date);
      if (!key) return;
      if (!calendarMap[key]) {
        calendarMap[key] = {
          date: key,
          jobs: 0,
          jobsBoxes: 0,
          jobsPending: 0,
          jobsDispatched: 0,
          jobsInTransit: 0,
          jobsCompleted: 0,
          jobsDelivered: 0,
          jobsFailed: 0,
          jobsCancelled: 0,
          collections: 0,
          collectionsPending: 0,
          collectionsInProgress: 0,
          collectionsCompleted: 0,
          collectionsCancelled: 0,
          all: 0,
        };
      }
      calendarMap[key].jobs = row.total || 0;
      calendarMap[key].jobsBoxes = row.total_boxes || 0;
      calendarMap[key].jobsPending = row.pending || 0;
      calendarMap[key].jobsDispatched = row.dispatched || 0;
      calendarMap[key].jobsInTransit = row.in_transit || 0;
      calendarMap[key].jobsCompleted = row.completed || 0;
      calendarMap[key].jobsDelivered = row.delivered || 0;
      calendarMap[key].jobsFailed = row.failed || 0;
      calendarMap[key].jobsCancelled = row.cancelled || 0;
    });

    collectionsResult.rows.forEach((row) => {
      const key = toDateStr(row.date);
      if (!key) return;
      if (!calendarMap[key]) {
        calendarMap[key] = {
          date: key,
          jobs: 0,
          jobsBoxes: 0,
          jobsPending: 0,
          jobsDispatched: 0,
          jobsInTransit: 0,
          jobsCompleted: 0,
          jobsDelivered: 0,
          jobsFailed: 0,
          jobsCancelled: 0,
          collections: 0,
          collectionsPending: 0,
          collectionsInProgress: 0,
          collectionsCompleted: 0,
          collectionsCancelled: 0,
          all: 0,
        };
      }
      calendarMap[key].collections = row.total || 0;
      calendarMap[key].collectionsPending = row.pending || 0;
      calendarMap[key].collectionsInProgress = row.in_progress || 0;
      calendarMap[key].collectionsCompleted = row.completed || 0;
      calendarMap[key].collectionsCancelled = row.cancelled || 0;
    });

    // Compute `all` for each day
    Object.values(calendarMap).forEach((day) => {
      day.all = (day.jobs || 0) + (day.collections || 0);
    });

    // ===== TOTALS =====
    let totalJobs = 0;
    let totalCollections = 0;
    Object.values(calendarMap).forEach((day) => {
      totalJobs += day.jobs || 0;
      totalCollections += day.collections || 0;
    });

    console.log(
      `✅ [DB] Calendar ${from} → ${to}: ${Object.keys(calendarMap).length} dates, ${totalJobs} jobs, ${totalCollections} collections`
    );

    return res.json({
      success: true,
      source: 'database',
      data: calendarMap,
      meta: {
        from,
        to,
        role: userRole,
        groupId: userRole === 'customer' ? userGroupId : null,
        dateCount: Object.keys(calendarMap).length,
        totalJobs,
        totalCollections,
        total: totalJobs + totalCollections,
      },
    });
  } catch (error) {
    console.error('❌ [DB] getDbCalendar error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch calendar data from database',
      details: error.message,
    });
  }
};