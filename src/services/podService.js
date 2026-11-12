// Compatibility entry point. Evidence is always loaded from stored completion fields.
const { PDFDocument } = require('pdf-lib');
exports.generatePOD = async job => PDFDocument.load(await require('./databasePodService').generate(job));
