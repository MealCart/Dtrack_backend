const xlsx = require('xlsx');
const Job = require('../models/Job');
const Collection = require('../models/Collection');
const { resolveCustomer } = require('./bookingCustomerService');
const { getValidDate, generateBarcodes } = require('../utils/helpers');
const { normalizeAustralianPhone } = require('../utils/australianPhone');
const value = (row, ...keys) => {
  for (const key of keys) {
    const actual = Object.keys(row).find(header => header.toLowerCase() === key.toLowerCase());
    if (actual && row[actual] !== '' && row[actual] != null) return row[actual];
  }
  return '';
};
exports.upload = collection => async (req, res) => {
  try {
    const customer = await resolveCustomer(req);
    if (!req.file?.buffer) return res.status(400).json({ error: 'Please select an Excel file' });
    const workbook = xlsx.read(req.file.buffer, { type: 'buffer' });
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    const matrix = xlsx.utils.sheet_to_json(sheet, { header: 1, defval: '' });
    const headerIndex = matrix.findIndex(row => row.some(cell => /^(?:d\.?o\.?\s*(?:no\.?|number)|tracking no\.?|order no\.?)$/i.test(String(cell).trim())));
    if (headerIndex < 0) return res.status(400).json({ error: 'No header row with D.O. No. found in Excel file' });
    const headers = matrix[headerIndex].map(cell => String(cell).trim());
    const rows = matrix.slice(headerIndex + 1).map((cells, index) => ({ excelRow: headerIndex + index + 2, row: Object.fromEntries(headers.map((header, i) => [header, cells[i] ?? ''])) })).filter(({ row }) => Object.values(row).some(cell => String(cell).trim()));
    if (!rows.length || rows.length > 500) return res.status(400).json({ error: 'Upload must contain between 1 and 500 bookings' });
    const dateMap = {};
    if (req.body.parsedData) {
      let parsed;
      try { parsed = JSON.parse(req.body.parsedData); } catch { return res.status(400).json({ error: 'Invalid parsed date data' }); }
      if (Array.isArray(parsed)) for (const row of parsed) if (row.doNumber && row.date) dateMap[String(row.doNumber).trim()] = row.date;
    }
    const errors = [], prepared = [], seen = new Set();
    for (const { row, excelRow } of rows) {
      const doNumber = String(value(row, 'D.O. No.', 'D.O. No', 'DO No', 'DO Number', 'Tracking No.', 'Order No.')).trim();
      const address1 = String(value(row, 'Address 1', 'Address', 'Delivery Address', 'Collection Address', 'Pickup Address')).trim();
      const recipient = String(value(row, collection ? 'Collect From' : 'Deliver to', 'Deliver To', 'Collect From', 'Recipient', ...(collection ? ['Customer'] : []), 'deliver_to_collect_from')).trim();
      const rowErrors = [];
      if (!doNumber) rowErrors.push('Missing D.O. No.');
      if (!address1) rowErrors.push('Missing Address');
      if (!recipient) rowErrors.push(collection ? 'Missing Collect From' : 'Missing Deliver to');
      if (seen.has(doNumber)) rowErrors.push('Duplicate D.O. No. within this file');
      seen.add(doNumber);
      let phone = '';
      try { phone = normalizeAustralianPhone(value(row, 'Phone No.', 'Phone', 'Contact Number', 'Phone Number')); } catch (error) { rowErrors.push(`Phone: ${error.message}`); }
      const email = String(value(row, 'Notify Email', 'Notify email', 'Email', 'Customer Email')).trim();
      if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) rowErrors.push('Notify Email must be a valid email address');
      const countRaw = value(row, 'No. of Shipping Labels', 'Cartons', 'Boxes');
      const boxes = countRaw === '' ? 1 : Number(countRaw);
      if (!Number.isInteger(boxes) || boxes < 1 || boxes > 1000) rowErrors.push('Shipping label count must be a whole number between 1 and 1000');
      const date = dateMap[doNumber] || getValidDate(value(row, 'Date', 'Processing Date', 'Scheduled Date', 'Collection Date', 'Pickup Date'));
      if (!/^\d{4}-\d{2}-\d{2}$/.test(String(date))) rowErrors.push('Invalid scheduled date');
      if (rowErrors.length) { errors.push({ row: excelRow, doNumber, errors: rowErrors }); continue; }
      const address2 = String(value(row, 'Address 2', 'Address Line 2'));
      const city = String(value(row, 'City', 'Suburb', 'Town'));
      const state = String(value(row, 'State'));
      const postcode = String(value(row, 'Postal Code', 'Postcode', 'Zip', 'Zip Code'));
      const country = String(value(row, 'Country') || 'Australia');
      const address = [address1, address2, city, state, postcode, country].filter(Boolean).join(', ');
      const common = {
        do_number: doNumber, recipient_name: recipient, recipient_phone: phone, recipient_email: email || null,
        postcode, city, state, country, scheduled_date: date, special_instructions: String(value(row, 'Instructions', 'Special Instructions', 'Note', 'Remarks')),
        group_id: null, group_name: null, detrack_id: null, status: 'pending', source: 'customer', user_id: customer.id
      };
      const company = String(value(row, 'Company Name', 'Company', 'Business Name'));
      prepared.push(collection ? { ...common, recipient_company: company, collection_address: address, collection_type: value(row, 'Collection Type', 'Job type') || 'Home Collection', time_window: value(row, 'Time Window') || '07:00-18:00', tracking_link: '', verification_code: '' } : {
        ...common, delivery_type: value(row, 'Delivery Type', 'Service Type') || 'Home Delivery', customer_name: recipient, customer_company: company, phone, delivery_address: address, boxes, weight: Number(value(row, 'Weight', 'Kg', 'Kgs')) || 0,
        contents: String(value(row, 'Contents', 'Instructions')), barcodes: generateBarcodes(doNumber, boxes), pickup_address: '', address_1: address1, address_2: address2
      });
    }
    if (errors.length) return res.status(400).json({ error: errors.map(item => `Row ${item.row} (${item.doNumber || 'Unknown DO'}): ${item.errors.join('; ')}`).join('\n'), errors, validationErrors: errors });
    const Model = collection ? Collection : Job;
    const duplicates = await Model.checkDoNumbersExists(prepared.map(row => row.do_number));
    const duplicateDoNumbers = Object.keys(duplicates).filter(key => duplicates[key]);
    if (duplicateDoNumbers.length) return res.status(409).json({ error: 'Duplicate DO numbers found in database', message: `Already exists: ${duplicateDoNumbers.join(', ')}`, duplicateDoNumbers });
    const results = [], failedJobs = [];
    for (const row of prepared) {
      try {
        const saved = await Model.create(row);
        results.push({ id: saved.id, do_number: row.do_number, status: 'success', customer_id: saved.user_id, recipient_email: row.recipient_email, boxes: row.boxes || 1, barcodes: row.barcodes || generateBarcodes(row.do_number, 1) });
      } catch (error) { failedJobs.push({ do_number: row.do_number, error: error.code === '23505' ? 'DO number already exists' : error.message, code: error.code }); }
    }
    if (!results.length) {
      const firstFailure = failedJobs[0];
      return res.status(500).json({
        success: false,
        created: 0,
        failed: failedJobs.length,
        failedJobs,
        error: firstFailure
          ? `No bookings were saved. ${firstFailure.do_number}: ${firstFailure.error}`
          : 'No bookings were saved.',
      });
    }
    res.json({ success: true, total: prepared.length, created: results.length, failed: failedJobs.length, results, failedJobs, validationErrors: [], labels: [] });
  } catch (error) { res.status(error.status || 500).json({ error: error.status ? error.message : 'Failed to process upload', details: error.message, code: error.code }); }
};
