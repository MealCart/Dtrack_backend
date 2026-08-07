// src/middleware/upload.js
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { LABELS_DIR, MAX_FILE_SIZE } = require('../config/constants');

// Ensure labels directory exists
if (!fs.existsSync(LABELS_DIR)) {
  fs.mkdirSync(LABELS_DIR, { recursive: true });
}

// Memory storage for Excel files
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_FILE_SIZE }
});

// Disk storage for label files
const labelStorage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, LABELS_DIR);
  },
  filename: function (req, file, cb) {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    const ext = path.extname(file.originalname);
    cb(null, `label-${uniqueSuffix}${ext}`);
  }
});

const uploadLabel = multer({
  storage: labelStorage,
  limits: {
    fileSize: MAX_FILE_SIZE
  },
  fileFilter: (req, file, cb) => {
    const allowedTypes = ['application/pdf', 'image/png', 'image/jpeg'];
    if (allowedTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Only PDF, PNG, and JPEG files are allowed'));
    }
  }
});

module.exports = { upload, uploadLabel };