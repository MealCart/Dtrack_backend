// src/controllers/labelController.js
const fs = require('fs');
const path = require('path');
const Job = require('../models/Job');
const Label = require('../models/Label');
const DetrackService = require('../services/detrackService');
const { generateShippingLabels } = require('../services/labelService');
const { LABELS_DIR } = require('../config/constants');
const { generateBarcodes } = require('../utils/helpers');

// ===== HELPER: Clean company name by removing business types =====
const cleanCompanyName = (name) => {
  if (!name) return '';
  
  const phrasesToRemove = [
    'Home Delivery',
    'Business Delivery',
    'Collection',
    'Pickup',
    'Dropoff',
    'Same Day',
    'Express',
    'Standard',
    'Next Day',
    'Delivery'
  ];
  
  let cleaned = String(name);
  phrasesToRemove.forEach(phrase => {
    cleaned = cleaned.replace(new RegExp(phrase, 'gi'), '');
  });
  
  cleaned = cleaned.replace(/\s*,\s*,/g, ',');
  cleaned = cleaned.replace(/,\s*$/, '');
  cleaned = cleaned.replace(/^\s*,/, '');
  cleaned = cleaned.replace(/\s+/g, ' ').trim();
  
  return cleaned;
};

exports.generateLabels = async (req, res) => {
  try {
    const { 
      doNumber, 
      barcodes, 
      customerName, 
      address, 
      companyName, 
      phone, 
      instructions, 
      layout
    } = req.body;
    const userId = req.user.id;

    if (!doNumber) {
      return res.status(400).json({
        error: 'Missing required field: doNumber'
      });
    }

    console.log(`📦 Generating labels for ${doNumber}...`);

    // ===== STEP 1: Check if job exists in database =====
    let job = await Job.findByDoNumberAny(doNumber);
    let finalBarcodes = [];
    let finalCustomerName = customerName;
    
    // ✅ Extract address ONLY from database
    let finalAddress = job ? job.delivery_address || '' : address || '';
    
    // ✅ FIX: ONLY use company name from database, NOT from request body
    let finalCompanyName = job ? cleanCompanyName(job.customer_company || '') : '';
    
    // ✅ Phone from database or request
    let finalPhone = job ? job.phone || '' : phone || '';
    
    // ✅ Instructions from database or request
    let finalInstructions = job ? job.special_instructions || job.instructions || '' : instructions || '';
    
    let finalState = '';
    let finalCity = '';
    let finalPostcode = '';

    console.log(`📍 Address from database: "${finalAddress}"`);
    console.log(`📍 Company Name from database: "${finalCompanyName}"`);
    console.log(`📍 Instructions from database: "${finalInstructions}"`);

    // ===== STEP 2: Fetch from Detrack (ONLY for barcodes and metadata) =====
    let detrackJob = null;
    
    try {
      detrackJob = await DetrackService.getJobByDoNumber(doNumber);
      
      if (detrackJob) {
        console.log(`✅ Job found in Detrack: ${detrackJob.id}`);
        console.log(`📍 State from Detrack: ${detrackJob.state}`);
        console.log(`📍 City from Detrack: ${detrackJob.city}`);
        console.log(`📍 Postal Code from Detrack: ${detrackJob.postal_code}`);
        console.log(`📍 Address from Detrack (IGNORED): ${detrackJob.address}`);
        console.log(`📍 Company Name from Detrack: "${detrackJob.company_name}"`);
        
        finalState = detrackJob.state || '';
        finalCity = detrackJob.city || '';
        finalPostcode = detrackJob.postal_code || '';
        
        // ===== ✅ FIX: ALWAYS regenerate barcodes without leading zeros =====
        const shippingLabels = detrackJob.number_of_shipping_labels || 
                              detrackJob.cartons || 
                              detrackJob.boxes || 1;
        finalBarcodes = generateBarcodes(doNumber, shippingLabels);
        console.log(`🔄 Regenerated ${finalBarcodes.length} barcodes without leading zeros:`, finalBarcodes);
        
        // Use Detrack data as fallback for missing fields (EXCEPT address)
        finalCustomerName = detrackJob.deliver_to_collect_from || 
                           detrackJob.deliver_to || 
                           customerName || 
                           'Unknown';
        
        // ✅ FIX: ONLY use company name from database, NOT from Detrack
        // finalCompanyName should already be from database, keep it
        
        // ✅ FIX: Phone from database or Detrack
        finalPhone = finalPhone || detrackJob.phone || detrackJob.phone_number || '';
        
        // ✅ FIX: Instructions from database or Detrack
        finalInstructions = finalInstructions || detrackJob.instructions || '';
      } else {
        console.log(`⚠️ Job ${doNumber} not found in Detrack`);
      }
    } catch (detrackError) {
      console.error('❌ Failed to fetch job from Detrack:', detrackError.message);
    }

    // ===== STEP 3: If no Detrack data, use job from database =====
    if (!detrackJob && job) {
      console.log(`✅ Using job from local DB: ${doNumber}`);
      
      const boxCount = parseInt(job.boxes) || 1;
      finalBarcodes = generateBarcodes(doNumber, boxCount);
      console.log(`🔄 Regenerated ${finalBarcodes.length} barcodes from DB boxes (${boxCount}):`, finalBarcodes);
      
      finalCustomerName = finalCustomerName || job.customer_name || job.recipient_name || 'Unknown';
      finalAddress = finalAddress || job.delivery_address || '';
      // ✅ Keep company name from database
      finalCompanyName = finalCompanyName || cleanCompanyName(job.customer_company || '');
      finalPhone = finalPhone || job.phone || job.recipient_phone || '';
      finalInstructions = finalInstructions || job.special_instructions || job.instructions || '';
      finalPostcode = finalPostcode || job.postcode || '';
    }

    // ===== STEP 4: If job doesn't exist in DB, create it =====
    if (!job && detrackJob) {
      console.log(`📦 Creating job ${doNumber} in local database...`);
      
      try {
        const shippingLabels = detrackJob.number_of_shipping_labels || 
                              detrackJob.cartons || 
                              detrackJob.boxes || 1;

        const jobData = {
          do_number: doNumber,
          customer_name: finalCustomerName,
          customer_company: finalCompanyName,  // ✅ Cleaned company name
          phone: finalPhone,
          delivery_address: finalAddress,
          postcode: finalPostcode,
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

        job = await Job.create(jobData);
        console.log(`✅ Job ${doNumber} created in local database`);
      } catch (createError) {
        console.error('❌ Failed to create job in database:', createError.message);
      }
    } else if (job && detrackJob) {
      // ===== UPDATE existing job with fresh barcodes =====
      try {
        await Job.update(doNumber, {
          barcodes: finalBarcodes,
          customer_name: finalCustomerName,
          customer_company: finalCompanyName,  // ✅ Keep company name from database
          phone: finalPhone,
          delivery_address: finalAddress,
          postcode: finalPostcode,
          recipient_name: finalCustomerName,
          recipient_phone: finalPhone,
          boxes: finalBarcodes.length,
          state: finalState,
          city: finalCity,
          special_instructions: finalInstructions
        });
        console.log(`✅ Job ${doNumber} updated with fresh barcodes`);
      } catch (updateError) {
        console.error('❌ Failed to update job:', updateError.message);
      }
    }

    if (!finalBarcodes || finalBarcodes.length === 0) {
      return res.status(400).json({
        error: 'No barcodes available',
        message: 'This job has no shipping labels configured.'
      });
    }

    console.log(`📦 Generating ${finalBarcodes.length} labels for ${doNumber}`);
    console.log(`📍 Final Address: "${finalAddress}"`);
    console.log(`📍 Final Company Name: "${finalCompanyName}"`);
    console.log(`📍 Final Instructions: "${finalInstructions}"`);
    console.log(`📍 Barcodes:`, finalBarcodes);

    // ===== Generate the PDF =====
    const pdfDoc = await generateShippingLabels(
      doNumber,
      finalBarcodes,
      finalCustomerName,
      finalAddress,
      finalCompanyName,  // ✅ Cleaned company name from database
      finalPhone,
      finalInstructions,
      layout || '4-per-page',
      finalState,
      finalPostcode,
      finalCity
    );
    
    const pdfBytes = await pdfDoc.save();

    // ===== Save the PDF file =====
    const filename = `labels_${doNumber}_${Date.now()}.pdf`;
    const filepath = path.join(LABELS_DIR, filename);
    fs.writeFileSync(filepath, pdfBytes);

    const fileUrl = `/uploads/labels/${filename}`;

    // ===== Save label record in database =====
    await Label.create({
      doNumber,
      filename,
      filepath,
      fileUrl,
      labelCount: finalBarcodes.length,
      barcodes: finalBarcodes,
      userId
    });

    if (job) {
      await Job.updateLabelUrl(doNumber, fileUrl);
    }

    console.log(`✅ Labels saved: ${filename}`);

    return res.json({
      success: true,
      filename: filename,
      url: fileUrl,
      fullUrl: `http://localhost:${process.env.PORT || 5000}${fileUrl}`,
      doNumber: doNumber,
      labelCount: finalBarcodes.length,
      barcodes: finalBarcodes,
      synced: !job,
      state: finalState,
      city: finalCity,
      postcode: finalPostcode,
      address: finalAddress,
      companyName: finalCompanyName  // ✅ Shows cleaned company name
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
    const { 
      doNumber, 
      barcodes, 
      customerName, 
      address, 
      companyName, 
      phone, 
      instructions, 
      layout,
      state: reqState,
      city: reqCity,
      postcode: reqPostcode
    } = req.body;
    const userId = req.user.id;

    if (!doNumber) {
      return res.status(400).json({
        error: 'Missing required field: doNumber'
      });
    }

    console.log(`📦 Generating and downloading labels for ${doNumber}...`);

    // ===== CHECK IF JOB EXISTS IN DB FIRST =====
    let job = await Job.findByDoNumberAny(doNumber);
    
    // ✅ Extract address ONLY from database
    let finalAddress = job ? job.delivery_address || '' : address || '';
    
    // ✅ FIX: ONLY use company name from database, NOT from request body
    let finalCompanyName = job ? cleanCompanyName(job.customer_company || '') : '';
    
    let finalState = reqState || (job ? job.state || '' : '');
    let finalCity = reqCity || (job ? job.city || '' : '');
    let finalPostcode = reqPostcode || (job ? job.postcode || '' : '');
    let finalBarcodes = [];
    let finalCustomerName = customerName || (job ? job.customer_name || job.recipient_name : '');
    let finalPhone = job ? job.phone || '' : phone || '';
    let finalInstructions = job ? job.special_instructions || job.instructions || '' : instructions || '';

    console.log(`📍 Address from database: "${finalAddress}"`);
    console.log(`📍 Company Name from database: "${finalCompanyName}"`);
    console.log(`📍 Instructions from database: "${finalInstructions}"`);

    // ===== FETCH FROM DETRACK (ONLY for barcodes and metadata) =====
    let detrackJob = null;

    try {
      detrackJob = await DetrackService.getJobByDoNumber(doNumber);
      
      if (detrackJob) {
        finalState = detrackJob.state || reqState || '';
        finalCity = detrackJob.city || reqCity || '';
        finalPostcode = detrackJob.postal_code || reqPostcode || '';
        console.log(`📍 State from Detrack: "${finalState}"`);
        console.log(`📍 Address from Detrack (IGNORED): ${detrackJob.address}`);
        console.log(`📍 Company Name from Detrack (IGNORED): "${detrackJob.company_name}"`);
        
        // ===== ✅ FIX: ALWAYS regenerate barcodes without leading zeros =====
        const shippingLabels = detrackJob.number_of_shipping_labels || 
                              detrackJob.cartons || 
                              detrackJob.boxes || 1;
        finalBarcodes = generateBarcodes(doNumber, shippingLabels);
        console.log(`🔄 Regenerated ${finalBarcodes.length} barcodes without leading zeros:`, finalBarcodes);
        
        // Use Detrack data as fallback for missing fields (EXCEPT address and company)
        finalCustomerName = finalCustomerName || 
                           detrackJob.deliver_to_collect_from || 
                           detrackJob.deliver_to || 
                           'Unknown';
        
        // ✅ FIX: DON'T use Detrack company_name
        // finalCompanyName should already be from database, keep it
        
        finalPhone = finalPhone || detrackJob.phone || detrackJob.phone_number || '';
        finalInstructions = finalInstructions || detrackJob.instructions || '';
      }
    } catch (error) {
      console.error('❌ Failed to fetch job from Detrack:', error.message);
    }

    // ===== If no Detrack data, use job from database =====
    if (!detrackJob && job) {
      console.log(`✅ Using job from local DB: ${doNumber}`);
      
      const boxCount = parseInt(job.boxes) || 1;
      finalBarcodes = generateBarcodes(doNumber, boxCount);
      console.log(`🔄 Regenerated ${finalBarcodes.length} barcodes from DB boxes (${boxCount}):`, finalBarcodes);
      
      finalCustomerName = finalCustomerName || job.customer_name || job.recipient_name || 'Unknown';
      finalAddress = finalAddress || job.delivery_address || '';
      // ✅ Keep company name from database
      finalCompanyName = finalCompanyName || cleanCompanyName(job.customer_company || '');
      finalPhone = finalPhone || job.phone || job.recipient_phone || '';
      finalInstructions = finalInstructions || job.special_instructions || job.instructions || '';
      finalState = finalState || job.state || '';
      finalCity = finalCity || job.city || '';
      finalPostcode = finalPostcode || job.postcode || '';
    }

    // ===== If no database data, use request body =====
    if (!job) {
      console.log(`⚠️ Job not in database, using request data`);
      finalAddress = address || '';
      finalCompanyName = '';  // Don't use companyName from request
      finalInstructions = instructions || '';
    }

    if (!finalBarcodes || finalBarcodes.length === 0) {
      return res.status(400).json({
        error: 'No barcodes available',
        message: 'This job has no shipping labels configured.'
      });
    }

    console.log(`📍 Generating labels with state: "${finalState}"`);
    console.log(`📍 Final Address: "${finalAddress}"`);
    console.log(`📍 Final Company Name: "${finalCompanyName}"`);
    console.log(`📍 Final Instructions: "${finalInstructions}"`);
    console.log(`📍 Barcodes:`, finalBarcodes);

    // ===== GENERATE PDF =====
    const pdfDoc = await generateShippingLabels(
      doNumber,
      finalBarcodes,
      finalCustomerName,
      finalAddress,
      finalCompanyName,  // ✅ Company name from database only
      finalPhone,
      finalInstructions,
      layout || '4-per-page',
      finalState,
      finalPostcode,
      finalCity
    );
    
    const pdfBytes = await pdfDoc.save();

    console.log(`✅ PDF generated with state: "${finalState}" for ${doNumber}, size: ${pdfBytes.length} bytes`);

    // ============================================================
    // SAVE TO DATABASE (SYNC JOB AND LABEL)
    // ============================================================
    
    // 1. SAVE THE LABEL RECORD
    const filename = `labels_${doNumber}_${Date.now()}.pdf`;
    const filepath = path.join(LABELS_DIR, filename);
    fs.writeFileSync(filepath, pdfBytes);
    const fileUrl = `/uploads/labels/${filename}`;

    // 2. CREATE LABEL RECORD IN DATABASE
    try {
      await Label.create({
        doNumber,
        filename,
        filepath,
        fileUrl,
        labelCount: finalBarcodes.length,
        barcodes: finalBarcodes,
        userId
      });
      console.log(`✅ Label record saved for ${doNumber}`);
    } catch (labelError) {
      console.error(`❌ Failed to save label record:`, labelError.message);
    }

    // 3. CREATE OR UPDATE JOB IN DATABASE
    try {
      const existingJob = await Job.findByDoNumberAny(doNumber);
      
      if (!existingJob) {
        const newJobData = {
          do_number: doNumber,
          customer_name: finalCustomerName,
          customer_company: finalCompanyName,  // ✅ Company name from database
          phone: finalPhone,
          delivery_address: finalAddress,
          postcode: finalPostcode,
          recipient_name: finalCustomerName,
          recipient_phone: finalPhone,
          boxes: finalBarcodes.length,
          weight: 0,
          contents: finalInstructions || '',
          status: detrackJob?.status || detrackJob?.primary_job_status || 'pending',
          scheduled_date: detrackJob?.date || new Date().toISOString().split('T')[0],
          special_instructions: finalInstructions || '',
          barcodes: finalBarcodes,
          detrack_id: detrackJob?.id || '',
          source: 'detrack_sync',
          group_name: detrackJob?.group_name || '',
          group_id: detrackJob?.group_id || '',
          pickup_address: '',
          user_id: userId,
          state: finalState,
          city: finalCity,
          label_url: fileUrl
        };
        
        await Job.create(newJobData);
        console.log(`✅ Job ${doNumber} CREATED in database from Detrack sync`);
      } else {
        const updateData = {
          customer_name: finalCustomerName,
          customer_company: finalCompanyName,  // ✅ Company name from database
          phone: finalPhone,
          delivery_address: finalAddress,
          postcode: finalPostcode,
          recipient_name: finalCustomerName,
          recipient_phone: finalPhone,
          boxes: finalBarcodes.length,
          status: detrackJob?.status || detrackJob?.primary_job_status || existingJob.status,
          scheduled_date: detrackJob?.date || existingJob.scheduled_date,
          special_instructions: finalInstructions || existingJob.special_instructions,
          barcodes: finalBarcodes,
          detrack_id: detrackJob?.id || existingJob.detrack_id,
          state: finalState || existingJob.state,
          city: finalCity || existingJob.city,
          group_name: detrackJob?.group_name || existingJob.group_name,
          group_id: detrackJob?.group_id || existingJob.group_id,
        };
        
        await Job.update(doNumber, updateData);
        console.log(`✅ Job ${doNumber} UPDATED in database`);
      }

      await Job.updateLabelUrl(doNumber, fileUrl);
      console.log(`✅ Label URL updated for ${doNumber}`);
      
    } catch (dbError) {
      console.error(`❌ Failed to save job to database:`, dbError.message);
    }

    // ============================================================
    // RETURN THE PDF
    // ============================================================
    
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="labels_${doNumber}.pdf"`);
    res.setHeader('Content-Length', pdfBytes.length);
    res.send(Buffer.from(pdfBytes));

    console.log(`✅ Labels downloaded for ${doNumber} with state: ${finalState}`);

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
    const encodedFilename = req.params.filename;
    const filename = decodeURIComponent(encodedFilename);
    
    console.log(`📄 Downloading labels: ${filename} (encoded: ${encodedFilename})`);
    
    const filepath = path.join(LABELS_DIR, filename);

    if (!fs.existsSync(filepath)) {
      console.error(`❌ File not found: ${filepath}`);
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