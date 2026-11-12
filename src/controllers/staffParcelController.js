const { pool, handler, httpError, legacy } = require('../services/databaseBookingService');
const { randomUUID } = require('crypto');
const { normalizeAustralianPhone } = require('../utils/australianPhone');
const states=['New South Wales','Victoria','Queensland','Western Australia','South Australia','Tasmania','Australian Capital Territory','Northern Territory'];
function staff(req){if(!['admin','staff'].includes(req.user?.role))throw httpError(403,'Only staff or administrators can register warehouse parcels');}
function field(body,key,max,required=true){const value=body[key];if(value!==undefined&&typeof value!=='string')throw httpError(400,`Invalid ${key}`);const text=(value||'').trim();if((required&&!text)||text.length>max)throw httpError(400,`Please check ${key.replace(/_/g,' ')}`);return text;}
exports.customers=handler(async(req,res)=>{
 staff(req);const q=typeof req.query.q==='string'?req.query.q.trim():'';if(q.length<2)return res.json({success:true,data:[]});if(q.length>100)throw httpError(400,'Customer search is too long');
 const rows=(await pool.query(`SELECT id,first_name,last_name,company_name,email FROM users WHERE lower(btrim(role))='customer' AND lower(btrim(status))='active' AND (concat_ws(' ',first_name,last_name,company_name,email) ILIKE $1) ORDER BY company_name,first_name,last_name,id LIMIT 20`,['%'+q+'%'])).rows;
 return res.json({success:true,source:'database',data:rows});
});
exports.register=handler(async(req,res)=>{
 staff(req);const b=req.body||{};const barcode=field(b,'barcode',512);
 if(/[\x00-\x1f\x7f]/.test(barcode))throw httpError(400,'Barcode contains unsupported control characters');
 const customer=Number(b.customer_id);if(!Number.isSafeInteger(customer)||customer<1)throw httpError(400,'Select an active customer');
 const name=field(b,'recipient_name',255),street=field(b,'address_1',500),suburb=field(b,'address_2',150),postcode=field(b,'postcode',4),state=field(b,'state',100),date=field(b,'scheduled_date',10),type=field(b,'delivery_type',100);
 if(!/^\d{4}$/.test(postcode))throw httpError(400,'Enter a four-digit Australian postcode');
 if(!states.includes(state))throw httpError(400,'Select an Australian state');
 if(!['Home Delivery','Business Delivery'].includes(type))throw httpError(400,'Select a delivery type');
 const parsed=new Date(date+'T00:00:00Z');if(!/^\d{4}-\d{2}-\d{2}$/.test(date)||!Number.isFinite(parsed.getTime())||parsed.toISOString().slice(0,10)!==date)throw httpError(400,'Enter a valid scheduled date (YYYY-MM-DD)');
 let phone;try{phone=normalizeAustralianPhone(field(b,'recipient_phone',40));}catch(error){throw httpError(400,error.message);}
 const email=field(b,'recipient_email',254,false),company=field(b,'recipient_company',255,false),notes=field(b,'special_instructions',2000,false);
 if(email&&!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))throw httpError(400,'Enter a valid notification email');
 if(b.boxes!==undefined&&Number(b.boxes)!==1)throw httpError(400,'Register one uniquely labelled parcel at a time');
 const client=await pool.connect();try{
  await client.query('BEGIN');
  // Serialize competing registration requests for the same printed label.
  await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',[barcode.replace(/^#/,'')]);
  const exists=await client.query(`SELECT id FROM jobs j WHERE EXISTS(SELECT 1 FROM jsonb_array_elements_text(CASE WHEN jsonb_typeof(j.barcodes)='array' THEN j.barcodes ELSE '[]'::jsonb END) b(code) WHERE regexp_replace(b.code,'^#','')=regexp_replace($1,'^#','')) LIMIT 1`,[barcode]);
  if(exists.rows.length)throw httpError(409,'This barcode is already registered. Close this window and scan it again.');
  const owner=(await client.query(`SELECT id FROM users WHERE id=$1 AND lower(btrim(role))='customer' AND lower(btrim(status))='active' FOR SHARE`,[customer])).rows[0];
  if(!owner)throw httpError(400,'Selected customer is no longer active. Select another customer.');
  const reference='WH-'+randomUUID();const scan={barcode,checkpoint:'Scanned',timestamp:new Date().toISOString(),staff:[req.user.first_name,req.user.last_name].filter(Boolean).join(' ')||req.user.email||'Staff',scanned_by:req.user.email||String(req.user.id),location:'Warehouse',registration:true};
  const row=(await client.query(`INSERT INTO jobs(do_number,customer_name,customer_company,phone,delivery_address,postcode,recipient_name,recipient_phone,recipient_email,boxes,weight,contents,status,scheduled_date,special_instructions,barcodes,scans,source,user_id,state,city,country,address_1,address_2,delivery_type,created_at,updated_at) VALUES($1,$2,$3,$4,$5,$6,$2,$4,$7,1,0,'','pending',$8,$9,$10::jsonb,$11::jsonb,'staff_registration',$12,$13,'','Australia',$14,$15,$16,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP) RETURNING *`,[reference,name,company,phone,[street,suburb].join(', '),postcode,email||null,date,notes,JSON.stringify([barcode]),JSON.stringify([scan]),customer,state,street,suburb,type])).rows[0];
  await client.query('COMMIT');
  return res.status(201).json({success:true,source:'database',data:legacy(row),scan:{do_number:reference,barcode,scannedCount:1,totalBoxes:1,allScanned:true}});
 }catch(error){await client.query('ROLLBACK');throw error;}finally{client.release();}
});
