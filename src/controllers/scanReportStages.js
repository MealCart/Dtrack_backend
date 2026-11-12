// Warehouse and delivery are independent evidence stages for the same stored labels.
const key = value => String(value ?? '').trim().replace(/^#/, '');
function deliveryStage(job, labels, warehouseScanned) {
    if (job.delivery_unavailable) return { available: false, scanned_count: null, missing_count: null, status: 'unavailable', barcodes: [], history: [], completed: false, warehouse_missing_barcodes: [] };
    const events = job.delivery_events || [];
    const byCode = new Map();
    for (const event of events) if (event.kind === 'scan' && labels.some(label => key(label) === key(event.barcode))) {
        if (!byCode.has(key(event.barcode))) byCode.set(key(event.barcode), event);
    }
    const scanned = labels.filter(label => byCode.has(key(label)));
    const completed = events.find(event => event.kind === 'completion');
    return {
        available: true, scanned_count: scanned.length, missing_count: labels.length - scanned.length,
        status: !labels.length ? 'labels_not_generated' : scanned.length === labels.length ? 'fully_scanned' : scanned.length ? 'partially_scanned' : 'not_scanned',
        completed: !!completed, completed_at: completed?.scanned_at || null,
        warehouse_missing_barcodes: scanned.filter(label => !warehouseScanned.includes(label)),
        barcodes: labels.map(barcode => { const event = byCode.get(key(barcode));return { barcode, is_scanned: !!event, driver_id: event?.driver_id || null, scanned_at: event?.scanned_at || null, plan_id: event?.plan_id || null }; }),
        history: events.filter(event => event.kind === 'scan' && labels.some(label => key(label) === key(event.barcode)))
    };
}
async function attachDelivery(pool, rows) {
    if (!rows.length) return rows;
    try {
        const result = await pool.query(`
            SELECT s.job_id, s.barcode, s.driver_id, s.scanned_at, s.plan_id, 'scan' AS kind
            FROM mealcart_parcel_scans s
            JOIN route_plans p ON p.public_id = s.plan_id AND p.created_at = s.plan_created_at
            JOIN jobs j ON j.id = s.job_id AND j.do_number = s.do_number AND j.scheduled_date = p.plan_date
            WHERE j.id = ANY($1::int[])
            UNION ALL
            SELECT c.job_id, NULL AS barcode, c.driver_id, c.completed_at AS scanned_at, c.plan_id, 'completion' AS kind
            FROM mealcart_delivery_completions c
            JOIN route_plans p ON p.public_id = c.plan_id AND p.created_at = c.plan_created_at
            JOIN jobs j ON j.id = c.job_id AND j.do_number = c.do_number AND j.scheduled_date = p.plan_date
            WHERE j.id = ANY($1::int[])
            ORDER BY scanned_at DESC`, [[...new Set(rows.map(row => row.id))]]);
        return rows.map(row => ({ ...row, delivery_events: result.rows.filter(event => event.job_id === row.id) }));
    } catch (error) {
        // An older deployment can still display warehouse evidence without pretending delivery has zero scans.
        if (error.code !== '42P01') throw error;
        return rows.map(row => ({ ...row, delivery_unavailable: true }));
    }
}
module.exports = { deliveryStage, attachDelivery };
