// src/controllers/calendarController.js
const axios = require('axios');
const { DETRACK_API_KEY } = require('../config/constants');

// ===== HELPER: Fetch delivery job counts from Detrack =====
const fetchDeliveryCounts = async (fromDate, toDate, groupId = null) => {
    try {
        let url = `https://app.detrack.com/api/v2/dn/jobs/count?from=${fromDate}&to=${toDate}&type=Delivery`;
        
        if (groupId) {
            url += `&group_id=${groupId}`;
            console.log(`📡 Fetching delivery counts with group_id: ${groupId}`);
        } else {
            console.log(`📡 Fetching delivery counts (ALL deliveries)`);
        }
        
        console.log(`🔗 URL: ${url}`);
        
        const response = await axios.get(url, {
            headers: {
                'X-API-KEY': DETRACK_API_KEY,
                'User-Agent': 'curl/7.68.0'
            },
            timeout: 30000
        });
        
        const data = response.data?.data || {};
        const totalJobs = Object.values(data).reduce((sum, d) => sum + (d.all || 0), 0);
        console.log(`✅ Fetched ${Object.keys(data).length} dates with ${totalJobs} total deliveries`);
        
        return { data };
    } catch (error) {
        console.error(`❌ Error fetching delivery counts:`, error.message);
        return { data: {} };
    }
};

// ===== MAIN: Get calendar data =====
exports.getCalendarData = async (req, res) => {
    try {
        const { from, to } = req.query;
        
        if (!from || !to) {
            return res.status(400).json({
                error: 'Missing required parameters: from and to dates are required'
            });
        }
        
        // 👇 DEBUG: Log the entire user object
        console.log('🔍 Full req.user:', JSON.stringify(req.user, null, 2));
        console.log(`📅 Calendar request: ${from} to ${to}`);
        
        const userRole = req.user?.role;
        const userGroupId = req.user?.group_id;
        
        console.log(`👤 User: role=${userRole}, group=${userGroupId || 'none'}`);
        
        let deliveryCounts = {};
        let groupIdUsed = null;
        
        // 👇 Check if user is admin OR staff (explicitly)
        const isAdminOrStaff = userRole === 'admin' || userRole === 'staff';
        
        if (isAdminOrStaff) {
            console.log('👑 Admin/Staff: Fetching ALL delivery counts');
            const result = await fetchDeliveryCounts(from, to);
            deliveryCounts = result.data || {};
        } else {
            // Customer or any other role
            console.log(`👤 Customer: Fetching delivery counts for group ${userGroupId}`);
            
            // 👇 If no group_id, return empty
            if (!userGroupId) {
                console.warn('⚠️ Customer has no group ID, returning empty data');
                return res.json({
                    success: true,
                    data: {},
                    meta: {
                        from,
                        to,
                        role: userRole || 'unknown',
                        groupId: null,
                        dateCount: 0,
                        totalJobs: 0,
                        message: 'No group assigned to your account'
                    }
                });
            }
            
            const result = await fetchDeliveryCounts(from, to, userGroupId);
            deliveryCounts = result.data || {};
            groupIdUsed = userGroupId;
        }
        
        // Build response
        const responseData = {};
        let totalJobs = 0;
        
        const startDate = new Date(from);
        const endDate = new Date(to);
        const currentDate = new Date(startDate);
        const dateRange = [];
        
        while (currentDate <= endDate) {
            const dateStr = currentDate.toISOString().split('T')[0];
            dateRange.push(dateStr);
            currentDate.setDate(currentDate.getDate() + 1);
        }
        
        dateRange.forEach(date => {
            const data = deliveryCounts[date] || {};
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
        
        console.log(`📊 Calendar summary: ${Object.keys(deliveryCounts).length} dates with deliveries, ${totalJobs} total deliveries`);
        
        res.json({
            success: true,
            data: responseData,
            meta: {
                from,
                to,
                role: userRole || 'unknown',
                groupId: groupIdUsed || userGroupId || null,
                dateCount: Object.keys(deliveryCounts).length,
                totalJobs,
                dateRange: dateRange.length
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
        const userRole = req.user?.role;
        const userGroupId = req.user?.group_id;
        
        if (!date) {
            return res.status(400).json({
                error: 'Date parameter is required (YYYY-MM-DD)'
            });
        }
        
        console.log(`📅 Date details request: ${date}, role: ${userRole}, group: ${userGroupId || 'none'}`);
        
        let url = `https://app.detrack.com/api/v2/jobs?date=${date}&type=Delivery&limit=500`;
        
        // 👇 Only add group filter for customers
        if (userRole === 'customer' && userGroupId) {
            url += `&group_id=${userGroupId}`;
            console.log(`🔒 Filtering by group: ${userGroupId}`);
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