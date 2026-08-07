// src/controllers/labelController.js
const fs = require('fs');
const path = require('path');
const Job = require('../models/Job');
const Label = require('../models/Label');
const { generateShippingLabels } = require('../services/labelService');
const { LABELS_DIR } = require('../config/constants');

// ===== GENERATE SHIPPING LABELS =====
exports.generateLabels = async (req, res) => {
  try {
    const { doNumber, barcodes, customerName, address, companyName, phone, instructions, layout } = req.body;
    const userId = req.user.id;

    if (!doNumber || !barcodes || barcodes.length === 0) {
      return res.status(400).json({
        error: 'Missing required fields: doNumber and barcodes'
      });
    }

    console.log(`📦 Generating labels for ${doNumber} (${barcodes.length} labels) with layout: ${layout || '4-per-page'}`);

    const pdfDoc = await generateShippingLabels(
      doNumber,
      barcodes,
      customerName,
      address,
      companyName || '',
      phone || '',
      instructions || '',
      layout || '4-per-page'
    );
    const pdfBytes = await pdfDoc.save();

    const filename = `labels_${doNumber}_${Date.now()}.pdf`;
    const filepath = path.join(LABELS_DIR, filename);
    fs.writeFileSync(filepath, pdfBytes);

    const fileUrl = `/uploads/labels/${filename}`;

    await Label.create({
      doNumber,
      filename,
      filepath,
      fileUrl,
      labelCount: barcodes.length,
      barcodes,
      userId
    });

    await Job.updateLabelUrl(doNumber, fileUrl);

    console.log(`✅ Labels saved: ${filename}`);

    return res.json({
      success: true,
      filename: filename,
      url: fileUrl,
      fullUrl: `http://localhost:${process.env.PORT || 5000}${fileUrl}`,
      doNumber: doNumber,
      labelCount: barcodes.length,
      barcodes: barcodes
    });

  } catch (error) {
    console.error('❌ Error generating labels:', error);
    return res.status(500).json({
      error: 'Failed to generate shipping labels',
      details: error.message
    });
  }
};

// ===== GENERATE AND DOWNLOAD LABELS DIRECTLY (NO FILE SAVE) =====
exports.generateAndDownloadLabels = async (req, res) => {
  try {
    const { doNumber, barcodes, customerName, address, companyName, phone, instructions, layout } = req.body;
    const userId = req.user.id;

    if (!doNumber || !barcodes || barcodes.length === 0) {
      return res.status(400).json({
        error: 'Missing required fields: doNumber and barcodes'
      });
    }

    console.log(`📦 Generating and downloading labels for ${doNumber} (${barcodes.length} labels) with layout: ${layout || '4-per-page'}`);

    const pdfDoc = await generateShippingLabels(
      doNumber,
      barcodes,
      customerName,
      address,
      companyName || '',
      phone || '',
      instructions || '',
      layout || '4-per-page'
    );
    const pdfBytes = await pdfDoc.save();

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="labels_${doNumber}.pdf"`);
    res.setHeader('Content-Length', pdfBytes.length);
    res.send(pdfBytes);

    console.log(`✅ Labels downloaded for ${doNumber}`);
  } catch (error) {
    console.error('❌ Error generating labels:', error);
    res.status(500).json({
      error: 'Failed to generate shipping labels',
      details: error.message
    });
  }
};

// ===== DOWNLOAD SHIPPING LABELS =====
exports.downloadLabels = (req, res) => {
  try {
    const filename = req.params.filename;
    const filepath = path.join(LABELS_DIR, filename);

    if (!fs.existsSync(filepath)) {
      return res.status(404).json({ error: 'File not found' });
    }

    res.download(filepath, filename);
  } catch (error) {
    console.error('❌ Error downloading labels:', error);
    return res.status(500).json({
      error: 'Failed to download labels',
      details: error.message
    });
  }
};

// ===== GET LABELS FOR A JOB =====
exports.getLabels = async (req, res) => {
  try {
    const doNumber = req.params.doNumber;
    const userId = req.user.id;
    const labels = await Label.findByDoNumber(userId, doNumber);
    res.json({
      success: true,
      data: labels
    });
  } catch (error) {
    console.error('Error fetching labels:', error);
    res.status(500).json({ error: 'Failed to fetch labels' });
  }
};

// ===== UPLOAD LABEL MANUALLY =====
exports.uploadLabel = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    const { doNumber } = req.body;
    const userId = req.user.id;
    const filepath = req.file.path;
    const filename = req.file.filename;
    const fileUrl = `/uploads/labels/${filename}`;

    const label = await Label.create({
      doNumber,
      filename,
      filepath,
      fileUrl,
      labelCount: 1,
      barcodes: [],
      userId
    });

    res.json({
      success: true,
      id: label.id,
      filename: filename,
      url: fileUrl,
      doNumber: doNumber
    });

  } catch (error) {
    console.error('Upload error:', error);
    res.status(500).json({ error: 'Failed to upload label' });
  }
};

// ===== DELETE LABEL =====
exports.deleteLabel = async (req, res) => {
  try {
    const id = req.params.id;
    const userId = req.user.id;
    const label = await Label.delete(userId, id);

    if (!label) {
      return res.status(404).json({ error: 'Label not found' });
    }

    if (fs.existsSync(label.file_path)) {
      fs.unlinkSync(label.file_path);
    }

    res.json({ success: true, message: 'Label deleted successfully' });
  } catch (error) {
    console.error('Delete error:', error);
    res.status(500).json({ error: 'Failed to delete label' });
  }
};