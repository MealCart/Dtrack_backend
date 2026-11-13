const { PDFDocument, rgb } = require('pdf-lib');
const fontkit=require('@pdf-lib/fontkit');
const fs=require('fs'),path=require('path');
const regularFont=fs.readFileSync(path.join(__dirname,'../../assets/fonts/DejaVuSans.ttf'));
const boldFont=fs.readFileSync(path.join(__dirname,'../../assets/fonts/DejaVuSans-Bold.ttf'));
const { createHmac } = require('crypto');
const { array, httpError } = require('./databaseBookingService');
function mediaUrl(value) {
 const source=typeof value==='string'?value:value?.url||value?.photo_url||value?.file_url||value?.uri;
 if(!source)return null;
 const base=process.env.DRIVER_MEDIA_BASE_URL||'https://mealcart-router-backend.onrender.com';
 let url,allowed;try{url=new URL(source,base);allowed=new Set([new URL(base).origin,...(process.env.POD_MEDIA_ORIGINS||'').split(',').filter(Boolean).map(v=>new URL(v.trim()).origin)]);}catch{throw httpError(422,'Completion media has an invalid URL');}
 if(url.protocol!=='https:'||url.username||url.password||!allowed.has(url.origin)||/(^|\.)detrack\.com$/i.test(url.hostname))throw httpError(422,'Completion media has an unapproved URL');
 return url.href;
}
async function fetchMedia(value) {
 let url=mediaUrl(value);if(!url)return null;
 const parsed=new URL(url),headers={};
 const driverOrigin=new URL(process.env.DRIVER_MEDIA_BASE_URL||'https://mealcart-router-backend.onrender.com').origin;
 const proof=/^\/api\/(?:driver-mobile\/)?proof-files\/([a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12})$/i.exec(parsed.pathname);
 if(parsed.origin===driverOrigin&&proof){
  const secret=process.env.POD_MEDIA_SECRET||'';
  if(secret.length<32)throw httpError(503,'Set the same POD_MEDIA_SECRET (at least 32 characters) on the customer portal and driver backends.');
  const expires=String(Math.floor(Date.now()/1000)+90),id=proof[1];
  headers['x-mealcart-pod-signature']=createHmac('sha256',secret).update(`mealcart-pod-v1\n${id}\n${expires}`).digest('hex');
  url=`${driverOrigin}/api/internal/pod-media/${id}?expires=${expires}`;
 }
 let response;try{response=await fetch(url,{headers,redirect:'error',signal:AbortSignal.timeout(15000)});}catch{throw httpError(502,'Driver completion media could not be downloaded. Please retry later.');}
 if(!response.ok){
  await response.body?.cancel();
  if([401,403,503].includes(response.status))throw httpError(502,'Driver media authorization failed. Check POD_MEDIA_SECRET matches on both backends and deploy the updated driver backend.');
  if(response.status===404)throw httpError(502,'A saved driver photo or signature is unavailable. Check the driver backend deployment and persistent proof disk.');
  throw httpError(502,'Driver completion media could not be downloaded');
 }
 const max=15*1024*1024;if(Number(response.headers.get('content-length'))>max){await response.body?.cancel();throw httpError(422,'Completion media exceeds size limit');}
 const chunks=[];let length=0;for await(const chunk of response.body){length+=chunk.length;if(length>max){await response.body?.cancel().catch(()=>{});throw httpError(422,'Completion media exceeds size limit');}chunks.push(Buffer.from(chunk));}
 return Buffer.concat(chunks);
}
async function completionRecord(row,type,db){
 if(!['completed','delivered'].includes(String(row.status).toLowerCase()))throw httpError(409,'POD is available only after delivery completion or collection completion');
 const collection=type==='collection',table=collection?'mealcart_collection_completions':'mealcart_delivery_completions',column=collection?'collection_id':'job_id';
 let receipt;
 try{receipt=(await db.query(`SELECT c.*,d.name AS driver_name,(SELECT s->>'offlineRecordedAt' FROM jsonb_array_elements(COALESCE(p.stop_arrivals,'[]'::jsonb)) s WHERE (s->>'seq')::int=c.stop_seq LIMIT 1) AS driver_recorded_at FROM ${table} c LEFT JOIN drivers d ON d.public_id=c.driver_id LEFT JOIN route_plans p ON p.public_id=c.plan_id AND p.created_at::timestamptz=c.plan_created_at WHERE c.${column}=$1 AND c.do_number=$2 ORDER BY c.completed_at DESC LIMIT 1`,[row.id,row.do_number])).rows[0];}
 catch(error){if(error.code!=='42P01')throw error;throw httpError(503,'Driver completion tables are unavailable. Check both backends use the same database and run the completion migrations.');}
 return {...row,pod_type:type,completion_photos:receipt?array(receipt.photos):array(row.completion_photos),completion_signature_url:receipt?.signature_url||row.completion_signature_url,completion_driver_id:receipt?.driver_id||row.completion_driver_id,completion_driver_name:receipt?.driver_name||row.completion_driver_name,completion_recorded_at:receipt?.completed_at||row.completion_recorded_at,completion_performed_at:receipt?.driver_recorded_at||receipt?.completed_at||row.completion_recorded_at,completion_receipt_id:receipt?.id,completion_route_id:receipt?.plan_id,completion_stop_seq:receipt?.stop_seq};
}
async function generate(job) {
 if(!['completed','delivered'].includes(String(job.status).toLowerCase()))throw httpError(409,'POD is available only after delivery completion or collection completion');
 const collection=job.pod_type==='collection',kind=collection?'COLLECTION':'DELIVERY';
 const photos=array(job.completion_photos),signature=job.completion_signature_url;
 const doc=await PDFDocument.create();doc.setTitle(`Mealcart Proof of ${collection?'Collection':'Delivery'} - ${job.do_number}`);doc.setAuthor('Mealcart');
 doc.registerFontkit(fontkit);const font=await doc.embedFont(regularFont,{subset:true}),bold=await doc.embedFont(boldFont,{subset:true});
 const safe=v=>String(v??'Not recorded').replace(/[^\x20-\x7e]/g,' ');
 const blue=rgb(0.02,0.28,0.38),grey=rgb(.35,.4,.44);
 let page,y;
 function newPage(title){page=doc.addPage([595,842]);page.drawRectangle({x:0,y:750,width:595,height:92,color:blue});page.drawText('MEALCART',{x:40,y:804,size:12,font:bold,color:rgb(1,1,1)});page.drawText(title,{x:40,y:774,size:18,font:bold,color:rgb(1,1,1)});y=720;}
 function wrap(text,size,width){const result=[];let current='';for(const token of safe(text).split(/\s+/)){let word=token;while(font.widthOfTextAtSize(word,size)>width){let n=1;while(n<word.length&&font.widthOfTextAtSize(word.slice(0,n+1),size)<=width)n++;if(current){result.push(current);current='';}result.push(word.slice(0,n));word=word.slice(n);}const next=current?current+' '+word:word;if(font.widthOfTextAtSize(next,size)>width&&current){result.push(current);current=word;}else current=next;}if(current)result.push(current);return result.length?result:['Not recorded'];}
 function line(label,value){const lines=wrap(value,11,360),height=Math.max(30,lines.length*15+12);if(y-height<65)newPage(`PROOF OF ${kind} - DETAILS`);page.drawText(label.toUpperCase(),{x:40,y,size:8,font:bold,color:grey});for(let i=0;i<lines.length;i++)page.drawText(lines[i],{x:185,y:y-i*15,size:11,font});y-=height;}
 function date(value,dateOnly=false){if(!value)return 'Not recorded';if(dateOnly)return value instanceof Date?value.toISOString().slice(0,10):String(value).slice(0,10);const d=new Date(value);return Number.isNaN(d.getTime())?safe(value):new Intl.DateTimeFormat('en-AU',{timeZone:'Australia/Melbourne',dateStyle:'medium',timeStyle:'long'}).format(d);}
 newPage(`PROOF OF ${kind}`);
 line('Reference',job.do_number);line(collection?'Collected from':'Recipient',job.recipient_name||job.customer_name);line('Company',job.recipient_company||job.customer_company);
 line(collection?'Collection address':'Delivery address',[collection?job.collection_address:job.delivery_address,job.city,job.state,job.postcode,job.country].filter(Boolean).join(', '));
 line('Phone',job.recipient_phone||job.phone);if(job.recipient_email)line('Email',job.recipient_email);
 line('Scheduled date',date(job.scheduled_date,true));line('Status',job.status);line('Completed at',date(job.completion_performed_at||job.completion_recorded_at));if(job.completion_performed_at&&date(job.completion_performed_at)!==date(job.completion_recorded_at))line('Server confirmed at',date(job.completion_recorded_at));line('Time zone','Australia/Melbourne');line('Driver',job.completion_driver_name||'Not recorded');line('Driver ID',job.completion_driver_id||'Not recorded');
 if(job.completion_route_id)line('Route / Stop',`${job.completion_route_id} / ${job.completion_stop_seq}`);
 if(job.completion_receipt_id)line('Completion receipt',job.completion_receipt_id);
 if(job.boxes!=null)line('Parcels / boxes',job.boxes);
 if(job.special_instructions)line('Instructions',job.special_instructions);
 line('Evidence',`${photos.length} photo(s); driver signature ${signature?'recorded':'not recorded'}`);
 if(!photos.length&&!signature)line('Historical record','No completion photos or signature were recorded.');
 const evidence=[...photos.map((value,i)=>({value,label:`${collection?'Collection':'Delivery'} photo ${i+1} of ${photos.length}`})),...(signature?[{value:signature,label:'Driver signature'}]:[])];
 for(const item of evidence){const bytes=await fetchMedia(item.value);if(!bytes)throw httpError(422,'Stored completion evidence is missing a media URL');let image;try{image=await doc.embedJpg(bytes);}catch{try{image=await doc.embedPng(bytes);}catch{throw httpError(422,'Completion evidence must be JPEG or PNG');}}
  newPage(item.label.toUpperCase());page.drawText(safe(job.do_number),{x:40,y:720,size:11,font:bold});const scale=Math.min(515/image.width,620/image.height);const w=image.width*scale,h=image.height*scale;page.drawImage(image,{x:(595-w)/2,y:70+(620-h)/2,width:w,height:h});
 }
 const pages=doc.getPages();for(let i=0;i<pages.length;i++){pages[i].drawText('Mealcart | Stored driver completion evidence',{x:40,y:28,size:8,font,color:grey});pages[i].drawText(`${i+1} / ${pages.length}`,{x:520,y:28,size:8,font,color:grey});}
 return Buffer.from(await doc.save());
}
module.exports={generate,completionRecord,mediaUrl,fetchMedia};
