const { pool } = require('../config/database');
function httpError(status, message) { return Object.assign(new Error(message), { status }); }
function scope(req, params, prefix = '') {
  if (!['admin', 'staff', 'customer'].includes(req.user?.role)) throw httpError(403, 'Access denied');
  if (req.user.role !== 'customer') return '';
  params.push(req.user.id);
  return ` AND ${prefix}user_id = $${params.length}`;
}
function array(value) { if (Array.isArray(value)) return value; try { const parsed = JSON.parse(value); return Array.isArray(parsed) ? parsed : []; } catch { return []; } }
async function find(req, reference, type = 'delivery', db = pool, lock = false) {
  if (typeof reference !== 'string' || !reference) throw httpError(400, 'Booking reference is required');
  const params = [reference];
  const where = scope(req, params);
  const table = type === 'collection' ? 'collections' : 'jobs';
  const result = await db.query(`SELECT * FROM ${table} WHERE do_number = $1${where} ORDER BY id DESC LIMIT 1${lock ? ' FOR UPDATE' : ''}`, params);
  if (!result.rows.length) throw httpError(404, 'Booking not found in database');
  return result.rows[0];
}
// Compatibility fields for older portal screens; all values originate in PostgreSQL.
function legacy(row, type = 'delivery') {
  return { ...row, type: type === 'collection' ? 'Collection' : 'Delivery',
    date: row.scheduled_date, address: row.delivery_address || row.collection_address || '',
    deliver_to: row.recipient_name || row.customer_name || '', collect_from: row.recipient_name || '',
    deliver_to_collect_from: row.recipient_name || row.customer_name || '',
    company_name: row.customer_company || row.recipient_company || '',
    postal_code: row.postcode || '', phone: row.recipient_phone || row.phone || '', phone_number: row.recipient_phone || row.phone || '',
    notify_email: row.recipient_email || '', instructions: row.special_instructions || '',
    number_of_shipping_labels: row.boxes || 1, barcodes: array(row.barcodes), scans: array(row.scans),
    _source: 'database', _in_database: true, _db_data: row };
}
function handler(fn) { return async (req, res) => { try { return await fn(req, res); } catch (error) { console.error('Database booking request failed:', error.message); return res.status(error.status || 500).json({success:false,error:error.status ? error.message : 'Database operation failed'}); } }; }
module.exports = { pool, scope, find, array, legacy, handler, httpError };
