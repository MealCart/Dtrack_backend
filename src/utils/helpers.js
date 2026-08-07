// backend/src/utils/helpers.js

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

// Convert Excel date to YYYY-MM-DD format (FIXED for timezone issues)
const getValidDate = (excelDate) => {
  let dateStr;

  if (typeof excelDate === 'number') {
    // Excel date number to date (using local timezone)
    const excelEpoch = new Date(1899, 11, 30);
    const date = new Date(excelEpoch.getTime() + excelDate * 86400000);
    // Use local date methods to avoid timezone issues
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    dateStr = `${year}-${month}-${day}`;
  } else if (typeof excelDate === 'string') {
    // Remove any time part
    const datePart = excelDate.split(' ')[0];
    
    // Check if it's MM/DD/YYYY format
    const parts = datePart.split('/');
    if (parts.length === 3) {
      // Assume MM/DD/YYYY
      const month = parseInt(parts[0]);
      const day = parseInt(parts[1]);
      const year = parseInt(parts[2]);
      
      // Validate the date parts
      if (!isNaN(month) && !isNaN(day) && !isNaN(year) && year > 1900) {
        // Create date using local timezone (no UTC conversion)
        const date = new Date(year, month - 1, day);
        const y = date.getFullYear();
        const m = String(date.getMonth() + 1).padStart(2, '0');
        const d = String(date.getDate()).padStart(2, '0');
        dateStr = `${y}-${m}-${d}`;
      } else {
        // If parsing fails, use the string as-is
        dateStr = datePart;
      }
    } else {
      // Try parsing as other formats
      try {
        const parsed = new Date(datePart);
        if (!isNaN(parsed.getTime())) {
          const year = parsed.getFullYear();
          const month = String(parsed.getMonth() + 1).padStart(2, '0');
          const day = String(parsed.getDate()).padStart(2, '0');
          dateStr = `${year}-${month}-${day}`;
        } else {
          dateStr = datePart;
        }
      } catch (e) {
        dateStr = datePart;
      }
    }
  } else {
    // Default to today's date
    const today = new Date();
    const year = today.getFullYear();
    const month = String(today.getMonth() + 1).padStart(2, '0');
    const day = String(today.getDate()).padStart(2, '0');
    dateStr = `${year}-${month}-${day}`;
  }

  // Ensure format is YYYY-MM-DD
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
    const today = new Date();
    const year = today.getFullYear();
    const month = String(today.getMonth() + 1).padStart(2, '0');
    const day = String(today.getDate()).padStart(2, '0');
    dateStr = `${year}-${month}-${day}`;
  }

  // REMOVED: The date validation that was changing dates
  // We now trust the user's date input

  return dateStr;
};

// Generate barcodes for boxes
const generateBarcodes = (doNumber, totalBoxes) => {
  const barcodes = [];
  for (let i = 0; i < totalBoxes; i++) {
    barcodes.push(`${doNumber}-${String(i + 1).padStart(2, '0')}`);
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