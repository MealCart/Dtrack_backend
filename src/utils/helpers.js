// backend/src/utils/helpers.js
const { parse, format, isValid } = require('date-fns');

// Get value from row with fallbacks
const getValue = (row, ...keys) => {
  for (const key of keys) {
    if (row[key] !== undefined && row[key] !== '' && row[key] !== null) {
      return row[key];
    }
  }
  return '';
};

// Get number from row with fallbacks
const getNumber = (row, ...keys) => {
  for (const key of keys) {
    const value = row[key];
    if (value !== undefined && value !== '' && value !== null) {
      if (typeof value === 'number') return value;
      if (typeof value === 'string') {
        const parsed = parseFloat(value);
        if (!isNaN(parsed)) return parsed;
      }
    }
  }
  return 0;
};

/**
 * Convert various date formats to YYYY-MM-DD using date-fns
 * 
 * CRITICAL: This function tries DD/MM/YYYY FIRST (Australian format)
 * because that's what Australian Excel files typically use.
 * 
 * Supports:
 * - DD/MM/YYYY (Australian/European format) - PRIORITY
 * - DD-MM-YYYY
 * - DD.MM.YYYY
 * - DD/MM/YY (with 2-digit year)
 * - MM/DD/YYYY (US format) - fallback
 * - YYYY-MM-DD
 * - Excel serial numbers
 * - Date objects
 */
const getValidDate = (excelDate) => {
  // If no value, return today's date
  if (!excelDate) {
    const today = new Date();
    const year = today.getFullYear();
    const month = String(today.getMonth() + 1).padStart(2, '0');
    const day = String(today.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  // If it's a number, it's an Excel serial date
  if (typeof excelDate === 'number') {
    try {
      const milliseconds = (excelDate - 25569) * 86400 * 1000;
      const date = new Date(milliseconds);
      if (!isNaN(date.getTime()) && isValid(date)) {
        return format(date, 'yyyy-MM-dd');
      }
    } catch (e) {
      console.error('❌ Failed to convert Excel serial date:', e);
    }
  }

  // If it's already a Date object
  if (excelDate instanceof Date) {
    if (!isNaN(excelDate.getTime()) && isValid(excelDate)) {
      return format(excelDate, 'yyyy-MM-dd');
    }
  }

  // If it's a string
  const dateStr = String(excelDate).trim();

  // Check if already in YYYY-MM-DD format
  if (dateStr.match(/^\d{4}-\d{2}-\d{2}$/)) {
    return dateStr;
  }

  // ============================================================
  // TRY AUSTRALIAN FORMAT FIRST: DD/MM/YYYY (e.g., 14/01/2027)
  // This is the most common format in Australian Excel files
  // ============================================================
  try {
    const parsed = parse(dateStr, 'd/M/yyyy', new Date());
    if (isValid(parsed)) {
      const result = format(parsed, 'yyyy-MM-dd');
      console.log(`📅 DD/MM/YYYY: "${dateStr}" -> "${result}"`);
      return result;
    }
  } catch (e) { /* ignore */ }

  // Try Australian format with 2-digit year: DD/MM/YY (e.g., 14/01/27)
  try {
    const parsed = parse(dateStr, 'd/M/yy', new Date());
    if (isValid(parsed)) {
      const result = format(parsed, 'yyyy-MM-dd');
      console.log(`📅 DD/MM/YY: "${dateStr}" -> "${result}"`);
      return result;
    }
  } catch (e) { /* ignore */ }

  // Try Australian format with - or . separators: DD-MM-YYYY or DD.MM.YYYY
  try {
    const normalized = dateStr.replace(/[-.]/g, '/');
    const parsed = parse(normalized, 'd/M/yyyy', new Date());
    if (isValid(parsed)) {
      const result = format(parsed, 'yyyy-MM-dd');
      console.log(`📅 DD-MM-YYYY: "${dateStr}" -> "${result}"`);
      return result;
    }
  } catch (e) { /* ignore */ }

  // ============================================================
  // FALLBACK: Try US format: MM/DD/YYYY (e.g., 12/31/2027)
  // Only if Australian format failed
  // ============================================================
  try {
    const parsed = parse(dateStr, 'M/d/yyyy', new Date());
    if (isValid(parsed)) {
      const result = format(parsed, 'yyyy-MM-dd');
      console.log(`📅 MM/DD/YYYY: "${dateStr}" -> "${result}"`);
      return result;
    }
  } catch (e) { /* ignore */ }

  // Try US format with - or . separators: MM-DD-YYYY
  try {
    const normalized = dateStr.replace(/[-.]/g, '/');
    const parsed = parse(normalized, 'M/d/yyyy', new Date());
    if (isValid(parsed)) {
      const result = format(parsed, 'yyyy-MM-dd');
      console.log(`📅 MM-DD-YYYY: "${dateStr}" -> "${result}"`);
      return result;
    }
  } catch (e) { /* ignore */ }

  // Try ISO-like format: YYYY/MM/DD
  try {
    const normalized = dateStr.replace(/[-.]/g, '/');
    const parsed = parse(normalized, 'yyyy/M/d', new Date());
    if (isValid(parsed)) {
      const result = format(parsed, 'yyyy-MM-dd');
      console.log(`📅 YYYY/MM/DD: "${dateStr}" -> "${result}"`);
      return result;
    }
  } catch (e) { /* ignore */ }

  // Final fallback: try JavaScript Date parsing
  try {
    const date = new Date(dateStr);
    if (!isNaN(date.getTime()) && isValid(date)) {
      const result = format(date, 'yyyy-MM-dd');
      console.log(`📅 Fallback parsing: "${dateStr}" -> "${result}"`);
      return result;
    }
  } catch (e) { /* ignore */ }

  // If all parsing fails, use today's date
  console.log(`⚠️ Could not parse date: "${dateStr}", using today`);
  const today = new Date();
  const year = today.getFullYear();
  const month = String(today.getMonth() + 1).padStart(2, '0');
  const day = String(today.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

// Generate barcodes for boxes
const generateBarcodes = (doNumber, totalBoxes) => {
  const barcodes = [];
  for (let i = 0; i < totalBoxes; i++) {
    // ✅ REMOVE padStart(2, '0') - just use the number as-is
    barcodes.push(`${doNumber}-${i + 1}`);
  }
  return barcodes;
};

// V2 Valid Fields for Detrack API
const V2_VALID_FIELDS = [
  'date', 'do_number', 'address', 'deliver_to', 'phone', 'notify_email',
  'instructions', 'group', 'delivery_type', 'time_window', 'cartons',
  'boxes', 'weight', 'pieces', 'pallets', 'address_1', 'address_2',
  'postal_code', 'city', 'state', 'country', 'latitude', 'longitude',
  'company_name', 'zone', 'assign_to', 'run_no', 'depot',
  'reason', 'received_by', 'note', 'remarks', 'carrier',
  'payment_mode', 'payment_amount', 'invoice_no', 'account_no',
  'delivery_sequence', 'service_type', 'service_time', 'start_time',
  'end_time', 'depot_contact', 'depot_contact_no', 'depot_address',
  'payment_collected', 'auto_reschedule', 'attachment_url'
];

module.exports = {
  getValue,
  getNumber,
  getValidDate,
  generateBarcodes,
  V2_VALID_FIELDS
};