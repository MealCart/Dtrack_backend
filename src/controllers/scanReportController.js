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
            let scanStatus = 'labels_not_generated';
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
                scan_details: scanDetails,
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
            labelsNotGenerated: jobReports.filter(j => j.scan_status === 'labels_not_generated').length
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
        let labelsNotGenerated = 0;
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

            let scanStatus = 'labels_not_generated';
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
                labelsNotGenerated++;
            }

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
                labelsNotGenerated
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

        // ===== STEP 1: Try to fetch from database first =====
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

        // ===== STEP 2: If found in database, return database data =====
        if (result.rows.length > 0) {
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

            // Build barcode status
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

            return res.json({
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
                is_in_database: true,
                barcode_status: barcodeStatus,
                scan_history: scanHistory,
                scans: scans
            });
        }

        // ===== STEP 3: If NOT in database, fetch from Detrack =====
        console.log(`📦 Job ${doNumber} not in database, fetching from Detrack...`);

        try {
            // Fetch job from Detrack
            const detrackJob = await DetrackService.getJobByDoNumber(doNumber);
            
            if (!detrackJob) {
                return res.status(404).json({
                    error: 'Job not found',
                    message: 'Job not found in Detrack or database'
                });
            }

            // Get shipping labels count from Detrack
            const shippingLabels = parseInt(detrackJob.number_of_shipping_labels) || 
                                  parseInt(detrackJob.cartons) || 
                                  parseInt(detrackJob.boxes) || 1;

            // Generate barcodes based on shipping labels count
            const barcodes = [];
            for (let i = 0; i < shippingLabels; i++) {
                barcodes.push(`${doNumber}-${String(i + 1).padStart(2, '0')}`);
            }

            // Build barcode status (all not scanned since not in database)
            const barcodeStatus = barcodes.map(barcode => ({
                barcode: barcode,
                is_scanned: false,
                scan_details: null,
                scanned_at: null,
                scanned_by: null,
                location: null,
                checkpoint: 'Pending'
            }));

            return res.json({
                success: true,
                do_number: doNumber,
                customer_name: detrackJob.deliver_to_collect_from || detrackJob.deliver_to || 'Unknown',
                recipient_name: detrackJob.deliver_to_collect_from || detrackJob.deliver_to || 'Unknown',
                address: detrackJob.address || 'No address',
                postcode: detrackJob.postal_code || '',
                status: detrackJob.status || detrackJob.primary_job_status || 'pending',
                scheduled_date: detrackJob.date || null,
                group_name: detrackJob.group_name || '',
                total_labels: shippingLabels,
                scanned_count: 0,
                unscanned_count: shippingLabels,
                scan_rate: '0%',
                is_fully_scanned: false,
                is_in_database: false,
                barcode_status: barcodeStatus,
                scan_history: [],
                scans: [],
                _source: 'detrack',
                _message: 'Job exists in Detrack but labels not generated in database yet.'
            });

        } catch (detrackError) {
            console.error('❌ Failed to fetch from Detrack:', detrackError.message);
            return res.status(404).json({
                error: 'Job not found',
                message: 'Job not found in Detrack or database'
            });
        }

    } catch (error) {
        console.error('❌ Get job scan details error:', error);
        res.status(500).json({
            error: 'Failed to get job scan details',
            details: error.message
        });
    }
};

// ============================================
// EXPORT UNSCANNED LABELS ONLY
// ============================================
exports.exportUnscannedLabels = async (req, res) => {
    try {
        const { date } = req.query;

        if (!date) {
            return res.status(400).json({ error: 'Date is required (YYYY-MM-DD)' });
        }

        console.log(`📊 Exporting unscanned labels for date: ${date}`);

        // Get the scan report first
        const reportData = await exports.getScanReportData(date);

        if (!reportData || reportData.jobs.length === 0) {
            return res.status(404).json({ error: 'No data found for this date' });
        }

        // Build CSV with only unscanned labels
        let csv = 'DO Number,Recipient,Postcode,Total Labels,Unscanned Labels,Unscanned Barcodes\n';
        let totalUnscanned = 0;

        reportData.jobs.forEach(job => {
            if (job.unscanned_count > 0) {
                // Get the unscanned barcodes for this job
                const unscannedBarcodes = job.barcodes.filter(function(barcode) {
                    return !job.scanned_barcodes.includes(barcode);
                });

                totalUnscanned += unscannedBarcodes.length;

                // Add a row for each unscanned barcode
                unscannedBarcodes.forEach(function(barcode) {
                    csv += job.do_number + ',';
                    csv += '"' + (job.recipient_name || 'Unknown') + '",';
                    csv += (job.postcode || '') + ',';
                    csv += job.total_labels + ',';
                    csv += job.unscanned_count + ',';
                    csv += barcode + '\n';
                });
            }
        });

        // Add summary at the top
        const summary = 'Total Unscanned Labels: ' + totalUnscanned + '\n\n';
        csv = summary + csv;

        res.setHeader('Content-Type', 'text/csv');
        res.setHeader('Content-Disposition', 'attachment; filename=unscanned_labels_' + date + '.csv');
        res.send(csv);

        console.log('✅ Exported ' + totalUnscanned + ' unscanned labels for ' + date);

    } catch (error) {
        console.error('❌ Export unscanned labels error:', error);
        res.status(500).json({
            error: 'Failed to export unscanned labels',
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
        
        report.jobs.forEach(function(job) {
            var statusLabel;
            if (job.scan_status === 'labels_not_generated') {
                statusLabel = 'Labels Not Generated';
            } else if (job.scan_status === 'fully_scanned') {
                statusLabel = 'Fully Scanned';
            } else if (job.scan_status === 'partially_scanned') {
                statusLabel = 'Partially Scanned';
            } else {
                statusLabel = 'Not Scanned';
            }
            
            csv += job.do_number + ',';
            csv += '"' + (job.recipient_name || 'Unknown') + '",';
            csv += '"' + (job.address || '') + '",';
            csv += (job.postcode || '') + ',';
            csv += job.total_labels + ',';
            csv += job.scanned_count + ',';
            csv += job.unscanned_count + ',';
            csv += job.scan_rate + ',';
            csv += statusLabel + '\n';
        });

        res.setHeader('Content-Type', 'text/csv');
        res.setHeader('Content-Disposition', 'attachment; filename=scan_report_' + date + '.csv');
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
            return { date: date, jobs: [], summary: {} };
        }

        const doNumbers = detrackJobs.map(function(job) { return job.do_number; }).filter(Boolean);

        let dbJobs = [];
        if (doNumbers.length > 0) {
            const placeholders = doNumbers.map(function(_, i) { return '$' + (i + 1); }).join(', ');
            const query = `
                SELECT do_number, barcodes, scans
                FROM jobs
                WHERE do_number IN (${placeholders})
            `;
            const result = await pool.query(query, doNumbers);
            dbJobs = result.rows;
        }

        const dbJobMap = {};
        dbJobs.forEach(function(job) {
            dbJobMap[job.do_number] = job;
        });

        const jobReports = [];
        let totalLabels = 0;
        let totalScannedLabels = 0;

        detrackJobs.forEach(function(detrackJob) {
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
                
                // Parse barcodes from database
                if (dbJob.barcodes) {
                    try {
                        barcodes = typeof dbJob.barcodes === 'string' ? JSON.parse(dbJob.barcodes) : dbJob.barcodes;
                    } catch (e) { 
                        barcodes = []; 
                    }
                }

                // Parse scans from database
                if (dbJob.scans) {
                    try {
                        scans = typeof dbJob.scans === 'string' ? JSON.parse(dbJob.scans) : dbJob.scans;
                    } catch (e) { 
                        scans = []; 
                    }
                }

                // 👇 FIX: Extract scanned barcodes from scans array
                scannedBarcodes = [];
                if (scans && scans.length > 0) {
                    scannedBarcodes = scans.map(function(s) { 
                        return s.barcode; 
                    }).filter(Boolean);
                }
            }

            // 👇 FIX: Use barcodes from database, or generate from shipping labels
            const labelCount = barcodes.length > 0 ? barcodes.length : shippingLabels;
            
            // 👇 FIX: If barcodes is empty but we have shippingLabels, generate them
            if (barcodes.length === 0 && shippingLabels > 0) {
                for (let i = 0; i < shippingLabels; i++) {
                    barcodes.push(doNumber + '-' + String(i + 1).padStart(2, '0'));
                }
            }

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
                scan_rate: labelCount > 0 ? Math.round((scannedCount / labelCount) * 100) + '%' : '0%',
                scan_status: scanStatus,
                is_in_database: isInDatabase,
                barcodes: barcodes,
                scanned_barcodes: scannedBarcodes
            });
        });

        return {
            date: date,
            jobs: jobReports,
            totalLabels: totalLabels,
            totalScannedLabels: totalScannedLabels,
            summary: {
                totalJobs: jobReports.length,
                fullyScanned: jobReports.filter(function(j) { return j.scan_status === 'fully_scanned'; }).length,
                partiallyScanned: jobReports.filter(function(j) { return j.scan_status === 'partially_scanned'; }).length,
                notScanned: jobReports.filter(function(j) { return j.scan_status === 'not_scanned'; }).length,
                labelsNotGenerated: jobReports.filter(function(j) { return j.scan_status === 'labels_not_generated'; }).length
            }
        };
    } catch (error) {
        console.error('❌ Get scan report data error:', error);
        throw error;
    }
};

exports.getUnscannedLabelsData = async (req, res) => {
    try {
        const { date } = req.query;

        if (!date) {
            return res.status(400).json({ error: 'Date is required (YYYY-MM-DD)' });
        }

        console.log(`📊 Getting unscanned labels data for date: ${date}`);

        const reportData = await exports.getScanReportData(date);

        if (!reportData || reportData.jobs.length === 0) {
            return res.json({
                success: true,
                date: date,
                totalUnscanned: 0,
                jobs: []
            });
        }

        // Build unscanned labels list
        const unscannedJobs = [];
        let totalUnscanned = 0;

        reportData.jobs.forEach(job => {
            if (job.unscanned_count > 0) {
                const unscannedBarcodes = job.barcodes.filter(function(barcode) {
                    return !job.scanned_barcodes.includes(barcode);
                });

                totalUnscanned += unscannedBarcodes.length;

                unscannedJobs.push({
                    do_number: job.do_number,
                    recipient_name: job.recipient_name || 'Unknown',
                    postcode: job.postcode || '',
                    total_labels: job.total_labels,
                    scanned_count: job.scanned_count,
                    unscanned_count: job.unscanned_count,
                    scan_rate: job.scan_rate,
                    scan_status: job.scan_status,
                    unscanned_barcodes: unscannedBarcodes
                });
            }
        });

        res.json({
            success: true,
            date: date,
            totalUnscanned: totalUnscanned,
            totalJobs: unscannedJobs.length,
            jobs: unscannedJobs
        });

    } catch (error) {
        console.error('❌ Get unscanned labels data error:', error);
        res.status(500).json({
            error: 'Failed to get unscanned labels data',
            details: error.message
        });
    }
};
