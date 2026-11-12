const { pool } = require('../config/database');
exports.resolveCustomer = async (req, selectedCustomerId = req.body?.customer_id) => {
  if (!['admin', 'staff', 'customer'].includes(req.user.role)) {
    const error = new Error('Not authorized to create bookings'); error.status = 403; throw error;
  }
  const id = req.user.role === 'customer' ? req.user.id : selectedCustomerId;
  if (!id || !/^\d+$/.test(String(id))) {
    const error = new Error('Please select a customer'); error.status = 400; throw error;
  }
  const result = await pool.query("SELECT id, first_name, last_name, company_name, email FROM public.users WHERE id = $1 AND lower(btrim(role)) = 'customer' AND lower(btrim(status)) = 'active'", [id]);
  if (!result.rows[0]) { const error = new Error('Selected customer is not active or does not exist'); error.status = 400; throw error; }
  return result.rows[0];
};
exports.listCustomers = async (req, res) => {
  try {
    const result = await pool.query("SELECT id, first_name, last_name, company_name, email FROM public.users WHERE lower(btrim(role)) = 'customer' AND lower(btrim(status)) = 'active' ORDER BY company_name, first_name, last_name");
    res.json({ success: true, data: result.rows });
  } catch (error) { console.error('Booking customer lookup failed', error.code); res.status(500).json({ error: 'Failed to load customers' }); }
};
