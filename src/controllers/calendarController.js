// Compatibility exports: all calendar requests read the local database only.
const databaseCalendar = require('./dbCalendarController');
exports.getCalendarData = databaseCalendar.getDbCalendar;
exports.getDateDetails = databaseCalendar.getDbDateDetails;
