// src/controllers/calendarController.js
const axios = require('axios');
const { DETRACK_API_KEY } = require('../config/constants');

// ===== HELPER: Fetch delivery job counts from Detrack =====
const fetchDeliveryCounts = async (fromDate, toDate) => {
    try {
        const url = `https://app.detrack.com/api/v2/dn/jobs/count?from=${fromDate}&to=${toDate}&type=Delivery`;
        
        console.log(`📡 Fetching delivery counts from: ${url}`);
        
        const response = await axios.get(url, {
            headers: {
                'X-API-KEY': DETRACK_API_KEY,
                'User-Agent': 'curl/7.68.0'
            },
            timeout: 30000
        });
        
        console.log(`✅ Fetched delivery counts: ${Object.keys(response.data?.data || {}).length} dates`);
        return response.data;
    } catch (error) {
        console.error(`❌ Error fetching delivery counts:`, error.message);
        if (error.response?.data) {
            console.error('  Response:', JSON.stringify(error.response.data, null, 2));
        }
        return { data: {} };
    }
};

// ===== HELPER: Fetch delivery jobs for customers (filter by group) =====
const fetchGroupFilteredDeliveries = async (fromDate, toDate, groupId) => {
    try {
        console.log(`📡 Fetching deliveries for group ${groupId} from ${fromDate} to ${toDate}`);
        
        const url = `https://app.detrack.com/api/v2/jobs?from=${fromDate}&to=${toDate}&type=Delivery&group_id=${groupId}&limit=500`;
        
        const response = await axios.get(url, {
            headers: {
                'X-API-KEY': DETRACK_API_KEY,
                'User-Agent': 'curl/7.68.0'
            },
            timeout: 30000
        });
        
        const jobs = response.data?.data || [];
        console.log(`✅ Found ${jobs.length} deliveries for group ${groupId}`);
        
        // Count jobs by date
        const countsByDate = {};
        
        jobs.forEach(job => {
            const date = job.date || job.scheduled_date || job.created_at?.split('T')[0];
            if (!date) return;
            
            if (!countsByDate[date]) {
                countsByDate[date] = {
                    info_recv: 0,
                    dispatched: 0,
                    completed: 0,
                    completed_partial: 0,
                    failed: 0,
                    on_hold: 0,
                    return: 0,
                    recv_at_distribution_centre: 0,
                    all: 0,
                    unassigned: 0,
                    assigned: 0
                };
            }
            
            const status = job.status || job.primary_job_status || 'pending';
            
            // Map status to Detrack's status fields
            const statusMap = {
                'info_recv': 'info_recv',
                'info_received': 'info_recv',
                'dispatched': 'dispatched',
                'completed': 'completed',
                'delivered': 'completed',
                'completed_partial': 'completed_partial',
                'failed': 'failed',
                'on_hold': 'on_hold',
                'return': 'return',
                'recv_at_distribution_centre': 'recv_at_distribution_centre'
            };
            
            const mappedStatus = statusMap[status.toLowerCase()] || 'info_recv';
            
            if (countsByDate[date][mappedStatus] !== undefined) {
                countsByDate[date][mappedStatus]++;
            }
            
            countsByDate[date].all++;
            
            if (job.assign_to) {
                countsByDate[date].assigned++;
            } else {
                countsByDate[date].unassigned++;
            }
        });
        
        return { data: countsByDate };
    } catch (error) {
        console.error(`❌ Error fetching group filtered deliveries:`, error.message);
        return { data: {} };
    }
};

// ===== MAIN: Get calendar data =====
exports.getCalendarData = async (req, res) => {
    try {
        const { from, to } = req.query;
        const userRole = req.user.role;
        const userGroupId = req.user.group_id;
        
        if (!from || !to) {
            return res.status(400).json({
                error: 'Missing required parameters: from and to dates are required'
            });
        }
        
        console.log(`📅 Calendar request: ${from} to ${to}, role: ${userRole}, group: ${userGroupId || 'none'}`);
        
        let deliveryCounts = {};
        
        // For admin/staff: fetch all delivery jobs
        if (userRole === 'admin' || userRole === 'staff') {
            console.log('👑 Admin/Staff: Fetching all delivery counts');
            
            try {
                const result = await fetchDeliveryCounts(from, to);
                deliveryCounts = result.data || {};
                console.log(`✅ Delivery counts: ${Object.keys(deliveryCounts).length} dates`);
            } catch (err) {
                console.error('❌ Failed to fetch delivery counts:', err.message);
            }
            
        } else {
            // For customers: filter by group ID
            if (!userGroupId) {
                console.warn('⚠️ Customer has no group ID, returning empty data');
                return res.json({
                    success: true,
                    data: {},
                    meta: {
                        from,
                        to,
                        role: userRole,
                        groupId: null,
                        dateCount: 0,
                        totalJobs: 0,
                        message: 'No group assigned to your account'
                    }
                });
            }
            
            console.log(`👤 Customer: Fetching deliveries for group ${userGroupId}`);
            
            try {
                const result = await fetchGroupFilteredDeliveries(from, to, userGroupId);
                deliveryCounts = result.data || {};
                console.log(`✅ Customer delivery counts: ${Object.keys(deliveryCounts).length} dates`);
            } catch (err) {
                console.error('❌ Failed to fetch customer deliveries:', err.message);
            }
        }
        
        // Build response data
        const responseData = {};
        let totalJobs = 0;
        
        Object.keys(deliveryCounts).forEach(date => {
            const data = deliveryCounts[date];
            responseData[date] = {
                info_recv: data.info_recv || 0,
                dispatched: data.dispatched || 0,
                completed: data.completed || 0,
                completed_partial: data.completed_partial || 0,
                failed: data.failed || 0,
                on_hold: data.on_hold || 0,
                return: data.return || 0,
                recv_at_distribution_centre: data.recv_at_distribution_centre || 0,
                all: data.all || 0,
                unassigned: data.unassigned || 0,
                assigned: data.assigned || 0
            };
            totalJobs += data.all || 0;
        });
        
        console.log(`📊 Calendar summary: ${Object.keys(responseData).length} dates, ${totalJobs} total deliveries`);
        
        res.json({
            success: true,
            data: responseData,
            meta: {
                from,
                to,
                role: userRole,
                groupId: userGroupId || null,
                dateCount: Object.keys(responseData).length,
                totalJobs
            }
        });
        
    } catch (error) {
        console.error('❌ Calendar data error:', error);
        res.status(500).json({
            error: 'Failed to fetch calendar data',
            details: error.message
        });
    }
};

// ===== GET DATE DETAILS =====
exports.getDateDetails = async (req, res) => {
    try {
        const { date } = req.params;
        const userRole = req.user.role;
        const userGroupId = req.user.group_id;
        
        if (!date) {
            return res.status(400).json({
                error: 'Date parameter is required (YYYY-MM-DD)'
            });
        }
        
        console.log(`📅 Date details request: ${date}, role: ${userRole}, group: ${userGroupId || 'none'}`);
        
        // Fetch delivery jobs for the specific date
        let url = `https://app.detrack.com/api/v2/jobs?date=${date}&type=Delivery&limit=500`;
        
        // Add group filter for customers
        if (userRole === 'customer' && userGroupId) {
            url += `&group_id=${userGroupId}`;
        }
        
        const response = await axios.get(url, {
            headers: {
                'X-API-KEY': DETRACK_API_KEY,
                'User-Agent': 'curl/7.68.0'
            },
            timeout: 30000
        });
        
        const jobs = response.data?.data || [];
        console.log(`✅ Found ${jobs.length} deliveries for ${date}`);
        
        res.json({
            success: true,
            data: {
                date,
                total: jobs.length,
                jobs
            },
            meta: {
                role: userRole,
                groupId: userGroupId || null
            }
        });
        
    } catch (error) {
        console.error('❌ Date details error:', error);
        res.status(500).json({
            error: 'Failed to fetch date details',
            details: error.message
        });
    }
};