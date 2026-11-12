const { pool, scope, legacy, handler, httpError } = require('../services/databaseBookingService');
async function search(req, exact) {
 const term=req.query.q || req.query.do_number;
 if(typeof term!=='string'||!term.trim()||term.length>255)throw httpError(400,'A search term of 1 to 255 characters is required');
 const types=req.query.type ? [String(req.query.type).toLowerCase()] : ['delivery','collection'];
 if(types.some(t=>!['delivery','collection'].includes(t)))throw httpError(400,'Invalid booking type');
 const results=[];
 for(const type of types){
  const params=[exact?term:`%${term}%`],owner=scope(req,params),table=type==='delivery'?'jobs':'collections',address=type==='delivery'?'delivery_address':'collection_address';
  let where=exact?'do_number = $1':`(do_number ILIKE $1 OR recipient_name ILIKE $1 OR ${address} ILIKE $1)`;
  if(req.query.date){params.push(req.query.date);where+=` AND scheduled_date = $${params.length}`;}
  const rows=(await pool.query(`SELECT * FROM ${table} WHERE ${where}${owner} ORDER BY scheduled_date DESC,id DESC LIMIT 100`,params)).rows;
  results.push(...rows.map(r=>legacy(r,type)));
 }
 return results;
}
exports.searchJobByDoNumber=handler(async(req,res)=>{
 const rows=await search(req,true);if(!rows.length)throw httpError(404,'Booking not found in database');
 if(rows.length>1)throw httpError(409,'Multiple bookings match this reference. Specify delivery or collection.');
 return res.json({success:true,source:'database',data:rows[0]});
});
exports.searchJobs=handler(async(req,res)=>{const rows=await search(req,false);const limit=Math.min(100,Math.max(1,parseInt(req.query.limit)||50));return res.json({success:true,source:'database',data:rows.slice(0,limit),total:rows.length,meta:{limit,hasMore:rows.length>limit}});});
