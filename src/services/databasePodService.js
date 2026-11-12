const { PDFDocument, StandardFonts, rgb } = require('pdf-lib');
const { array, httpError } = require('./databaseBookingService');
function mediaUrl(value) {
  const source = typeof value === 'string' ? value : value?.url || value?.photo_url || value?.file_url || value?.uri;
  if (!source) return null;
  const base = process.env.DRIVER_MEDIA_BASE_URL || 'https://mealcart-router-backend.onrender.com';
  const url = new URL(source, base);
  const allowed = new Set([new URL(base).origin, ...(process.env.POD_MEDIA_ORIGINS || '').split(',').filter(Boolean).map(v => new URL(v.trim()).origin)]);
  if (url.protocol !== 'https:' || url.username || url.password || !allowed.has(url.origin) || /(^|\.)detrack\.com$/i.test(url.hostname)) throw httpError(422, 'Completion media has an unapproved URL');
  return url.href;
}
async function fetchMedia(value) {
  const url=mediaUrl(value);if(!url)return null;
  // Do not follow redirects to another provider or accept unbounded downloads.
  let response;
  try { response=await fetch(url,{redirect:'error',signal:AbortSignal.timeout(15000)}); }
  catch { throw httpError(502,'Driver completion media could not be downloaded. Please retry later.'); }
  if(!response.ok)throw httpError(502,'Driver completion media could not be downloaded');
  const max=15*1024*1024;
  if(Number(response.headers.get('content-length'))>max){await response.body?.cancel();throw httpError(422,'Completion media exceeds size limit');}
  const chunks=[];let length=0;
  for await(const chunk of response.body){length+=chunk.length;if(length>max)throw httpError(422,'Completion media exceeds size limit');chunks.push(Buffer.from(chunk));}
  return Buffer.concat(chunks);
}
async function generate(job) {
 if(!['completed','delivered'].includes(String(job.status).toLowerCase()))throw httpError(409,'POD is available only after delivery completion');
 const photos=array(job.completion_photos),signature=job.completion_signature_url;
 const doc=await PDFDocument.create();const font=await doc.embedFont(StandardFonts.Helvetica),bold=await doc.embedFont(StandardFonts.HelveticaBold);
 const safe=value=>String(value??'Not recorded').replace(/[^\x20-\x7e]/g,' ');
 const page=doc.addPage([595,842]);let y=795;
 function line(label,value){
  const words=safe(label+': '+value).split(' ');let text='';
  for(const word of words){const next=text?text+' '+word:word;if(text&&font.widthOfTextAtSize(next,11)>515){page.drawText(text,{x:40,y,size:11,font});y-=16;text=word;}else text=next;}
  if(text){page.drawText(text,{x:40,y,size:11,font});y-=24;}
 }
 page.drawText('MEALCART - PROOF OF DELIVERY',{x:40,y,size:18,font:bold,color:rgb(0,0.35,0.5)});y-=42;
 line('Reference',job.do_number);line('Recipient',job.recipient_name||job.customer_name);line('Address',job.delivery_address);line('Postcode',job.postcode);line('Scheduled date',job.scheduled_date instanceof Date?job.scheduled_date.toISOString().slice(0,10):job.scheduled_date);line('Status',job.status);line('Driver ID',job.completion_driver_id||'Not recorded');line('Completed at',job.completion_recorded_at||'Not recorded');line('Boxes',job.boxes);line('Source','Mealcart database and driver completion evidence');
 if(!photos.length&&!signature)line('Evidence','No completion photos or signature recorded');
 const evidence=[...photos.map(photo=>({value:photo,label:'Driver completion photo'})),...(signature?[{value:signature,label:'Recipient signature'}]:[])];
 for(let i=0;i<evidence.length;i++){
  const bytes=await fetchMedia(evidence[i].value);if(!bytes)throw httpError(422,'Stored completion evidence is missing a media URL');
  let image;try{image=await doc.embedJpg(bytes);}catch{try{image=await doc.embedPng(bytes);}catch{throw httpError(422,'Completion evidence must be JPEG or PNG');}}
  const p=doc.addPage([595,842]);p.drawText(safe(`${evidence[i].label} - ${job.do_number}`),{x:40,y:797,font:bold,size:12});const size=image.scale(Math.min(515/image.width,720/image.height));p.drawImage(image,{x:(595-size.width)/2,y:40+(720-size.height)/2,width:size.width,height:size.height});
 }
 return Buffer.from(await doc.save());
}
module.exports={generate,mediaUrl,fetchMedia};
