const Collection = require('../models/Collection');
Object.assign(exports, require('./databaseCollectionController'));
exports.createCollection = async (req, res) => {
  try {
    const collectionData = req.body;
    try { require('../utils/australianPhone').normalizePhoneFields(collectionData); } catch (error) { return res.status(400).json({ error: error.message }); }
    const customer = await require('../services/bookingCustomerService').resolveCustomer(req);
    for (const field of ['do_number', 'collection_address', 'recipient_name']) {
      if (!collectionData[field]) return res.status(400).json({ error: `Missing required field: ${field}` });
    }
    if (await Collection.checkDoNumberExists(collectionData.do_number)) return res.status(409).json({ error: 'DO number already exists' });
    
    const createPayload = {
        do_number: collectionData.do_number,
        recipient_name: collectionData.recipient_name,
        recipient_company: collectionData.recipient_company || '',
        collection_address: collectionData.collection_address,
        postcode: collectionData.postcode || '',
        city: collectionData.city || '',
        state: collectionData.state || '',
        country: collectionData.country || 'Australia',
        recipient_email: collectionData.notify_email ?? collectionData.customer_email ?? collectionData.recipient_email ?? null,
        recipient_phone: collectionData.recipient_phone || '',
        special_instructions: collectionData.special_instructions || '',
        scheduled_date: collectionData.scheduled_date || null,
        time_window: collectionData.time_window || '07:00-18:00',
        collection_type: require('../utils/bookingType')(collectionData.collection_type, 'Home Collection'),
        group_id: null,
        group_name: null,
        status: 'pending',
        detrack_id: null,
        tracking_link: '',
        verification_code: '',
        source: 'customer',
        user_id: customer.id
    };
    const saved = await Collection.create(createPayload);
    return res.json({ success: true, collection: { id: saved.id, do_number: collectionData.do_number, customer_id: saved.user_id, status: 'pending', recipient_name: collectionData.recipient_name, collection_type: createPayload.collection_type } });
  } catch (error) {
    return res.status(error.status || (error.code === '23505' ? 409 : 500)).json({ error: error.status ? error.message : 'Failed to create booking', details: error.message, code: error.code });
  }
};

// ===== UPLOAD COLLECTION MANIFEST =====

exports.uploadCollectionManifest = require('../services/bulkBookingService').upload(true);

// ===== FETCH COLLECTIONS FROM DATABASE =====

exports.bulkCreateCollections = async (req,res) => {
 const input=req.body.collections;
 if(!Array.isArray(input)||!input.length||input.length>1000)return res.status(400).json({success:false,error:'Provide 1 to 1000 collections'});
 const results=[],errors=[];
 for(const item of input){
  let code=200,body;
  const response={status(n){code=n;return this;},json(value){body=value;return this;}};
  await exports.createCollection({...req,body:{...item,customer_id:item.customer_id??req.body.customer_id}},response);
  if(code>=400||!body?.success)errors.push({do_number:item.do_number,error:body?.error||'Failed to create collection'});
  else results.push({...body.collection,status:'success'});
 }
 return res.json({success:true,source:'database',results,errors,total:input.length,successful:results.length,failed:errors.length});
};
