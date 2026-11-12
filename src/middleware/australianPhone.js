const { normalizePhoneFields } = require('../utils/australianPhone');
module.exports = (req, res, next) => {
  try { normalizePhoneFields(req.body); next(); }
  catch (error) { res.status(400).json({ error: error.message }); }
};
