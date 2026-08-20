// src/controllers/searchController.js
const axios = require('axios');
const { DETRACK_API_KEY } = require('../config/constants');
const { pool } = require('../config/database');

// ============================================
// SEARCH JOB BY DO NUMBER - DETRACK DIRECTLY
// ============================================
exports.searchJobByDoNumber = async (req, res) => {
    try {
        const { q, do_number } = req.query;
        const searchTerm = q || do_number;

        if (!searchTerm) {
            return res.status(400).json({
                success: false,
                error: 'Search term is required'
            });
        }

        console.log(`🔍 Searching Detrack for: ${searchTerm}`);

        // Try exact match first using the job-by-donumber endpoint
        try {
            const detrackResponse = await axios.get(
                `https://app.detrack.com/api/v2/jobs`,
                {
                    headers: {
                        'X-API-KEY': DETRACK_API_KEY,
                        'User-Agent': 'curl/7.68.0'
                    },
                    params: {
                        do_number: searchTerm,
                        limit: 1
                    },
                    timeout: 15000
                }
            );

            const jobs = detrackResponse.data?.data || [];
            
            if (jobs.length > 0) {
                const job = jobs[0];
                console.log(`✅ Found job ${searchTerm} in Detrack`);

                // Check if job exists in local database
                let dbJob = null;
                try {
                    const dbResult = await pool.query(
                        'SELECT * FROM jobs WHERE do_number = $1',
                        [searchTerm]
                    );
                    if (dbResult.rows.length > 0) {
                        dbJob = dbResult.rows[0];
                    }
                } catch (dbError) {
                    console.error('Database check error:', dbError.message);
                }

                return res.json({
                    success: true,
                    data: {
                        ...job,
                        _source: 'detrack',
                        _in_database: !!dbJob,
                        _db_data: dbJob
                    }
                });
            }
        } catch (error) {
            console.error('Detrack exact match error:', error.message);
            // Continue to try other search methods
        }

        // If exact match failed, try searching with filters
        try {
            const searchResponse = await axios.get(
                `https://app.detrack.com/api/v2/jobs`,
                {
                    headers: {
                        'X-API-KEY': DETRACK_API_KEY,
                        'User-Agent': 'curl/7.68.0'
                    },
                    params: {
                        search: searchTerm,
                        limit: 10
                    },
                    timeout: 15000
                }
            );

            const jobs = searchResponse.data?.data || [];
            
            // Filter jobs that match the search term
            const matchedJobs = jobs.filter(job => {
                const doNumber = job.do_number || '';
                const deliverTo = job.deliver_to_collect_from || job.deliver_to || '';
                const address = job.address || '';
                
                return doNumber.toLowerCase().includes(searchTerm.toLowerCase()) ||
                       deliverTo.toLowerCase().includes(searchTerm.toLowerCase()) ||
                       address.toLowerCase().includes(searchTerm.toLowerCase());
            });

            if (matchedJobs.length > 0) {
                console.log(`✅ Found ${matchedJobs.length} jobs matching "${searchTerm}" in Detrack`);
                
                // Check each job in database
                const enrichedJobs = await Promise.all(matchedJobs.map(async (job) => {
                    let dbJob = null;
                    try {
                        const dbResult = await pool.query(
                            'SELECT * FROM jobs WHERE do_number = $1',
                            [job.do_number]
                        );
                        if (dbResult.rows.length > 0) {
                            dbJob = dbResult.rows[0];
                        }
                    } catch (dbError) {
                        console.error('Database check error:', dbError.message);
                    }
                    
                    return {
                        ...job,
                        _source: 'detrack',
                        _in_database: !!dbJob,
                        _db_data: dbJob
                    };
                }));

                return res.json({
                    success: true,
                    data: enrichedJobs,
                    total: enrichedJobs.length
                });
            }
        } catch (error) {
            console.error('Detrack search error:', error.message);
        }

        // No results found
        console.log(`❌ No job found for: ${searchTerm}`);
        return res.status(404).json({
            success: false,
            error: 'Job not found',
            message: `No job found with DO number: ${searchTerm}`
        });

    } catch (error) {
        console.error('❌ Search job error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to search job',
            details: error.message
        });
    }
};

// ============================================
// SEARCH JOBS BY MULTIPLE CRITERIA
// ============================================
exports.searchJobs = async (req, res) => {
    try {
        const { q, date, status, limit = 20 } = req.query;
        const userRole = req.user.role;
        const userGroupId = req.user.group_id;

        console.log(`🔍 Searching jobs with criteria:`, { q, date, status, limit });

        // Build Detrack API params
        const params = {
            limit: parseInt(limit) || 20
        };

        if (date) {
            params.date = date;
        }

        if (status) {
            params.status = status;
        }

        // Make request to Detrack
        const response = await axios.get(
            `https://app.detrack.com/api/v2/jobs`,
            {
                headers: {
                    'X-API-KEY': DETRACK_API_KEY,
                    'User-Agent': 'curl/7.68.0'
                },
                params: params,
                timeout: 15000
            }
        );

        let jobs = response.data?.data || [];

        // Filter by search term if provided
        if (q && q.length > 0) {
            const searchLower = q.toLowerCase();
            jobs = jobs.filter(job => {
                const doNumber = (job.do_number || '').toLowerCase();
                const deliverTo = (job.deliver_to_collect_from || job.deliver_to || '').toLowerCase();
                const address = (job.address || '').toLowerCase();
                
                return doNumber.includes(searchLower) ||
                       deliverTo.includes(searchLower) ||
                       address.includes(searchLower);
            });
        }

        // Filter by group for customers
        if (userRole === 'customer' && userGroupId) {
            jobs = jobs.filter(job => 
                job.group_id === userGroupId || job.group === userGroupId
            );
        }

        console.log(`✅ Found ${jobs.length} jobs matching criteria`);

        // Check each job in database
        const enrichedJobs = await Promise.all(jobs.map(async (job) => {
            let dbJob = null;
            try {
                const dbResult = await pool.query(
                    'SELECT do_number, status, barcodes, scans FROM jobs WHERE do_number = $1',
                    [job.do_number]
                );
                if (dbResult.rows.length > 0) {
                    dbJob = dbResult.rows[0];
                }
            } catch (dbError) {
                console.error('Database check error:', dbError.message);
            }
            
            return {
                ...job,
                _source: 'detrack',
                _in_database: !!dbJob,
                _db_data: dbJob
            };
        }));

        res.json({
            success: true,
            data: enrichedJobs,
            total: enrichedJobs.length,
            meta: {
                limit: parseInt(limit),
                hasMore: enrichedJobs.length === parseInt(limit)
            }
        });

    } catch (error) {
        console.error('❌ Search jobs error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to search jobs',
            details: error.message
        });
    }
};