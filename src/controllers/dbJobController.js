// src/controllers/dbJobController.js
const { pool } = require('../config/database');

// ===== MAP DB ROW → FRONTEND Booking SHAPE =====
// Matches what mapDetrackJobToBooking() produces, minus live-only fields.
function mapDbJobToBooking(row) {
  if (!row) return null;

  const parseJson = (value, fallback) => {
    if (value === null || value === undefined) return fallback;
    if (typeof value === 'object') return value;
    try { return JSON.parse(value); } catch { return fallback; }
  };

  const doNumber = row.do_number || 'N/A';
  const boxCount = parseInt(row.boxes) || 1;
  let barcodes = parseJson(row.barcodes, []);
  const scans = parseJson(row.scans, []);

  // Fallback barcode generation (matches helpers.generateBarcodes — no zero-pad)
  if (!barcodes || barcodes.length === 0) {
    barcodes = [];
    for (let i = 0; i < boxCount; i++) {
      barcodes.push(`${doNumber}-${i + 1}`);
    }
  }

  return {
    // Identity
    id: row.id,
    reference: doNumber,
    detrackId: row.detrack_id || '',
    type: 'delivery',
    source: row.source || 'customer',

    // Customer / recipient
    customerName: row.recipient_name || row.customer_name || 'Unknown',
    customerCompany: row.customer_company || '',
    customerEmail: '',
    recipientName: row.recipient_name || row.customer_name || 'Unknown',
    recipientPhone: row.recipient_phone || row.phone || '',

    // Address
    pickupAddress: row.pickup_address || '',
    deliveryAddress: row.delivery_address || '',
    postcode: row.postcode || '',
    address_1: row.address_1 || '',
    address_2: row.address_2 || '',
    state: row.state || '',
    city: row.city || '',
    country: row.country || 'Australia',

    // Shipment
    boxes: boxCount,
    number_of_shipping_labels: boxCount,
    cartons: boxCount,
    weight: parseFloat(row.weight) || 0,
    contents: row.contents || '',
    barcodes: barcodes,
    scans: scans,

    // Scheduling / status
    scheduledDate: row.scheduled_date || '',
    status: row.status || 'pending', // kept but hidden in UI
    createdAt: row.created_at || new Date().toISOString(),
    updatedAt: row.updated_at || row.created_at || new Date().toISOString(),

    // Instructions
    specialInstructions: row.special_instructions || '',
    instructions: row.special_instructions || '',

    // Group
    groupName: row.group_name || '',
    groupId: row.group_id || '',

    // Label
    labelUrl: row.label_url || '',

    // Live-only — empty here; filled by BookingDetailModal from Detrack
    assignedVehicleId: null,
    driver: '',
    runNumber: '',
    liveEta: null,
    etaTime: null,
    podTime: '',
    podFileUrl: null,
    trackingLink: '',
    verificationCode: '',
    primaryJobStatus: '',
    trackingStatus: '',
    trackingStatusCode: '',
    milestones: [],
    photos: {},
    cost: 0,
    deliveredDate: undefined,
  };
}

// ===== MAP DB COLLECTION ROW → FRONTEND Booking SHAPE =====
function mapDbCollectionToBooking(row) {
  if (!row) return null;

  const doNumber = row.do_number || 'N/A';

  const statusMap = {
    pending: 'pending',
    in_progress: 'in_transit',
    completed: 'completed',
    cancelled: 'cancelled',
  };

  return {
    id: row.id,
    reference: doNumber,
    detrackId: row.detrack_id || '',
    type: 'collection',
    source: row.source || 'customer',

    customerName: row.recipient_name || 'Unknown',
    customerCompany: row.recipient_company || '',
    customerEmail: '',
    recipientName: row.recipient_name || 'Unknown',
    recipientPhone: row.recipient_phone || '',

    pickupAddress: '',
    deliveryAddress: row.collection_address || '',
    postcode: row.postcode || '',
    address_1: '',
    address_2: '',
    state: row.state || '',
    city: row.city || '',
    country: row.country || 'Australia',

    boxes: 1,
    number_of_shipping_labels: 1,
    cartons: 1,
    weight: 0,
    contents: '',
    barcodes: [doNumber],
    scans: [],

    scheduledDate: row.scheduled_date || '',
    status: statusMap[(row.status || '').toLowerCase()] || 'pending',
    createdAt: row.created_at || new Date().toISOString(),
    updatedAt: row.updated_at || row.created_at || new Date().toISOString(),

    specialInstructions: row.special_instructions || '',
    instructions: row.special_instructions || '',

    groupName: row.group_name || '',
    groupId: row.group_id || '',

    labelUrl: '',
    trackingLink: row.tracking_link || '',
    verificationCode: row.verification_code || '',

    // Live-only
    assignedVehicleId: null,
    driver: '',
    runNumber: '',
    liveEta: null,
    etaTime: null,
    podTime: '',
    podFileUrl: null,
    primaryJobStatus: '',
    trackingStatus: '',
    trackingStatusCode: '',
    milestones: [],
    photos: {},
    cost: 0,
    deliveredDate: undefined,
  };
}

// ===== GET JOBS FROM DB =====
exports.getDbJobs = async (req, res) => {
  try {
    const { date, page = 1, limit = 100 } = req.query;
    const userId = req.user.id;
    const userRole = req.user.role;
    const userGroupId = req.user.group_id;

    const pageNum = Math.max(1, parseInt(page) || 1);
    const limitNum = Math.max(1, parseInt(limit) || 100);
    const offset = (pageNum - 1) * limitNum;

    const conditions = [];
    const params = [];

    if (date) {
      params.push(date);
      conditions.push(`scheduled_date = $${params.length}`);
    }

    if (userRole === 'customer') {
      if (userGroupId) {
        params.push(userGroupId);
        conditions.push(`group_id = $${params.length}`);
      } else {
        params.push(userId);
        conditions.push(`user_id = $${params.length}`);
      }
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    const countResult = await pool.query(
      `SELECT COUNT(*)::int AS total FROM jobs ${whereClause}`,
      params
    );
    const total = countResult.rows[0]?.total || 0;

    const dataParams = [...params, limitNum, offset];
    const dataResult = await pool.query(
      `SELECT * FROM jobs
       ${whereClause}
       ORDER BY scheduled_date DESC, created_at DESC
       LIMIT $${dataParams.length - 1} OFFSET $${dataParams.length}`,
      dataParams
    );

    const mapped = dataResult.rows.map(mapDbJobToBooking);
    const totalPages = Math.ceil(total / limitNum) || 1;

    console.log(`✅ [DB] jobs: ${mapped.length} of ${total} (page ${pageNum}/${totalPages})`);

    return res.json({
      success: true,
      source: 'database',
      data: mapped,
      meta: {
        total,
        page: pageNum,
        limit: limitNum,
        hasNext: pageNum < totalPages,
        totalPages,
        date: date || null,
        role: userRole,
        groupId: userRole === 'customer' ? userGroupId : null,
      },
      total_count: total,
      currentPage: pageNum,
      hasNext: pageNum < totalPages,
    });
  } catch (error) {
    console.error('❌ [DB] getDbJobs error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch jobs from database',
      details: error.message,
    });
  }
};

// ===== GET COLLECTIONS FROM DB =====
exports.getDbCollections = async (req, res) => {
  try {
    const { date, page = 1, limit = 100 } = req.query;
    const userId = req.user.id;
    const userRole = req.user.role;
    const userGroupId = req.user.group_id;

    const pageNum = Math.max(1, parseInt(page) || 1);
    const limitNum = Math.max(1, parseInt(limit) || 100);
    const offset = (pageNum - 1) * limitNum;

    const conditions = [];
    const params = [];

    if (date) {
      params.push(date);
      conditions.push(`scheduled_date = $${params.length}`);
    }

    if (userRole === 'customer') {
      if (userGroupId) {
        params.push(userGroupId);
        conditions.push(`group_id = $${params.length}`);
      } else {
        params.push(userId);
        conditions.push(`user_id = $${params.length}`);
      }
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    const countResult = await pool.query(
      `SELECT COUNT(*)::int AS total FROM collections ${whereClause}`,
      params
    );
    const total = countResult.rows[0]?.total || 0;

    const dataParams = [...params, limitNum, offset];
    const dataResult = await pool.query(
      `SELECT * FROM collections
       ${whereClause}
       ORDER BY scheduled_date DESC, created_at DESC
       LIMIT $${dataParams.length - 1} OFFSET $${dataParams.length}`,
      dataParams
    );

    const mapped = dataResult.rows.map(mapDbCollectionToBooking);
    const totalPages = Math.ceil(total / limitNum) || 1;

    console.log(`✅ [DB] collections: ${mapped.length} of ${total} (page ${pageNum}/${totalPages})`);

    return res.json({
      success: true,
      source: 'database',
      data: mapped,
      meta: {
        total,
        page: pageNum,
        limit: limitNum,
        hasNext: pageNum < totalPages,
        totalPages,
        date: date || null,
        role: userRole,
      },
      total_count: total,
      currentPage: pageNum,
      hasNext: pageNum < totalPages,
    });
  } catch (error) {
    console.error('❌ [DB] getDbCollections error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch collections from database',
      details: error.message,
    });
  }
};