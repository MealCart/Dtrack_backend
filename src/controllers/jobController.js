const { pool } = require('../config/database');
const Job = require('../models/Job');
const Collection = require('../models/Collection');
const { generateBarcodes } = require('../utils/helpers');
Object.assign(exports, require('./databaseJobController'));
exports.createJob = async (req, res) => {
  try {
    const jobData = req.body;
    try { require('../utils/australianPhone').normalizePhoneFields(jobData); } catch (error) { return res.status(400).json({ error: error.message }); }
    const customer = await require('../services/bookingCustomerService').resolveCustomer(req);
    for (const field of ['do_number', 'address', 'deliver_to']) {
      if (!jobData[field]) return res.status(400).json({ error: `Missing required field: ${field}` });
    }
    if (await Job.checkDoNumberExists(jobData.do_number)) return res.status(409).json({ error: 'DO number already exists' });
    const totalBoxes = jobData.boxes || jobData.cartons || 1;
    const barcodes = generateBarcodes(jobData.do_number, totalBoxes);
    const createPayload = {
        delivery_type: require('../utils/bookingType')(jobData.delivery_type, 'Home Delivery'),
        do_number: jobData.do_number,
        customer_name: jobData.customer_name || jobData.deliver_to || '',
        customer_company: jobData.company_name || '',
        phone: jobData.phone || '',
        delivery_address: jobData.address || '',
        postcode: jobData.postal_code || '',
        recipient_name: jobData.deliver_to || '',
        recipient_email: jobData.notify_email ?? jobData.customer_email ?? jobData.recipient_email ?? null,
        recipient_phone: jobData.phone || '',
        boxes: totalBoxes,
        weight: jobData.weight || 0,
        contents: jobData.contents || '',
        status: 'pending',
        scheduled_date: jobData.date || null,
        special_instructions: jobData.instructions || '',
        barcodes: barcodes,
        detrack_id: null,
        source: 'customer',
        group_name: null,
        group_id: null,
        pickup_address: jobData.pickup_address || '',
        user_id: customer.id,
        state: jobData.state || '',
        city: jobData.city || '',
        country: jobData.country || 'Australia',
        address_1: jobData.address_1 || jobData.address || '',
        address_2: jobData.address_2 || ''
      };
    const saved = await Job.create(createPayload);
    return res.json({ success: true, job: { id: saved.id, do_number: jobData.do_number, customer_id: saved.user_id, boxes: totalBoxes, barcodes, delivery_type: createPayload.delivery_type } });
  } catch (error) {
    return res.status(error.status || (error.code === '23505' ? 409 : 500)).json({ error: error.status ? error.message : 'Failed to create booking', details: error.message, code: error.code });
  }
};

// ===== GET DETRACK COLLECTIONS =====

exports.uploadManifest = require('../services/bulkBookingService').upload(false);

// ===== GET DETRACK JOBS WITH FILTERS =====

exports.getDashboardStats = async (req, res) => {
  try {
    var userId = req.user.id;
    var userRole = req.user.role;
    if (!['admin','staff','customer'].includes(userRole)) return res.status(403).json({success:false,error:'Access denied'});

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

exports.uploadCollectionManifest = require('../services/bulkBookingService').upload(true);
