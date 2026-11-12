// src/controllers/labelController.js
const fs = require('fs');
const path = require('path');
const Job = require('../models/Job');
const Label = require('../models/Label');
const { generateShippingLabels } = require('../services/labelService');
const { LABELS_DIR } = require('../config/constants');
const { generateBarcodes } = require('../utils/helpers');
const { PDFDocument } = require('pdf-lib'); // 👈 ADD THIS LINE

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

const { find, array, handler } = require('../services/databaseBookingService');
async function labelBooking(req, reference) {
  try { return {...await find(req,reference),__kind:'delivery'}; }
  catch(error) {
    if(error.status!==404)throw error;
    const row=await find(req,reference,'collection');
    return {...row,__kind:'collection',delivery_address:row.collection_address,customer_company:row.recipient_company,barcodes:generateBarcodes(row.do_number,1),boxes:1};
  }
}
async function databaseLabels(req) {
  const job = await labelBooking(req, req.body.doNumber);
  let barcodes = array(job.barcodes);
  if (!barcodes.length) {
    barcodes = generateBarcodes(job.do_number, parseInt(job.boxes) || 1);
    // Initialize labels only when none exist. Never replace printed barcodes or scans.
    const {pool} = require('../config/database');
    const updated = await pool.query(`UPDATE jobs SET barcodes=$1 WHERE id=$2 AND (barcodes IS NULL OR barcodes='[]'::jsonb) RETURNING barcodes`,[JSON.stringify(barcodes),job.id]);
    if (!updated.rows.length) barcodes = array((await find(req,job.do_number)).barcodes);
  }
  const pdf = await generateShippingLabels(job.do_number,barcodes,job.recipient_name||job.customer_name,job.delivery_address,cleanCompanyName(job.customer_company||''),job.recipient_phone||job.phone,job.special_instructions,req.body.layout||'4-per-page',job.state||'',job.postcode||'',job.city||'');
  return {job,barcodes,bytes:await pdf.save()};
}
exports.generateLabels = handler(async (req,res) => {
  const {job,barcodes,bytes} = await databaseLabels(req);
  const filename=`labels_${job.do_number.replace(/[^A-Za-z0-9._-]/g,'_')}_${require('crypto').randomUUID()}.pdf`;
  fs.mkdirSync(LABELS_DIR,{recursive:true});
  const filepath=path.join(LABELS_DIR,filename),url=`/uploads/labels/${filename}`;
  fs.writeFileSync(filepath,bytes);
  await Label.create({doNumber:job.do_number,filename,filepath,fileUrl:url,labelCount:barcodes.length,barcodes,userId:job.user_id});
  if(job.__kind==='delivery') await Job.updateLabelUrl(job.do_number,url);
  return res.json({success:true,source:'database',filename,url,fullUrl:url,doNumber:job.do_number,labelCount:barcodes.length,barcodes,synced:false});
});
exports.generateAndDownloadLabels = handler(async(req,res) => {
  const {job,barcodes,bytes}=await databaseLabels(req);
  const filename=`labels_${job.do_number.replace(/[^A-Za-z0-9._-]/g,'_')}_${require('crypto').randomUUID()}.pdf`;
  fs.mkdirSync(LABELS_DIR,{recursive:true});
  const filepath=path.join(LABELS_DIR,filename),url=`/uploads/labels/${filename}`;
  fs.writeFileSync(filepath,bytes);
  await Label.create({doNumber:job.do_number,filename,filepath,fileUrl:url,labelCount:barcodes.length,barcodes,userId:job.user_id});
  if(job.__kind==='delivery')await Job.updateLabelUrl(job.do_number,url);
  res.setHeader('Content-Type','application/pdf');
  res.setHeader('Content-Disposition',`attachment; filename="labels_${job.do_number.replace(/[^A-Za-z0-9._-]/g,'_')}.pdf"`);
  return res.send(Buffer.from(bytes));
});

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
exports.generateCombinedLabels = async (req, res) => {
  try {
    const { jobs } = req.body;
    const userId = req.user.id;

    if (!jobs || !Array.isArray(jobs) || jobs.length === 0) {
      return res.status(400).json({
        error: 'Jobs array is required'
      });
    }

    console.log(`📦 Generating combined labels for ${jobs.length} jobs...`);

    const pdfDoc = await PDFDocument.create();
    let totalLabels = 0;
    const labelData = [];

    // Process each job
    for (const jobData of jobs) {
      const stored = await labelBooking(req, jobData.doNumber);
      const doNumber=stored.do_number,barcodes=array(stored.barcodes);
      if(!barcodes.length) throw Object.assign(new Error('Generate labels for this booking first'),{status:409});
      const customerName=stored.recipient_name||stored.customer_name,address=stored.delivery_address,
        companyName=cleanCompanyName(stored.customer_company||''),phone=stored.recipient_phone||stored.phone,
        instructions=stored.special_instructions,state=stored.state,postcode=stored.postcode,city=stored.city;

      // Get label size from request or use default
      const layout = req.body.layout || '4-per-page';
      
      // Generate labels for this job using the existing labelService
      const jobPdf = await generateShippingLabels(
        doNumber,
        barcodes,
        customerName,
        address,
        companyName,
        phone,
        instructions,
        layout,
        state,
        postcode,
        city
      );

      // Copy pages from job PDF to main PDF
      const pages = await pdfDoc.copyPages(jobPdf, jobPdf.getPageIndices());
      pages.forEach(page => {
        pdfDoc.addPage(page);
      });

      totalLabels += barcodes.length;
      labelData.push({
        doNumber,
        labelCount: barcodes.length,
        barcodes: barcodes
      });

      console.log(`✅ Added ${barcodes.length} labels for ${doNumber}`);
    }

    if (pdfDoc.getPageCount() === 0) {
      return res.status(400).json({
        error: 'No labels to generate'
      });
    }

    // Save the combined PDF
    const pdfBytes = await pdfDoc.save();
    const filename = `Combined_Labels_${require('crypto').randomUUID()}.pdf`;
    const filepath = path.join(LABELS_DIR, filename);
    fs.writeFileSync(filepath, pdfBytes);
    const fileUrl = `/uploads/labels/${filename}`;

    // Save label record in database
    await Label.create({
      doNumber: 'combined', // Special identifier
      filename,
      filepath,
      fileUrl,
      labelCount: totalLabels,
      barcodes: labelData.map(d => d.barcodes).flat(),
      userId
    });

    console.log(`✅ Combined PDF saved: ${filename} with ${totalLabels} labels`);

    // Return the PDF
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Content-Length', pdfBytes.length);
    res.send(Buffer.from(pdfBytes));

  } catch (error) {
    console.error('❌ Error generating combined labels:', error);
    res.status(500).json({
      error: 'Failed to generate combined labels',
      details: error.message
    });
  }
};