// src/controllers/labelController.js
const fs = require('fs');
const path = require('path');
const Job = require('../models/Job');
const Label = require('../models/Label');
const DetrackService = require('../services/detrackService');
const { generateShippingLabels } = require('../services/labelService');
const { LABELS_DIR } = require('../config/constants');
const { generateBarcodes } = require('../utils/helpers');

// ===== GENERATE SHIPPING LABELS =====
exports.generateLabels = async (req, res) => {
  try {
    const { doNumber, barcodes, customerName, address, companyName, phone, instructions, layout } = req.body;
    const userId = req.user.id;

    if (!doNumber) {
      return res.status(400).json({
        error: 'Missing required field: doNumber'
      });
    }

    console.log(`📦 Generating labels for ${doNumber}...`);

    // ===== STEP 1: Check if job exists in database =====
    let job = await Job.findByDoNumberAny(doNumber);
    let finalBarcodes = barcodes || [];
    let finalCustomerName = customerName;
    let finalAddress = address;
    let finalCompanyName = companyName || '';
    let finalPhone = phone || '';
    let finalInstructions = instructions || '';

    // ===== STEP 2: If job doesn't exist, create it from Detrack =====
    if (!job) {
      console.log(`📦 Job ${doNumber} not found in local DB. Creating from Detrack...`);
      
      try {
        // Fetch from Detrack API
        const detrackJob = await DetrackService.getJobByDoNumber(doNumber);
        
        if (!detrackJob) {
          return res.status(404).json({
            error: 'Job not found',
            message: `Could not find job with DO number: ${doNumber} in Detrack`
          });
        }

        console.log(`✅ Job found in Detrack: ${detrackJob.id}`);

        // ===== Extract data from Detrack =====
        const shippingLabels = detrackJob.number_of_shipping_labels || 
                              detrackJob.cartons || 
                              detrackJob.boxes || 1;

        // Generate barcodes array
        finalBarcodes = generateBarcodes(doNumber, shippingLabels);

        // Get customer/recipient info
        finalCustomerName = detrackJob.deliver_to_collect_from || 
                           detrackJob.deliver_to || 
                           customerName || 
                           'Unknown';
        finalAddress = detrackJob.address || address || '';
        finalCompanyName = detrackJob.company_name || companyName || '';
        finalPhone = detrackJob.phone || detrackJob.phone_number || phone || '';
        finalInstructions = detrackJob.instructions || instructions || '';

        // ===== Create job in local database =====
        const jobData = {
          do_number: doNumber,
          customer_name: finalCustomerName,
          customer_company: finalCompanyName,
          phone: finalPhone,
          delivery_address: finalAddress,
          postcode: detrackJob.postal_code || '',
          recipient_name: finalCustomerName,
          recipient_phone: finalPhone,
          boxes: shippingLabels,
          weight: detrackJob.weight || 0,
          contents: detrackJob.note || '',
          status: detrackJob.status || detrackJob.primary_job_status || 'pending',
          scheduled_date: detrackJob.date || new Date().toISOString().split('T')[0],
          special_instructions: finalInstructions,
          barcodes: finalBarcodes,
          detrack_id: detrackJob.id || '',
          source: 'detrack_sync',
          group_name: detrackJob.group_name || '',
          group_id: detrackJob.group_id || '',
          pickup_address: '',
          user_id: userId
        };

        // Create the job record
        job = await Job.create(jobData);
        console.log(`✅ Job ${doNumber} created in local database with ${shippingLabels} labels`);

      } catch (detrackError) {
        console.error('❌ Failed to fetch job from Detrack:', detrackError.message);
        return res.status(500).json({
          error: 'Failed to sync job from Detrack',
          details: detrackError.message
        });
      }
    } else {
      // ===== Job exists in DB =====
      console.log(`✅ Job ${doNumber} found in local DB`);
      
      // If barcodes not provided, use job's barcodes
      if (!finalBarcodes || finalBarcodes.length === 0) {
        finalBarcodes = job.barcodes || [];
        if (typeof finalBarcodes === 'string') {
          try {
            finalBarcodes = JSON.parse(finalBarcodes);
          } catch (e) {
            finalBarcodes = [];
          }
        }
      }

      // Use job data as fallback
      finalCustomerName = finalCustomerName || job.customer_name || job.recipient_name || 'Unknown';
      finalAddress = finalAddress || job.delivery_address || '';
      finalCompanyName = finalCompanyName || job.customer_company || '';
      finalPhone = finalPhone || job.phone || job.recipient_phone || '';
      finalInstructions = finalInstructions || job.special_instructions || job.instructions || '';
    }

    // ===== STEP 3: Validate barcodes =====
    if (!finalBarcodes || finalBarcodes.length === 0) {
      return res.status(400).json({
        error: 'No barcodes available',
        message: 'This job has no shipping labels configured.'
      });
    }

    console.log(`📦 Generating ${finalBarcodes.length} labels for ${doNumber}`);

    // ===== STEP 4: Generate the PDF =====
    const pdfDoc = await generateShippingLabels(
      doNumber,
      finalBarcodes,
      finalCustomerName,
      finalAddress,
      finalCompanyName,
      finalPhone,
      finalInstructions,
      layout || '4-per-page'
    );
    const pdfBytes = await pdfDoc.save();

    // ===== STEP 5: Save the PDF file =====
    const filename = `labels_${doNumber}_${Date.now()}.pdf`;
    const filepath = path.join(LABELS_DIR, filename);
    fs.writeFileSync(filepath, pdfBytes);

    const fileUrl = `/uploads/labels/${filename}`;

    // ===== STEP 6: Save label record in database =====
    await Label.create({
      doNumber,
      filename,
      filepath,
      fileUrl,
      labelCount: finalBarcodes.length,
      barcodes: finalBarcodes,
      userId
    });

    // ===== STEP 7: Update job with label URL =====
    await Job.updateLabelUrl(doNumber, fileUrl);

    console.log(`✅ Labels saved: ${filename}`);

    return res.json({
      success: true,
      filename: filename,
      url: fileUrl,
      fullUrl: `http://localhost:${process.env.PORT || 5000}${fileUrl}`,
      doNumber: doNumber,
      labelCount: finalBarcodes.length,
      barcodes: finalBarcodes,
      synced: !job
    });

  } catch (error) {
    console.error('❌ Error generating labels:', error);
    return res.status(500).json({
      error: 'Failed to generate shipping labels',
      details: error.message
    });
  }
};

// ===== GENERATE AND DOWNLOAD LABELS DIRECTLY =====
exports.generateAndDownloadLabels = async (req, res) => {
  try {
    const { doNumber, barcodes, customerName, address, companyName, phone, instructions, layout } = req.body;
    const userId = req.user.id;

    if (!doNumber) {
      return res.status(400).json({
        error: 'Missing required field: doNumber'
      });
    }

    console.log(`📦 Generating and downloading labels for ${doNumber}...`);

    // ===== Check if job exists, create if needed =====
    let job = await Job.findByDoNumberAny(doNumber);
    let finalBarcodes = barcodes || [];
    let finalCustomerName = customerName;
    let finalAddress = address;
    let finalCompanyName = companyName || '';
    let finalPhone = phone || '';
    let finalInstructions = instructions || '';

    // If job doesn't exist, create it from Detrack
    if (!job) {
      console.log(`📦 Job ${doNumber} not found. Creating from Detrack...`);
      
      try {
        const detrackJob = await DetrackService.getJobByDoNumber(doNumber);
        
        if (!detrackJob) {
          return res.status(404).json({
            error: 'Job not found in Detrack'
          });
        }

        const shippingLabels = detrackJob.number_of_shipping_labels || 
                              detrackJob.cartons || 
                              detrackJob.boxes || 1;

        finalBarcodes = generateBarcodes(doNumber, shippingLabels);
        finalCustomerName = detrackJob.deliver_to_collect_from || detrackJob.deliver_to || 'Unknown';
        finalAddress = detrackJob.address || '';
        finalCompanyName = detrackJob.company_name || '';
        finalPhone = detrackJob.phone || detrackJob.phone_number || '';
        finalInstructions = detrackJob.instructions || '';

        // Create job in database
        await Job.create({
          do_number: doNumber,
          customer_name: finalCustomerName,
          customer_company: finalCompanyName,
          phone: finalPhone,
          delivery_address: finalAddress,
          postcode: detrackJob.postal_code || '',
          recipient_name: finalCustomerName,
          recipient_phone: finalPhone,
          boxes: shippingLabels,
          weight: detrackJob.weight || 0,
          contents: detrackJob.note || '',
          status: detrackJob.status || detrackJob.primary_job_status || 'pending',
          scheduled_date: detrackJob.date || new Date().toISOString().split('T')[0],
          special_instructions: finalInstructions,
          barcodes: finalBarcodes,
          detrack_id: detrackJob.id || '',
          source: 'detrack_sync',
          group_name: detrackJob.group_name || '',
          group_id: detrackJob.group_id || '',
          pickup_address: '',
          user_id: userId
        });
        
        console.log(`✅ Job ${doNumber} created from Detrack`);
      } catch (detrackError) {
        console.error('❌ Failed to create job:', detrackError.message);
        return res.status(500).json({
          error: 'Failed to create job from Detrack',
          details: detrackError.message
        });
      }
    } else {
      // Job exists in DB
      if (!finalBarcodes || finalBarcodes.length === 0) {
        finalBarcodes = job.barcodes || [];
        if (typeof finalBarcodes === 'string') {
          try {
            finalBarcodes = JSON.parse(finalBarcodes);
          } catch (e) {
            finalBarcodes = [];
          }
        }
      }
      
      finalCustomerName = finalCustomerName || job.customer_name || job.recipient_name || 'Unknown';
      finalAddress = finalAddress || job.delivery_address || '';
      finalCompanyName = finalCompanyName || job.customer_company || '';
      finalPhone = finalPhone || job.phone || job.recipient_phone || '';
      finalInstructions = finalInstructions || job.special_instructions || job.instructions || '';
    }

    if (!finalBarcodes || finalBarcodes.length === 0) {
      return res.status(400).json({
        error: 'No barcodes available for this job'
      });
    }

    // Generate PDF
    const pdfDoc = await generateShippingLabels(
      doNumber,
      finalBarcodes,
      finalCustomerName,
      finalAddress,
      finalCompanyName,
      finalPhone,
      finalInstructions,
      layout || '4-per-page'
    );
    const pdfBytes = await pdfDoc.save();

    // Download directly
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