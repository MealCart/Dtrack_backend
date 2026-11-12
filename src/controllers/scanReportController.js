// src/controllers/scanReportController.js
const { pool } = require('../config/database');
const {deliveryStage, attachDelivery} = require('./scanReportStages');

// Customer reports are scoped to the order owner, never legacy external groups.
// Admin and staff have operational access to all orders.
const buildOwnershipFilter = (userRole, userId, startIndex = 2) => {
    if (['admin', 'staff'].includes(userRole)) return { clause: '', params: [] };
    if (userRole === 'customer' && Number.isSafeInteger(Number(userId)) && Number(userId) > 0) {
        return { clause: `AND user_id = $${startIndex}`, params: [Number(userId)] };
    }
    return { clause: 'AND 1 = 0', params: [] };
};

// ============================================
// HELPER: Parse barcodes safely (jsonb → array)
// ============================================
const parseBarcodes = (raw) => {
    if (!raw) return [];
    if (Array.isArray(raw)) return raw;
    try {
        const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
        return Array.isArray(parsed) ? parsed : [];
    } catch {
        return [];
    }
};

// ============================================
// HELPER: Parse scans safely (jsonb → array)
// ============================================
const parseScans = (raw) => {
    if (!raw) return [];
    if (Array.isArray(raw)) return raw;
    try {
        const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
        return Array.isArray(parsed) ? parsed : [];
    } catch {
        return [];
    }
};

// ============================================
// HELPER: Compute scan report for a single job row
// Uses only stored labels and matching database scan events.
// ============================================
const computeJobScanReport = (dbJob) => {
    const barcodes = [...new Set(parseBarcodes(dbJob.barcodes).filter(value => typeof value === 'string' && value.trim()))];
    const scans = parseScans(dbJob.scans).filter(s => s && typeof s === 'object');

    // A barcode is "scanned" only if a matching scan entry exists
    const scannedBarcodes = [...new Set(scans.filter(s => s && typeof s === 'object').map(s => s.barcode).filter(barcode => barcodes.includes(barcode)))];

    const scanDetails = scans.map(s => ({
        barcode: s.barcode,
        scanned_by: s.scanned_by || s.staff || 'Unknown',
        staff: s.staff || 'Unknown',
        location: s.location || 'Unknown',
        timestamp: s.timestamp,
        checkpoint: s.checkpoint || 'Scanned'
    }));

    const totalLabels = barcodes.length;
    const scannedCount = scannedBarcodes.length;
    const unscannedCount = Math.max(0, totalLabels - scannedCount);

    // Jobs without stored labels have no generated labels to scan.
    let scanStatus;
    if (totalLabels === 0) {
        scanStatus = 'labels_not_generated';
    } else if (scannedCount === 0) {
        scanStatus = 'not_scanned';
    } else if (scannedCount < totalLabels) {
        scanStatus = 'partially_scanned';
    } else {
        scanStatus = 'fully_scanned';
    }

    return {
        do_number: dbJob.do_number,
        delivery: deliveryStage(dbJob, barcodes, scannedBarcodes),
        recipient_name: dbJob.recipient_name || dbJob.customer_name || 'Unknown',
        address: dbJob.delivery_address || '',
        postcode: dbJob.postcode || '',
        total_labels: totalLabels,
        scanned_count: scannedCount,
        unscanned_count: unscannedCount,
        scan_rate: totalLabels > 0
            ? `${Math.round((scannedCount / totalLabels) * 100)}%`
            : '0%',
        scan_status: scanStatus,
        is_in_database: true,
        barcodes,
        scanned_barcodes: scannedBarcodes,
        scan_details: scanDetails,
        scans,
        db_status: dbJob.status || null,
        group_name: dbJob.group_name || '',
        created_at: dbJob.created_at || null
    };
};

// ============================================
// GET SCAN REPORT FOR A SPECIFIC DATE
// ============================================
exports.getScanReport = async (req, res) => {
    try {
        const { date } = req.query;
        const userRole = req.user.role;
        const userId = req.user.id;

        if (!date) {
            return res.status(400).json({ error: 'Date is required (YYYY-MM-DD)' });
        }

        const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
        if (!dateRegex.test(date)) {
            return res.status(400).json({ error: 'Invalid date format. Use YYYY-MM-DD' });
        }

        console.log(`📊 Scan report for date: ${date}, role: ${userRole}, user_id: ${userId || 'none'}`);

        const ownershipFilter = buildOwnershipFilter(userRole, userId, 2);

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
                group_id,
                user_id,
                created_at,
                updated_at
            FROM jobs
            WHERE scheduled_date = $1
            ${ownershipFilter.clause}
            ORDER BY do_number
        `;

        const params = [date, ...ownershipFilter.params];
        const result = await pool.query(query, params);
        const dbJobs = await attachDelivery(pool, result.rows);

        console.log(`📦 Found ${dbJobs.length} jobs in database for ${date}`);

        if (dbJobs.length === 0) {
            return res.json({
                success: true,
                date,
                totalJobs: 0,
                totalLabels: 0,
                scannedLabels: 0,
                unscannedLabels: 0,
                scanRate: '0%',
                summary: {
                    totalJobs: 0,
                    fullyScanned: 0,
                    partiallyScanned: 0,
                    notScanned: 0,
                    labelsNotGenerated: 0,
                    totalLabels: 0,
                    scannedLabels: 0,
                    unscannedLabels: 0,
                    scanRate: '0%'
                },
                jobs: []
            });
        }

        const jobReports = dbJobs.map(computeJobScanReport);

        let totalLabels = 0;
        let totalScannedLabels = 0;
        let fullyScanned = 0;
        let partiallyScanned = 0;
        let notScanned = 0;

        jobReports.forEach(j => {
            totalLabels += j.total_labels;
            totalScannedLabels += j.scanned_count;

            switch (j.scan_status) {
                case 'fully_scanned': fullyScanned++; break;
                case 'partially_scanned': partiallyScanned++; break;
                case 'not_scanned': notScanned++; break;
            }
        });

        const unscannedLabels = totalLabels - totalScannedLabels;
        const scanRate = totalLabels > 0
            ? `${Math.round((totalScannedLabels / totalLabels) * 100)}%`
            : '0%';

        const summary = {
            totalJobs: jobReports.length,
            fullyScanned,
            partiallyScanned,
            notScanned,
            labelsNotGenerated: jobReports.filter(j => j.scan_status === 'labels_not_generated').length,
            totalLabels,
            scannedLabels: totalScannedLabels,
            unscannedLabels,
            scanRate
        };

        console.log(`📊 Summary:`, summary);

        res.json({
            success: true,
            date,
            totalJobs: jobReports.length,
            totalLabels,
            scannedLabels: totalScannedLabels,
            unscannedLabels,
            scanRate,
            summary,
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
        const userId = req.user.id;

        const today = new Date().toISOString().split('T')[0];

        console.log(`📊 Scan summary for ${today}`);

        const ownershipFilter = buildOwnershipFilter(userRole, userId, 2);

        const query = `
            SELECT
                id,
                do_number,
                recipient_name,
                customer_name,
                barcodes,
                scans,
                scheduled_date
            FROM jobs
            WHERE scheduled_date = $1
            ${ownershipFilter.clause}
            ORDER BY do_number
        `;

        const params = [today, ...ownershipFilter.params];
        const result = await pool.query(query, params);
        const dbJobs = await attachDelivery(pool, result.rows);

        if (dbJobs.length === 0) {
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
                    notScanned: 0
                },
                recentJobs: []
            });
        }

        const allReports = dbJobs.map(computeJobScanReport);

        let totalLabels = 0;
        let totalScannedLabels = 0;
        let fullyScanned = 0;
        let partiallyScanned = 0;
        let notScanned = 0;

        allReports.forEach(j => {
            totalLabels += j.total_labels;
            totalScannedLabels += j.scanned_count;

            switch (j.scan_status) {
                case 'fully_scanned': fullyScanned++; break;
                case 'partially_scanned': partiallyScanned++; break;
                case 'not_scanned': notScanned++; break;
            }
        });

        const recentJobs = allReports.slice(0, 10).map(j => ({
            do_number: j.do_number,
            recipient_name: j.recipient_name,
            total_labels: j.total_labels,
            scanned_count: j.scanned_count,
            scan_status: j.scan_status,
            scan_rate: j.scan_rate
        }));

        res.json({
            success: true,
            date: today,
            totalJobs: dbJobs.length,
            totalLabels,
            scannedLabels: totalScannedLabels,
            unscannedLabels: totalLabels - totalScannedLabels,
            scanRate: totalLabels > 0
                ? `${Math.round((totalScannedLabels / totalLabels) * 100)}%`
                : '0%',
            summary: {
                fullyScanned,
                partiallyScanned,
                notScanned,
                labelsNotGenerated: allReports.filter(j => j.scan_status === 'labels_not_generated').length
            },
            recentJobs
        });

    } catch (error) {
        console.error('❌ Scan summary error:', error);
        res.status(500).json({
            error: 'Failed to get scan report summary',
            details: error.message
        });
    }
};

// ============================================
// GET JOB SCAN DETAILS — DB ONLY
// ============================================
exports.getJobScanDetails = async (req, res) => {
    try {
        const { doNumber } = req.params;

        if (!doNumber) {
            return res.status(400).json({ error: 'DO number is required' });
        }

        console.log(`🔍 Scan details for job: ${doNumber}`);

        const scope = buildOwnershipFilter(req.user.role, req.user.id, 2);
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
                group_name,
                group_id,
                created_at
            FROM jobs
            WHERE do_number = $1
            ${scope.clause}
            ORDER BY id DESC
            LIMIT 1
        `;
        const result = await pool.query(query, [doNumber, ...scope.params]);

        if (result.rows.length === 0) {
            return res.status(404).json({
                error: 'Job not found',
                message: `Job ${doNumber} was not found in the database.`
            });
        }

        const job = (await attachDelivery(pool, result.rows))[0];

        const barcodes = [...new Set(parseBarcodes(job.barcodes).filter(value => typeof value === 'string' && value.trim()))];
        const scans = parseScans(job.scans).filter(s => s && typeof s === 'object');

        const barcodeStatus = barcodes.map(barcode => {
            const scan = scans.find(s => s.barcode === barcode);
            return {
                barcode,
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
            formatted_time: scan.timestamp
                ? new Date(scan.timestamp).toLocaleString('en-AU', {
                    day: '2-digit',
                    month: '2-digit',
                    year: 'numeric',
                    hour: '2-digit',
                    minute: '2-digit',
                    second: '2-digit',
                    hour12: false
                })
                : 'N/A'
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
            scan_rate: totalCount > 0
                ? `${Math.round((scannedCount / totalCount) * 100)}%`
                : '0%',
            is_fully_scanned: scannedCount === totalCount && totalCount > 0,
            is_in_database: true,
            _source: 'database',
            delivery: deliveryStage(job, barcodes, barcodeStatus.filter(b => b.is_scanned).map(b => b.barcode)),
            barcode_status: barcodeStatus,
            scan_history: scanHistory,
            scans
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
// HELPER: Get scan report data (for exports)
// ============================================
const getScanReportData = async (date, userRole, userId) => {
    const ownershipFilter = buildOwnershipFilter(userRole, userId, 2);

    const query = `
        SELECT
            id,
            status,
            do_number,
            recipient_name,
            customer_name,
            delivery_address,
            postcode,
            barcodes,
            scans,
            scheduled_date,
            group_name,
            group_id
        FROM jobs
        WHERE scheduled_date = $1
        ${ownershipFilter.clause}
        ORDER BY do_number
    `;
    const params = [date, ...ownershipFilter.params];
    const result = await pool.query(query, params);

    const jobReports = (await attachDelivery(pool, result.rows)).map(computeJobScanReport);

    let totalLabels = 0;
    let totalScannedLabels = 0;
    jobReports.forEach(j => {
        totalLabels += j.total_labels;
        totalScannedLabels += j.scanned_count;
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
            notScanned: jobReports.filter(j => j.scan_status === 'not_scanned').length
        }
    };
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

        const report = await getScanReportData(
            date,
            req.user.role,
            req.user.id
        );

        if (!report || report.jobs.length === 0) {
            return res.status(404).json({ error: 'No data found for this date' });
        }

        const esc = (val) => `"${String(val ?? '').replace(/"/g, '""')}"`;

        let csv = 'DO Number,Recipient,Address,Postcode,Total Labels,Warehouse Scanned,Warehouse Missing,Warehouse Scan Rate,Warehouse Status,Delivery Scanned,Delivery Missing,Delivery Scan Status,Delivery Completed,Delivery Scanned But Warehouse Missing\n';

        report.jobs.forEach(job => {
            let statusLabel;
            if (job.scan_status === 'fully_scanned') statusLabel = 'Fully Scanned';
            else if (job.scan_status === 'partially_scanned') statusLabel = 'Partially Scanned';
            else if (job.scan_status === 'labels_not_generated') statusLabel = 'Labels Not Generated';
            else statusLabel = 'Not Scanned';

            csv += job.do_number + ',';
            csv += esc(job.recipient_name || 'Unknown') + ',';
            csv += esc(job.address || '') + ',';
            csv += esc(job.postcode || '') + ',';
            csv += job.total_labels + ',';
            csv += job.scanned_count + ',';
            csv += job.unscanned_count + ',';
            csv += esc(job.scan_rate) + ',';
            csv += esc(statusLabel) + ',' + (job.delivery.scanned_count ?? '') + ',' + (job.delivery.missing_count ?? '') + ',' + esc(job.delivery.status) + ',' + esc(!job.delivery.available ? 'Unavailable' : job.delivery.completed ? 'Yes' : 'No') + ',' + esc(job.delivery.warehouse_missing_barcodes.join('; ')) + '\n';
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
// EXPORT UNSCANNED LABELS AS CSV
// ============================================
exports.exportUnscannedLabels = async (req, res) => {
    try {
        const { date } = req.query;

        if (!date) {
            return res.status(400).json({ error: 'Date is required (YYYY-MM-DD)' });
        }

        console.log(`📊 Exporting unscanned labels for date: ${date}`);

        const report = await getScanReportData(
            date,
            req.user.role,
            req.user.id
        );

        const esc = (val) => `"${String(val ?? '').replace(/"/g, '""')}"`;

        let csv = 'DO Number,Recipient,Postcode,Total Labels,Unscanned Labels,Unscanned Barcodes\n';
        let totalUnscanned = 0;

        report.jobs.forEach(job => {
            if (job.unscanned_count > 0 && job.barcodes.length > 0) {
                const unscannedBarcodes = job.barcodes.filter(
                    barcode => !job.scanned_barcodes.includes(barcode)
                );

                totalUnscanned += unscannedBarcodes.length;

                unscannedBarcodes.forEach(barcode => {
                    csv += job.do_number + ',';
                    csv += esc(job.recipient_name || 'Unknown') + ',';
                    csv += esc(job.postcode || '') + ',';
                    csv += job.total_labels + ',';
                    csv += job.unscanned_count + ',';
                    csv += esc(barcode) + '\n';
                });
            }
        });

        const summary = `Total Unscanned Labels: ${totalUnscanned}\n\n`;
        csv = summary + csv;

        res.setHeader('Content-Type', 'text/csv');
        res.setHeader('Content-Disposition', `attachment; filename=unscanned_labels_${date}.csv`);
        res.send(csv);

        console.log(`✅ Exported ${totalUnscanned} unscanned labels for ${date}`);

    } catch (error) {
        console.error('❌ Export unscanned labels error:', error);
        res.status(500).json({
            error: 'Failed to export unscanned labels',
            details: error.message
        });
    }
};

// ============================================
// GET UNSCANNED LABELS DATA (JSON)
// ============================================
exports.getUnscannedLabelsData = async (req, res) => {
    try {
        const { date } = req.query;

        if (!date) {
            return res.status(400).json({ error: 'Date is required (YYYY-MM-DD)' });
        }

        console.log(`📊 Unscanned labels data for date: ${date}`);

        const reportData = await getScanReportData(
            date,
            req.user.role,
            req.user.id
        );

        const unscannedJobs = [];
        let totalUnscanned = 0;

        reportData.jobs.forEach(job => {
            if (job.unscanned_count > 0 && job.barcodes.length > 0) {
                const unscannedBarcodes = job.barcodes.filter(
                    barcode => !job.scanned_barcodes.includes(barcode)
                );

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
            date,
            totalUnscanned,
            totalJobs: unscannedJobs.length,
            jobs: unscannedJobs
        });

    } catch (error) {
        console.error('❌ Unscanned labels data error:', error);
        res.status(500).json({
            error: 'Failed to get unscanned labels data',
            details: error.message
        });
    }
};