// Preserve service types independently of the delivery/collection job category.
module.exports = function bookingType(value, fallback = null) {
  if (value == null || value === '') return fallback;
  if (typeof value !== 'string' || !value.trim() || value.trim().length > 100) {
    const error = new Error('Booking type must be text between 1 and 100 characters.');
    error.status = 400;
    throw error;
  }
  return value.trim();
};
