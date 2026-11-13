const { pool, scope, find, array, legacy, handler, httpError } = require('../services/databaseBookingService');
const completed = row => ['completed','delivered','failed','cancelled'].includes((row.status || '').toLowerCase());
exports.getJobs = handler(async (req,res) => {
  const params=[];let where=scope(req,params);if(req.query.date){params.push(req.query.date);where+=` AND scheduled_date = $${params.length}`;}
  const result=await pool.query(`SELECT * FROM jobs WHERE true${where} ORDER BY scheduled_date DESC,id DESC`,params);
  return res.json({success:true,source:'database',data:result.rows});
});
exports.getJob = handler(async(req,res)=>{
  const params=[String(req.params.id)],where=scope(req,params);
  const result=await pool.query(`SELECT * FROM jobs WHERE (id::text = $1 OR do_number = $1)${where} ORDER BY id DESC LIMIT 1`,params);
  if(!result.rows.length)throw httpError(404,'Job not found in database');
  return res.json({success:true,source:'database',data:result.rows[0]});
});
async function findPrintedJob(req, input, db=pool, lock=false) {
 const reference=typeof input==='string'?input.trim():'';
 if(!reference)throw httpError(400,'Booking reference is required');
 // Older Zebra builds derive the DO by removing the last label suffix.
 // First prefer an exact owned reference, then match the printed label prefix.
 try{return await find(req,reference,'delivery',db,lock);}
 catch(error){if(error.status!==404)throw error;}
 const params=[reference],where=scope(req,params,'j.');
 const rows=(await db.query(`SELECT j.* FROM jobs j WHERE (
   regexp_replace(j.do_number,'^#','')=regexp_replace($1,'^#','') OR EXISTS (
     SELECT 1 FROM jsonb_array_elements_text(CASE WHEN jsonb_typeof(j.barcodes)='array' THEN j.barcodes ELSE '[]'::jsonb END) b(code)
     WHERE regexp_replace(regexp_replace(b.code,'-[^-]*$',''),'^#','')=regexp_replace($1,'^#','')
   ))${where} ORDER BY j.id DESC LIMIT 2${lock?' FOR UPDATE':''}`,params)).rows;
 if(!rows.length)throw httpError(404,'Job not found in database');
 if(rows.length>1)throw httpError(409,'Multiple jobs match this printed label reference. Ask an administrator to review it.');
 return rows[0];
}
exports.getJobByDoNumber=handler(async(req,res)=>res.json({success:true,source:'database',data:legacy(await findPrintedJob(req,req.query.do_number))}));
exports.getDetrackJob=handler(async(req,res)=>{
  const params=[String(req.params.id)],where=scope(req,params);
  const result=await pool.query(`SELECT * FROM jobs WHERE (id::text = $1 OR do_number = $1)${where} LIMIT 1`,params);
  if(!result.rows.length)throw httpError(404,'Job not found in database');
  return res.json({success:true,source:'database',data:legacy(result.rows[0])});
});
function list(type) { return handler(async(req,res)=>{
  const params=[];let where=scope(req,params);const date=req.query.date || req.query.from;
  if(date){params.push(date);where+=` AND scheduled_date ${req.query.date?'=':'>='} $${params.length}`;}
  if(req.query.to){params.push(req.query.to);where+=` AND scheduled_date <= $${params.length}`;}
  if(req.query.status){params.push(req.query.status);where+=` AND status = $${params.length}`;}
  const page=Math.max(1,parseInt(req.query.page)||1),limit=Math.min(500,Math.max(1,parseInt(req.query.limit)||100));
  const table=type==='collection'?'collections':'jobs';
  const total=(await pool.query(`SELECT COUNT(*)::int AS total FROM ${table} WHERE true${where}`,params)).rows[0].total;
  params.push(limit,(page-1)*limit);
  const rows=(await pool.query(`SELECT * FROM ${table} WHERE true${where} ORDER BY scheduled_date DESC,id DESC LIMIT $${params.length-1} OFFSET $${params.length}`,params)).rows;
  return res.json({success:true,source:'database',data:rows.map(r=>legacy(r,type)),total_count:total,currentPage:page,hasNext:page*limit<total,meta:{total,page,limit,hasNext:page*limit<total,totalPages:Math.ceil(total/limit)}});
}); }
exports.getDetrackJobs=exports.getDetrackJobsWithFilters=list('delivery');exports.getDetrackCollections=list('collection');
exports.getGroups=exports.searchAllGroups=handler(async(req,res)=>{
  scope(req,[]);
  return res.status(410).json({success:false,error:'External groups have been retired. Select a customer from the Users list.'});
});
exports.cancelJob=handler(async(req,res)=>{
  const row=await find(req,req.params.doNumber);
  if(completed(row))throw httpError(409,'This job is completed, failed or cancelled and cannot be cancelled');
  const params=[row.id];const where=scope(req,params);
  const result=await pool.query(`UPDATE jobs SET status = 'cancelled',updated_at=CURRENT_TIMESTAMP WHERE id=$1${where} AND LOWER(status) NOT IN ('completed','delivered','failed','cancelled') RETURNING *`,params);
  if(!result.rows.length)throw httpError(409,'Job status changed. Refresh before trying again.');
  return res.json({success:true,source:'database',message:'Job cancelled',data:legacy(result.rows[0])});
});
exports.updateJob=handler(async(req,res)=>{
  const client=await pool.connect();
  try {
    await client.query('BEGIN');const row=await find(req,req.params.doNumber,'delivery',client,true);
    if(completed(row))throw httpError(409,'Completed, failed or cancelled jobs cannot be edited');
    const input={...req.body};require('../utils/australianPhone').normalizePhoneFields(input);
    const mapping={deliver_to:'recipient_name',recipient_name:'recipient_name',company_name:'customer_company',phone:'recipient_phone',recipient_phone:'recipient_phone',notify_email:'recipient_email',recipient_email:'recipient_email',address:'delivery_address',delivery_address:'delivery_address',postal_code:'postcode',postcode:'postcode',date:'scheduled_date',scheduled_date:'scheduled_date',instructions:'special_instructions',special_instructions:'special_instructions',weight:'weight',contents:'contents',state:'state',city:'city',country:'country',address_1:'address_1',address_2:'address_2',delivery_type:'delivery_type'};
    const values=new Map();for(const[key,column]of Object.entries(mapping))if(input[key]!==undefined)values.set(column,input[key]);
    if(values.has('delivery_type'))values.set('delivery_type',require('../utils/bookingType')(values.get('delivery_type')));
    if(input.boxes!==undefined || input.number_of_shipping_labels!==undefined){
      const boxes=Number(input.boxes ?? input.number_of_shipping_labels);if(!Number.isInteger(boxes)||boxes<1||boxes>10000)throw httpError(400,'Invalid box count');
      if(boxes!==row.boxes && array(row.scans).length)throw httpError(409,'Cannot change box count after warehouse scanning');
      values.set('boxes',boxes);
      if(boxes!==row.boxes)values.set('barcodes',JSON.stringify(require('../utils/helpers').generateBarcodes(row.do_number,boxes)));
    }
    if(!values.size)throw httpError(400,'No editable fields provided');
    const params=[...values.values(),row.id];const set=[...values.keys()].map((key,i)=>`${key}=$${i+1}`).join(',');
    const result=await client.query(`UPDATE jobs SET ${set},updated_at=CURRENT_TIMESTAMP WHERE id=$${params.length} RETURNING *`,params);
    await client.query('COMMIT');return res.json({success:true,source:'database',data:legacy(result.rows[0]),message:'Job updated'});
  }catch(e){await client.query('ROLLBACK');throw e;}finally{client.release();}
});
exports.getBoxStatus=handler(async(req,res)=>{
 const job=await findPrintedJob(req,req.params.do_number),barcodes=array(job.barcodes),scans=array(job.scans);
 const boxStatus=barcodes.map(barcode=>{const scan=scans.find(s=>s.barcode===barcode);return{barcode,scanned:!!scan,scanTime:scan?.timestamp||null,scannedBy:scan?.scanned_by||scan?.staff||null,location:scan?.location||null,checkpoint:scan?.checkpoint||'Pending'};});
 const scannedCount=boxStatus.filter(s=>s.scanned).length;
 return res.json({success:true,source:'database',data:{do_number:job.do_number,totalBoxes:barcodes.length,scannedCount,remainingCount:barcodes.length-scannedCount,allScanned:barcodes.length>0&&scannedCount===barcodes.length,boxStatus}});
});
function scan(bulk){return handler(async(req,res)=>{
 const codes=bulk?req.body.barcodes:[req.body.barcode];if(!Array.isArray(codes)||!codes.length||codes.some(c=>typeof c!=='string'||!c))throw httpError(400,'Valid barcodes are required');
 const client=await pool.connect();try{
  await client.query('BEGIN');const row=await findPrintedJob(req,req.params.do_number||req.body.do_number,client,true);
  const barcodes=array(row.barcodes),scans=array(row.scans),scanned=[],errors=[];
  for(const inputBarcode of codes){
   const raw=inputBarcode.trim();
   const matches=barcodes.filter(code=>String(code).replace(/^#/,'')===raw.replace(/^#/,''));
   const barcode=barcodes.includes(raw)?raw:matches.length===1?matches[0]:raw;
   if(!barcodes.includes(barcode)){errors.push({barcode,error:'Invalid barcode for this job'});continue;}if(scans.some(s=>s.barcode===barcode)){errors.push({barcode,error:'Already scanned'});continue;}
   const event={barcode,checkpoint:'Scanned',timestamp:new Date().toISOString(),staff:[req.user.first_name,req.user.last_name].filter(Boolean).join(' ')||req.user.email,scanned_by:req.user.email,location:req.body.location||'Warehouse'};scans.push(event);scanned.push(barcode);
  }
  if(!bulk&&errors.length)throw httpError(400,errors[0].error);
  if(scanned.length)await client.query('UPDATE jobs SET scans=$1,updated_at=CURRENT_TIMESTAMP WHERE id=$2',[JSON.stringify(scans),row.id]);
  await client.query('COMMIT');const count=new Set(scans.filter(s=>barcodes.includes(s.barcode)).map(s=>s.barcode)).size;
  return res.json({success:true,source:'database',message:'Warehouse scans saved',data:{do_number:row.do_number,barcode:codes[0],scan:scans.find(s=>s.barcode===codes[0]),scanned,errors,scannedCount:count,totalScanned:count,totalBoxes:barcodes.length,remainingBoxes:barcodes.length-count,allScanned:barcodes.length>0&&count===barcodes.length}});
 }catch(e){await client.query('ROLLBACK');throw e;}finally{client.release();}
});}
exports.scanBox=scan(false);exports.bulkScan=scan(true);
exports.generatePod=exports.downloadPod=handler(async(req,res)=>{
 const requested=req.query.type;
 if(requested!==undefined&&!['delivery','collection'].includes(requested))throw httpError(400,'POD type must be delivery or collection');
 let type=requested||'delivery',row;
 try{row=await find(req,req.params.doNumber,type);}catch(error){
  if(requested||error.status!==404)throw error;
  type='collection';row=await find(req,req.params.doNumber,type);
 }
 const pod=require('../services/databasePodService');
 const record=await pod.completionRecord(row,type,pool);
 const pdf=await pod.generate(record);
 res.setHeader('Content-Type','application/pdf');res.setHeader('Content-Disposition',`attachment; filename="POD_${row.do_number.replace(/[^A-Za-z0-9._-]/g,'_')}.pdf"`);res.setHeader('Cache-Control','no-store');return res.send(pdf);
});
// Resolve the actual stored label, without guessing where a hyphenated DO number ends.
exports.getJobByBarcode=handler(async(req,res)=>{
 const barcode=typeof req.query.barcode==='string'?req.query.barcode.trim():'';
 if(!barcode||barcode.length>512)throw httpError(400,'A valid barcode is required');
 const params=[barcode],where=scope(req,params,'j.');
 const rows=(await pool.query(`SELECT j.*, b.code AS matched_barcode FROM jobs j
 CROSS JOIN LATERAL jsonb_array_elements_text(CASE WHEN jsonb_typeof(j.barcodes)='array' THEN j.barcodes ELSE '[]'::jsonb END) AS b(code)
 WHERE (b.code=$1 OR regexp_replace(b.code,'^#','')=regexp_replace($1,'^#',''))${where}
 ORDER BY (b.code=$1) DESC,j.id DESC LIMIT 2`,params)).rows;
 if(!rows.length)throw Object.assign(httpError(404,'No database job has this shipping barcode. Check the label and confirm the booking was saved.'),{code:'BARCODE_NOT_FOUND'});
 if(rows.length>1)throw httpError(409,'This barcode matches multiple stored labels. Ask an administrator to review it.');
 return res.json({success:true,source:'database',data:legacy(rows[0]),matched_barcode:rows[0].matched_barcode});
});
