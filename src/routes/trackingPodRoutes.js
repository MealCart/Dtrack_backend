const router=require('express').Router();
const {handler}=require('../services/databaseBookingService');
const {verifyTrackingPod,generateTrackingPod}=require('../services/trackingPodService');
router.post('/tracking-pod',handler(async(req,res)=>{
 const input=verifyTrackingPod(req.body,req.get('x-mealcart-pod-signature'),process.env.POD_MEDIA_SECRET||'');
 const pdf=await generateTrackingPod(input);
 res.setHeader('Content-Type','application/pdf');res.setHeader('Cache-Control','no-store');res.setHeader('X-Content-Type-Options','nosniff');
 res.setHeader('Content-Disposition',`attachment; filename="POD_${input.reference.replace(/[^A-Za-z0-9._-]/g,'_')}.pdf"`);
 return res.send(pdf);
}));
module.exports=router;
