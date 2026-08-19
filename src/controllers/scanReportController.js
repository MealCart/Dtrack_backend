// src/controllers/scanReportController.js
const { pool } = require('../config/database');
const DetrackService = require('../services/detrackService');

// ============================================
// GET SCAN REPORT FOR A SPECIFIC DATE
// ============================================
exports.getScanReport = async (req, res) => {
    try {
        const { date } = req.query;
        const userRole = req.user.role;
        const userGroupId = req.user.group_id;

        // Validate date
        if (!date) {
            return res.status(400).json({
                error: 'Date is required (YYYY-MM-DD)'
            });
        }

        const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
        if (!dateRegex.test(date)) {
            return res.status(400).json({
                error: 'Invalid date format. Use YYYY-MM-DD'
            });
        }

        console.log(`📊 Generating scan report for date: ${date}, role: ${userRole}, group: ${userGroupId || 'none'}`);

        // ===== STEP 1: Fetch jobs from Detrack for the selected date =====
        let detrackJobs = [];
        try {
            const detrackResponse = await DetrackService.getJobsWithFilters({
                date: date,
                type: 'Delivery',
                limit: 500
            });
            detrackJobs = detrackResponse?.data || [];
            console.log(`📦 Found ${detrackJobs.length} jobs in Detrack for ${date}`);
        } catch (error) {
            console.error('❌ Failed to fetch jobs from Detrack:', error.message);
            return res.status(500).json({
                error: 'Failed to fetch jobs from Detrack',
                details: error.message
            });
        }

        if (detrackJobs.length === 0) {
            return res.json({
                success: true,
                date: date,
                totalJobs: 0,
                totalLabels: 0,
                scannedLabels: 0,
                unscannedLabels: 0,
                scanRate: '0%',
                jobs: [],
                summary: {
                    totalJobs: 0,
                    fullyScanned: 0,
                    partiallyScanned: 0,
                    notScanned: 0,
                    labelsNotGenerated: 0
                }
            });
        }

        // ===== STEP 2: Get all DO numbers from Detrack jobs =====
        const doNumbers = detrackJobs.map(job => job.do_number).filter(Boolean);
        
        // ===== STEP 3: Fetch matching jobs from database =====
        let dbJobs = [];
        if (doNumbers.length > 0) {
            try {
                const placeholders = doNumbers.map((_, i) => `$${i + 1}`).join(', ');
                const query = `
                    SELECT 
                        id,
                        do_number,
                        customer_name,
                        recipient_name,
                        delivery_address,
                        postcode,
                        boxes,
                        status,
                        scheduled_date,
                        barcodes,
                        scans,
                        source,
                        group_name,
                        user_id,
                        created_at,
                        updated_at
                    FROM jobs
                    WHERE do_number IN (${placeholders})
                    ORDER BY do_number
                `;
                const result = await pool.query(query, doNumbers);
                dbJobs = result.rows;
                console.log(`📦 Found ${dbJobs.length} jobs in database matching Detrack jobs`);
            } catch (error) {
                console.error('❌ Failed to fetch jobs from database:', error.message);
                dbJobs = [];
            }
        }

        // ===== STEP 4: Create a map of database jobs by do_number =====
        const dbJobMap = {};
        dbJobs.forEach(job => {
            dbJobMap[job.do_number] = job;
        });

        // ===== STEP 5: Process each job and build report =====
        const jobReports = [];
        let totalLabels = 0;
        let totalScannedLabels = 0;

        detrackJobs.forEach(detrackJob => {
            const doNumber = detrackJob.do_number;
            const dbJob = dbJobMap[doNumber] || null;
            
            // Get shipping labels count from Detrack
            const shippingLabels = parseInt(detrackJob.number_of_shipping_labels) || 
                                  parseInt(detrackJob.cartons) || 
                                  parseInt(detrackJob.boxes) || 1;
            
            let barcodes = [];
            let scans = [];
            let scannedBarcodes = [];
            let scanDetails = [];
            let isInDatabase = false;

            if (dbJob) {
                isInDatabase = true;
                // Parse barcodes from database
                if (dbJob.barcodes) {
                    try {
                        barcodes = typeof dbJob.barcodes === 'string' 
                            ? JSON.parse(dbJob.barcodes) 
                            : dbJob.barcodes;
                    } catch (e) {
                        barcodes = [];
                    }
                }

                // Parse scans from database
                if (dbJob.scans) {
                    try {
                        scans = typeof dbJob.scans === 'string' 
                            ? JSON.parse(dbJob.scans) 
                            : dbJob.scans;
                    } catch (e) {
                        scans = [];
                    }
                }

                // Get scanned barcodes with full details
                scannedBarcodes = scans.map(s => s.barcode).filter(Boolean);
                scanDetails = scans.map(s => ({
                    barcode: s.barcode,
                    scanned_by: s.scanned_by || s.staff || 'Unknown',
                    staff: s.staff || 'Unknown',
                    location: s.location || 'Unknown',
                    timestamp: s.timestamp,
                    checkpoint: s.checkpoint || 'Scanned'
                }));
            }

            // Count scanned vs unscanned
            const labelCount = barcodes.length > 0 ? barcodes.length : shippingLabels;
            const scannedCount = scannedBarcodes.length;
            const unscannedCount = labelCount - scannedCount;

            totalLabels += labelCount;
            totalScannedLabels += scannedCount;

            // Determine scan status
            let scanStatus = 'labels_not_generated'; // 👈 CHANGED
            if (isInDatabase) {
                if (scannedCount === 0) {
                    scanStatus = 'not_scanned';
                } else if (scannedCount < labelCount) {
                    scanStatus = 'partially_scanned';
                } else if (scannedCount >= labelCount) {
                    scanStatus = 'fully_scanned';
                }
            }

            jobReports.push({
                do_number: doNumber,
                detrack_status: detrackJob.status || detrackJob.primary_job_status || 'unknown',
                recipient_name: detrackJob.deliver_to_collect_from || detrackJob.deliver_to || 'Unknown',
                address: detrackJob.address || '',
                postcode: detrackJob.postal_code || '',
                total_labels: labelCount,
                scanned_count: scannedCount,
                unscanned_count: unscannedCount,
                scan_rate: labelCount > 0 ? `${Math.round((scannedCount / labelCount) * 100)}%` : '0%',
                scan_status: scanStatus,
                is_in_database: isInDatabase,
                barcodes: barcodes,
                scanned_barcodes: scannedBarcodes,
                scan_details: scanDetails, // 👈 NEW: Detailed scan info
                scans: scans,
                db_status: dbJob?.status || null,
                group_name: dbJob?.group_name || detrackJob.group_name || '',
                created_at: dbJob?.created_at || detrackJob.created_at || null
            });
        });

        // ===== STEP 6: Calculate summary statistics =====
        const summary = {
            totalJobs: jobReports.length,
            fullyScanned: jobReports.filter(j => j.scan_status === 'fully_scanned').length,
            partiallyScanned: jobReports.filter(j => j.scan_status === 'partially_scanned').length,
            notScanned: jobReports.filter(j => j.scan_status === 'not_scanned').length,
            labelsNotGenerated: jobReports.filter(j => j.scan_status === 'labels_not_generated').length // 👈 CHANGED
        };

        console.log(`📊 Scan Report Summary:`, summary);

        res.json({
            success: true,
            date: date,
            totalJobs: jobReports.length,
            totalLabels: totalLabels,
            scannedLabels: totalScannedLabels,
            unscannedLabels: totalLabels - totalScannedLabels,
            scanRate: totalLabels > 0 ? `${Math.round((totalScannedLabels / totalLabels) * 100)}%` : '0%',
            summary: summary,
            jobs: jobReports
        });

    } catch (error) {
        console.error('❌ Scan report error:', error);
        res.status(500).json({
            error: 'Failed to generate scan report',
            details: error.message
        });
    }
};

// ============================================
// GET SCAN REPORT SUMMARY (Dashboard Widget)
// ============================================
exports.getScanReportSummary = async (req, res) => {
    try {
        const userRole = req.user.role;
        const userGroupId = req.user.group_id;

        const today = new Date().toISOString().split('T')[0];

        console.log(`📊 Getting scan report summary for ${today}`);

        let detrackJobs = [];
        try {
            const detrackResponse = await DetrackService.getJobsWithFilters({
                date: today,
                type: 'Delivery',
                limit: 500
            });
            detrackJobs = detrackResponse?.data || [];
        } catch (error) {
            console.error('❌ Failed to fetch jobs from Detrack:', error.message);
            return res.status(500).json({
                error: 'Failed to fetch jobs from Detrack',
                details: error.message
            });
        }

        if (detrackJobs.length === 0) {
            return res.json({
                success: true,
                date: today,
                totalJobs: 0,
                totalLabels: 0,
                scannedLabels: 0,
                unscannedLabels: 0,
                scanRate: '0%',
                summary: {
                    fullyScanned: 0,
                    partiallyScanned: 0,
                    notScanned: 0,
                    labelsNotGenerated: 0
                },
                recentJobs: []
            });
        }

        const doNumbers = detrackJobs.map(job => job.do_number).filter(Boolean);

        let dbJobs = [];
        if (doNumbers.length > 0) {
            const placeholders = doNumbers.map((_, i) => `$${i + 1}`).join(', ');
            const query = `
                SELECT do_number, barcodes, scans
                FROM jobs
                WHERE do_number IN (${placeholders})
            `;
            const result = await pool.query(query, doNumbers);
            dbJobs = result.rows;
        }

        const dbJobMap = {};
        dbJobs.forEach(job => {
            dbJobMap[job.do_number] = job;
        });

        let totalLabels = 0;
        let totalScannedLabels = 0;
        let fullyScanned = 0;
        let partiallyScanned = 0;
        let notScanned = 0;
        let labelsNotGenerated = 0; // 👈 CHANGED
        const recentJobs = [];

        detrackJobs.slice(0, 10).forEach(detrackJob => {
            const doNumber = detrackJob.do_number;
            const dbJob = dbJobMap[doNumber] || null;

            const shippingLabels = parseInt(detrackJob.number_of_shipping_labels) || 
                                  parseInt(detrackJob.cartons) || 
                                  parseInt(detrackJob.boxes) || 1;

            let barcodes = [];
            let scans = [];
            let scannedBarcodes = [];

            if (dbJob) {
                if (dbJob.barcodes) {
                    try {
                        barcodes = typeof dbJob.barcodes === 'string' ? JSON.parse(dbJob.barcodes) : dbJob.barcodes;
                    } catch (e) { barcodes = []; }
                }
                if (dbJob.scans) {
                    try {
                        scans = typeof dbJob.scans === 'string' ? JSON.parse(dbJob.scans) : dbJob.scans;
                    } catch (e) { scans = []; }
                }
                scannedBarcodes = scans.map(s => s.barcode).filter(Boolean);
            }

            const labelCount = barcodes.length > 0 ? barcodes.length : shippingLabels;
            const scannedCount = scannedBarcodes.length;

            totalLabels += labelCount;
            totalScannedLabels += scannedCount;

            let scanStatus = 'labels_not_generated'; // 👈 CHANGED
            if (dbJob) {
                if (scannedCount === 0) {
                    scanStatus = 'not_scanned';
                    notScanned++;
                } else if (scannedCount < labelCount) {
                    scanStatus = 'partially_scanned';
                    partiallyScanned++;
                } else {
                    scanStatus = 'fully_scanned';
                    fullyScanned++;
                }
            } else {
                labelsNotGenerated++; // 👈 CHANGED
            }

            // Build recent jobs list
            recentJobs.push({
                do_number: doNumber,
                recipient_name: detrackJob.deliver_to_collect_from || detrackJob.deliver_to || 'Unknown',
                total_labels: labelCount,
                scanned_count: scannedCount,
                scan_status: scanStatus,
                scan_rate: labelCount > 0 ? `${Math.round((scannedCount / labelCount) * 100)}%` : '0%'
            });
        });

        res.json({
            success: true,
            date: today,
            totalJobs: detrackJobs.length,
            totalLabels: totalLabels,
            scannedLabels: totalScannedLabels,
            unscannedLabels: totalLabels - totalScannedLabels,
            scanRate: totalLabels > 0 ? `${Math.round((totalScannedLabels / totalLabels) * 100)}%` : '0%',
            summary: {
                fullyScanned,
                partiallyScanned,
                notScanned,
                labelsNotGenerated // 👈 CHANGED
            },
            recentJobs: recentJobs
        });

    } catch (error) {
        console.error('❌ Scan report summary error:', error);
        res.status(500).json({
            error: 'Failed to get scan report summary',
            details: error.message
        });
    }
};

// ============================================
// GET JOB SCAN DETAILS
// ============================================
exports.getJobScanDetails = async (req, res) => {
    try {
        const { doNumber } = req.params;

        if (!doNumber) {
            return res.status(400).json({ error: 'DO number is required' });
        }

        console.log(`🔍 Getting scan details for job: ${doNumber}`);

        const query = `
            SELECT 
                do_number,
                customer_name,
                recipient_name,
                delivery_address,
                postcode,
                boxes,
                status,
                scheduled_date,
                barcodes,
                scans,
                group_name,
                created_at
            FROM jobs
            WHERE do_number = $1
        `;
        const result = await pool.query(query, [doNumber]);

        if (result.rows.length === 0) {
            return res.status(404).json({
                error: 'Job not found in database. Labels not generated yet.',
                do_number: doNumber
            });
        }

        const job = result.rows[0];

        let barcodes = [];
        let scans = [];

        if (job.barcodes) {
            try {
                barcodes = typeof job.barcodes === 'string' ? JSON.parse(job.barcodes) : job.barcodes;
            } catch (e) { barcodes = []; }
        }

        if (job.scans) {
            try {
                scans = typeof job.scans === 'string' ? JSON.parse(job.scans) : job.scans;
            } catch (e) { scans = []; }
        }

        // Build scan status for each barcode with full details
        const barcodeStatus = barcodes.map(barcode => {
            const scan = scans.find(s => s.barcode === barcode);
            return {
                barcode: barcode,
                is_scanned: !!scan,
                scan_details: scan ? {
                    staff: scan.staff || 'Unknown',
                    scanned_by: scan.scanned_by || scan.staff || 'Unknown',
                    location: scan.location || 'Unknown',
                    timestamp: scan.timestamp,
                    checkpoint: scan.checkpoint || 'Scanned'
                } : null,
                scanned_at: scan?.timestamp || null,
                scanned_by: scan?.scanned_by || scan?.staff || null,
                location: scan?.location || null,
                checkpoint: scan?.checkpoint || null
            };
        });

        const scannedCount = barcodeStatus.filter(b => b.is_scanned).length;
        const totalCount = barcodeStatus.length;

        // Get scan history with full details
        const scanHistory = scans.map(scan => ({
            barcode: scan.barcode,
            staff: scan.staff || 'Unknown',
            scanned_by: scan.scanned_by || scan.staff || 'Unknown',
            location: scan.location || 'Unknown',
            timestamp: scan.timestamp,
            checkpoint: scan.checkpoint || 'Scanned',
            formatted_time: scan.timestamp ? new Date(scan.timestamp).toLocaleString('en-AU', {
                day: '2-digit',
                month: '2-digit',
                year: 'numeric',
                hour: '2-digit',
                minute: '2-digit',
                second: '2-digit',
                hour12: false
            }) : 'N/A'
        }));

        res.json({
            success: true,
            do_number: doNumber,
            customer_name: job.customer_name,
            recipient_name: job.recipient_name,
            address: job.delivery_address,
            postcode: job.postcode,
            status: job.status,
            scheduled_date: job.scheduled_date,
            group_name: job.group_name,
            total_labels: totalCount,
            scanned_count: scannedCount,
            unscanned_count: totalCount - scannedCount,
            scan_rate: totalCount > 0 ? `${Math.round((scannedCount / totalCount) * 100)}%` : '0%',
            is_fully_scanned: scannedCount === totalCount && totalCount > 0,
            barcode_status: barcodeStatus,
            scan_history: scanHistory, // 👈 NEW: Full scan history
            scans: scans
        });

    } catch (error) {
        console.error('❌ Get job scan details error:', error);
        res.status(500).json({
            error: 'Failed to get job scan details',
            details: error.message
        });
    }
};

// ============================================
// EXPORT SCAN REPORT AS CSV
// ============================================
exports.exportScanReport = async (req, res) => {
    try {
        const { date } = req.query;

        if (!date) {
            return res.status(400).json({ error: 'Date is required (YYYY-MM-DD)' });
        }

        const report = await exports.getScanReportData(date);

        if (!report || report.jobs.length === 0) {
            return res.status(404).json({ error: 'No data found for this date' });
        }

        let csv = 'DO Number,Recipient,Address,Postcode,Total Labels,Scanned,Unscanned,Scan Rate,Status\n';
        
        report.jobs.forEach(job => {
            const statusLabel = job.scan_status === 'labels_not_generated' 
                ? 'Labels Not Generated' 
                : job.scan_status === 'fully_scanned' 
                    ? 'Fully Scanned' 
                    : job.scan_status === 'partially_scanned' 
                        ? 'Partially Scanned' 
                        : 'Not Scanned';
            
            csv += `${job.do_number},`;
            csv += `"${job.recipient_name || 'Unknown'}",`;
            csv += `"${job.address || ''}",`;
            csv += `${job.postcode || ''},`;
            csv += `${job.total_labels},`;
            csv += `${job.scanned_count},`;
            csv += `${job.unscanned_count},`;
            csv += `${job.scan_rate},`;
            csv += `${statusLabel}\n`;
        });

        res.setHeader('Content-Type', 'text/csv');
        res.setHeader('Content-Disposition', `attachment; filename=scan_report_${date}.csv`);
        res.send(csv);

    } catch (error) {
        console.error('❌ Export scan report error:', error);
        res.status(500).json({
            error: 'Failed to export scan report',
            details: error.message
        });
    }
};

// ============================================
// HELPER: Get scan report data
// ============================================
exports.getScanReportData = async (date) => {
    try {
        const detrackResponse = await DetrackService.getJobsWithFilters({
            date: date,
            type: 'Delivery',
            limit: 500
        });
        const detrackJobs = detrackResponse?.data || [];

        if (detrackJobs.length === 0) {
            return { date, jobs: [], summary: {} };
        }

        const doNumbers = detrackJobs.map(job => job.do_number).filter(Boolean);

        let dbJobs = [];
        if (doNumbers.length > 0) {
            const placeholders = doNumbers.map((_, i) => `$${i + 1}`).join(', ');
            const query = `
                SELECT do_number, barcodes, scans
                FROM jobs
                WHERE do_number IN (${placeholders})
            `;
            const result = await pool.query(query, doNumbers);
            dbJobs = result.rows;
        }

        const dbJobMap = {};
        dbJobs.forEach(job => {
            dbJobMap[job.do_number] = job;
        });

        const jobReports = [];
        let totalLabels = 0;
        let totalScannedLabels = 0;

        detrackJobs.forEach(detrackJob => {
            const doNumber = detrackJob.do_number;
            const dbJob = dbJobMap[doNumber] || null;

            const shippingLabels = parseInt(detrackJob.number_of_shipping_labels) || 
                                  parseInt(detrackJob.cartons) || 
                                  parseInt(detrackJob.boxes) || 1;

            let barcodes = [];
            let scans = [];
            let scannedBarcodes = [];
            let isInDatabase = false;

            if (dbJob) {
                isInDatabase = true;
                if (dbJob.barcodes) {
                    try {
                        barcodes = typeof dbJob.barcodes === 'string' ? JSON.parse(dbJob.barcodes) : dbJob.barcodes;
                    } catch (e) { barcodes = []; }
                }
                if (dbJob.scans) {
                    try {
                        scans = typeof dbJob.scans === 'string' ? JSON.parse(dbJob.scans) : dbJob.scans;
                    } catch (e) { scans = []; }
                }
                scannedBarcodes = scans.map(s => s.barcode).filter(Boolean);
            }

            const labelCount = barcodes.length > 0 ? barcodes.length : shippingLabels;
            const scannedCount = scannedBarcodes.length;
            const unscannedCount = labelCount - scannedCount;

            totalLabels += labelCount;
            totalScannedLabels += scannedCount;

            let scanStatus = 'labels_not_generated';
            if (isInDatabase) {
                if (scannedCount === 0) {
                    scanStatus = 'not_scanned';
                } else if (scannedCount < labelCount) {
                    scanStatus = 'partially_scanned';
                } else {
                    scanStatus = 'fully_scanned';
                }
            }

            jobReports.push({
                do_number: doNumber,
                recipient_name: detrackJob.deliver_to_collect_from || detrackJob.deliver_to || 'Unknown',
                address: detrackJob.address || '',
                postcode: detrackJob.postal_code || '',
                total_labels: labelCount,
                scanned_count: scannedCount,
                unscanned_count: unscannedCount,
                scan_rate: labelCount > 0 ? `${Math.round((scannedCount / labelCount) * 100)}%` : '0%',
                scan_status: scanStatus,
                is_in_database: isInDatabase,
                barcodes: barcodes,
                scanned_barcodes: scannedBarcodes
            });
        });

        return {
            date,
            jobs: jobReports,
            totalLabels,
            totalScannedLabels,
            summary: {
                totalJobs: jobReports.length,
                fullyScanned: jobReports.filter(j => j.scan_status === 'fully_scanned').length,
                partiallyScanned: jobReports.filter(j => j.scan_status === 'partially_scanned').length,
                notScanned: jobReports.filter(j => j.scan_status === 'not_scanned').length,
                labelsNotGenerated: jobReports.filter(j => j.scan_status === 'labels_not_generated').length
            }
        };
    } catch (error) {
        console.error('❌ Get scan report data error:', error);
        throw error;
    }
};