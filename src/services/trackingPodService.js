const {createHmac,timingSafeEqual}=require('crypto');
const {pool,httpError}=require('./databaseBookingService');
function verifyTrackingPod(input,signature,secret,now=Date.now()){
 if(!secret||secret.length<32)throw httpError(503,'POD_MEDIA_SECRET is not configured');
 if(!input||!['jobs','collections'].includes(input.source)||!Number.isSafeInteger(input.id)||input.id<1||input.id>2147483647||typeof input.reference!=='string'||!input.reference||input.reference.length>256||typeof input.customerId!=='string'||!input.customerId||input.customerId.length>128||typeof input.date!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(input.date)||typeof input.expires!=='string'||!/^\d{10}$/.test(input.expires)||typeof signature!=='string'||! /^[a-f0-9]{64}$/.test(signature))throw httpError(403,'Invalid POD authorization');
 const remaining=Number(input.expires)-Math.floor(now/1000);if(remaining<0||remaining>120)throw httpError(403,'Expired POD authorization');
 const payload=[input.source,input.id,input.reference,input.customerId,input.date,input.expires];
 const expected=createHmac('sha256',secret).update('mealcart-tracking-pod-v1\n'+JSON.stringify(payload)).digest();
 if(!timingSafeEqual(expected,Buffer.from(signature,'hex')))throw httpError(403,'Invalid POD authorization');
 return input;
}
async function generateTrackingPod(input){
 const type=input.source==='collections'?'collection':'delivery';
 const rows=(await pool.query(`SELECT * FROM ${input.source==='collections'?'collections':'jobs'} WHERE id=$1 AND do_number=$2 AND user_id::text=$3 AND scheduled_date=$4`,[input.id,input.reference,input.customerId,input.date])).rows;
 if(rows.length!==1)throw httpError(404,'Booking not found');
 const pod=require('./databasePodService');const record=await pod.completionRecord(rows[0],type,pool);return pod.generate(record);
}
module.exports={verifyTrackingPod,generateTrackingPod};
