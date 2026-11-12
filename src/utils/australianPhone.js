// Format validation only; this does not verify that a number is connected.
const normalizeAustralianPhone = value => {
  if (value === undefined || value === null || String(value).trim() === '') return '';
  const raw = String(value).trim();
  if (!/^[+\d\s().-]+$/.test(raw)) throw new Error('Enter an Australian phone number, e.g. +61412345678 or 0412 345 678');
  let number = raw.replace(/[\s().-]/g, '');
  if (/^0[23478]\d{8}$/.test(number)) number = '+61' + number.slice(1);
  else if (/^61[23478]\d{8}$/.test(number)) number = '+' + number;
  // Excel numeric cells may have lost the domestic leading zero.
  else if (/^[23478]\d{8}$/.test(number)) number = '+61' + number;
  if (/^\+61[23478]\d{8}$/.test(number)) return number;
  // Australian business/service numbers retain their national form.
  if (/^(?:13\d{4}|1300\d{6}|1800\d{6})$/.test(number)) return number;
  throw new Error('Enter a valid Australian mobile, landline or 13/1300/1800 number');
};
const phoneKey = key => /^(?:phone|phone_?no|phone_?number|recipient_?phone|customer_?phone|contact_?number|mobile|mobile_?number|driver_?phone|depot_?contact_?no)$/i.test(key.replace(/[\s.]/g, ''));
const normalizePhoneFields = (value, path = '') => {
  if (!value || typeof value !== 'object') return;
  for (const [key, item] of Object.entries(value)) {
    if (phoneKey(key) && (typeof item !== 'object' || item === null)) {
      try { value[key] = normalizeAustralianPhone(item); } catch (error) { error.message = `${path}${key}: ${error.message}`; error.status = 400; throw error; }
    } else if (item && typeof item === 'object') normalizePhoneFields(item, `${path}${key}.`);
  }
};
module.exports = { normalizeAustralianPhone, normalizePhoneFields };
