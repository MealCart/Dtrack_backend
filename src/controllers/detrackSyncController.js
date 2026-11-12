const disabled = (req,res) => res.status(410).json({success:false,error:'External synchronization has been permanently retired. Mealcart uses its database only.'});
exports.previewSync = disabled;
exports.commitSync = disabled;
