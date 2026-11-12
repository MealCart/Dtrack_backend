const {pool,scope,find,handler,httpError}=require('../services/databaseBookingService');
exports.getCollections=handler(async(req,res)=>{
 const params=[];let where=scope(req,params);if(req.query.date){params.push(req.query.date);where+=` AND scheduled_date=$${params.length}`;}
 const rows=(await pool.query(`SELECT * FROM collections WHERE true${where} ORDER BY scheduled_date DESC,id DESC`,params)).rows;
 return res.json({success:true,source:'database',data:rows});
});
exports.getCollection=handler(async(req,res)=>{
 const params=[String(req.params.id)],where=scope(req,params);const rows=(await pool.query(`SELECT * FROM collections WHERE (id::text=$1 OR do_number=$1)${where} LIMIT 1`,params)).rows;
 if(!rows.length)throw httpError(404,'Collection not found in database');return res.json({success:true,source:'database',data:rows[0]});
});
exports.getCollectionByDoNumber=handler(async(req,res)=>res.json({success:true,source:'database',data:await find(req,req.query.do_number,'collection')}));
exports.updateCollectionStatus=handler(async(req,res)=>{
 if(!['pending','in_progress','completed','cancelled'].includes(req.body.status))throw httpError(400,'Invalid status');
 const row=await find(req,req.params.do_number,'collection');
 const params=[req.body.status,row.id],where=scope(req,params);
 // Administrative corrections remain supported; ownership is enforced in the write too.
 const result=await pool.query(`UPDATE collections SET status=$1,updated_at=CURRENT_TIMESTAMP WHERE id=$2${where} RETURNING *`,params);
 if(!result.rows.length)throw httpError(404,'Collection not found');return res.json({success:true,source:'database',do_number:row.do_number,status:req.body.status,data:result.rows[0]});
});
exports.deleteCollection=handler(async(req,res)=>{
 const row=await find(req,req.params.do_number,'collection');
 if(['completed','in_progress'].includes(row.status))throw httpError(409,'Active or completed collections cannot be deleted');
 const params=[row.id],where=scope(req,params);const result=await pool.query(`DELETE FROM collections WHERE id=$1${where} AND status NOT IN ('completed','in_progress') RETURNING id`,params);
 if(!result.rows.length)throw httpError(409,'Collection status changed. Refresh before trying again.');return res.json({success:true,source:'database',message:'Collection deleted'});
});
exports.getCollectionStats=handler(async(req,res)=>{
 const params=[],where=scope(req,params);const row=(await pool.query(`SELECT COUNT(*)::int AS total, COUNT(*) FILTER(WHERE status='pending')::int AS pending, COUNT(*) FILTER(WHERE status='in_progress')::int AS in_progress, COUNT(*) FILTER(WHERE status='completed')::int AS completed, COUNT(*) FILTER(WHERE status='cancelled')::int AS cancelled FROM collections WHERE true${where}`,params)).rows[0];return res.json({success:true,source:'database',stats:row});
});
exports.getRecentCollections=exports.getCollections;
exports.getTodayCollections=handler(async(req,res)=>{
 const params=[],where=scope(req,params);const rows=(await pool.query(`SELECT * FROM collections WHERE scheduled_date=(CURRENT_TIMESTAMP AT TIME ZONE 'Australia/Melbourne')::date${where} ORDER BY id DESC`,params)).rows;return res.json({success:true,source:'database',data:rows});
});
exports.getCollectionsByGroup=(req,res)=>res.status(410).json({success:false,error:'Legacy groups have been retired. Use your database collection list.'});
