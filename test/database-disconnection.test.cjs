const {test}=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs');const vm=require('node:vm');const path=require('node:path');
const ROOT=path.resolve(__dirname,'../src');
function harness(query,extra={}){
 const calls=[];const client={query:async(sql,params)=>{calls.push({sql,params});return query(sql,params);},release(){calls.push({sql:'RELEASE'});}};const pool={query:client.query,connect:async()=>client};const cache={};
 function load(file){file=path.resolve(file);if(cache[file])return cache[file];const module={exports:{}};cache[file]=module.exports;
 const localRequire=n=>{
 if(extra.modules && n in extra.modules)return extra.modules[n];
 if(n.includes('config/database'))return{pool};
 if(n==='pdf-lib')return require('pdf-lib');
 if(n.includes('australianPhone'))return{normalizePhoneFields(){}};
 if(n.includes('utils/helpers'))return{generateBarcodes:(ref,count)=>Array.from({length:count},(_,i)=>`${ref}-${i+1}`)};
 if(n.includes('bookingType'))return require('../src/utils/bookingType');
 if(n.startsWith('.'))return load(path.resolve(path.dirname(file),n+'.js'));
 throw Error('Unexpected dependency '+n);
 };
 new Function('require','module','exports','console','process','fetch',fs.readFileSync(file,'utf8'))(localRequire,module,module.exports,{error(){},log(){},warn(){}},{env:extra.env||{}},extra.fetch);
 cache[file]=module.exports;return module.exports;}
 return{load:n=>load(path.join(ROOT,n)),calls};
}
const req=(data={})=>({user:{id:23,role:'customer',email:'customer@example.com'},query:{},params:{},body:{},...data});
const res=()=>({code:200,headers:{},status(code){this.code=code;return this;},json(body){this.body=body;return this;},setHeader(k,v){this.headers[k]=v;},send(body){this.body=body;return this;}});
test('missing job scanning returns 404 and never writes or imports',async()=>{const h=harness(async()=>({rows:[]})),r=res();await h.load('controllers/databaseJobController.js').scanBox(req({body:{do_number:'missing',barcode:'missing-1'}}),r);assert.equal(r.code,404);assert.ok(h.calls.some(c=>c.sql==='ROLLBACK'));assert.ok(!h.calls.some(c=>/^(UPDATE|INSERT)/.test(c.sql)));assert.match(h.calls.find(c=>/SELECT/.test(c.sql)).sql,/user_id = \$2/);});
test('warehouse scans lock existing row, preserve evidence and reject foreign or duplicate codes',async()=>{const job={id:1,do_number:'DO1',user_id:23,barcodes:['DO1-1','DO1-2'],scans:[{barcode:'DO1-1',timestamp:'original'}]};const h=harness(async sql=>({rows:sql.startsWith('SELECT')?[job]:[]})),r=res();await h.load('controllers/databaseJobController.js').bulkScan(req({body:{do_number:'DO1',barcodes:['DO1-1','foreign','DO1-2']}}),r);assert.equal(r.code,200);assert.equal(r.body.data.totalScanned,2);assert.equal(r.body.data.errors.length,2);assert.match(h.calls.find(c=>/SELECT/.test(c.sql)).sql,/FOR UPDATE/);const write=h.calls.find(c=>c.sql.startsWith('UPDATE'));assert.equal(JSON.parse(write.params[0])[0].timestamp,'original');assert.equal(JSON.parse(write.params[0]).length,2);assert.ok(h.calls.some(c=>c.sql==='COMMIT'));});
test('completed job cannot be edited or cancelled',async()=>{for(const method of ['updateJob','cancelJob']){const h=harness(async()=>({rows:[{id:1,status:'completed',do_number:'DO1'}]})),r=res();await h.load('controllers/databaseJobController.js')[method](req({params:{doNumber:'DO1'},body:{address:'new'}}),r);assert.equal(r.code,409);assert.ok(!h.calls.some(c=>c.sql.startsWith('UPDATE')));}});
test('job edit updates only supplied columns, keeps barcode and completion columns intact',async()=>{const row={id:1,status:'pending',do_number:'DO1',boxes:2,scans:[],barcodes:['printed-A','printed-B']};const h=harness(async sql=>({rows:[row]})),r=res();await h.load('controllers/databaseJobController.js').updateJob(req({params:{doNumber:'DO1'},body:{instructions:'Leave at reception',user_id:999,status:'completed'}}),r);assert.equal(r.code,200);const write=h.calls.find(c=>c.sql.startsWith('UPDATE'));assert.match(write.sql,/special_instructions=\$1/);assert.doesNotMatch(write.sql,/barcodes|completion_|user_id=|status=/);assert.equal(write.params[0],'Leave at reception');});
test('cancellation updates owned database row with concurrent status guard',async()=>{const h=harness(async()=>({rows:[{id:1,status:'pending',do_number:'DO1'}]})),r=res();await h.load('controllers/databaseJobController.js').cancelJob(req({params:{doNumber:'DO1'}}),r);assert.equal(r.code,200);assert.match(h.calls[1].sql,/user_id = \$2/);assert.match(h.calls[1].sql,/NOT IN/);});
test('database search scopes both tables and returns database provenance',async()=>{const h=harness(async sql=>({rows:[{id:1,do_number:sql.includes('FROM jobs')?'D1':'C1',recipient_name:'Jo'}]})),r=res();await h.load('controllers/searchController.js').searchJobs(req({query:{q:'Jo'}}),r);assert.equal(r.body.source,'database');assert.equal(r.body.data.length,2);for(const c of h.calls){assert.match(c.sql,/user_id = \$2/);assert.doesNotMatch(c.sql,/group_id/);}assert.equal(r.body.data[0]._source,'database');});
test('database search missing exact record returns 404, with no fallback',async()=>{const h=harness(async()=>({rows:[]})),r=res();await h.load('controllers/searchController.js').searchJobByDoNumber(req({query:{do_number:'absent'}}),r);assert.equal(r.code,404);assert.equal(h.calls.length,2);});
test('retired service and sync paths fail closed without network dependencies',async()=>{const h=harness(async()=>{throw Error('No DB call expected');});await assert.rejects(()=>h.load('services/detrackService.js').getJobs(),/retired/);const c=h.load('controllers/detrackSyncController.js');for(const method of ['previewSync','commitSync']){const r=res();c[method](req(),r);assert.equal(r.code,410);}});
test('POD rejects external provider URLs, redirects and unapproved hosts',async()=>{const h=harness(async()=>({rows:[]}));const pod=h.load('services/databasePodService.js');for(const url of ['https://app.detrack.com/a.jpg','http://mealcart-router-backend.onrender.com/a.jpg','https://evil.example/a.jpg','file:///etc/passwd'])assert.throws(()=>pod.mediaUrl(url));assert.match(pod.mediaUrl('/api/proof-files/123'),/^https:\/\/mealcart-router-backend.onrender.com/);});
test('POD uses only database completion photos and signature, creates one evidence page per image',async()=>{
 const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aDCsAAAAASUVORK5CYII=','base64');let downloads=[];
 const h=harness(async()=>({rows:[]}),{fetch:async(url,options)=>{downloads.push({url,options});return{ok:true,headers:{get:()=>String(png.length)},body:(async function*(){yield png;})()};}});
 const pod=h.load('services/databasePodService.js'),bytes=await pod.generate({do_number:'DO#1',status:'completed',completion_driver_id:'DRV1',completion_recorded_at:'2026-11-12T10:00:00Z',completion_photos:['/photo1.png',{url:'/photo2.png'}],completion_signature_url:'/signature.png',photo_1_file_url:'https://app.detrack.com/ignored.jpg'});
 const pdf=await require('pdf-lib').PDFDocument.load(bytes);assert.equal(pdf.getPageCount(),4);assert.equal(downloads.length,3);for(const d of downloads){assert.equal(d.options.redirect,'error');assert.ok(!d.url.includes('detrack'));}
 await assert.rejects(()=>pod.generate({status:'pending'}),/only after delivery completion/);
});
test('POD fails visibly when completion evidence cannot be downloaded',async()=>{const h=harness(async()=>({rows:[]}),{fetch:async()=>({ok:false})});await assert.rejects(()=>h.load('services/databasePodService.js').generate({status:'completed',completion_photos:['/missing.png']}),/could not be downloaded/);});
test('backend contains no external provider endpoint or credentials lookup',()=>{
 function walk(dir){for(const file of fs.readdirSync(dir,{withFileTypes:true})){const p=path.join(dir,file.name);if(file.isDirectory())walk(p);else if(p.endsWith('.js')){const source=fs.readFileSync(p,'utf8');assert.doesNotMatch(source,/app\.detrack\.com|process\.env\.DETRACK_|axios\.(get|post|put|delete)/,p);}}}walk(ROOT);
});

test('label generation reads stored barcodes and metadata, never overwrites printed codes',async()=>{
 let printed,record;const row={id:4,user_id:23,do_number:'DO1',recipient_name:'Stored recipient',delivery_address:'Stored address',customer_company:'Stored company',barcodes:['ALREADY-PRINTED'],boxes:1};
 const modules={
  fs:{mkdirSync(){},writeFileSync(){}},path:require('node:path'),crypto:require('node:crypto'),
  '../models/Job':{updateLabelUrl:async()=>{}},'../models/Label':{create:async data=>{record=data;}},
  '../services/labelService':{generateShippingLabels:async(...args)=>{printed=args;return{save:async()=>Buffer.from('pdf')};}},
  '../config/constants':{LABELS_DIR:'/tmp'},
 };
 const h=harness(async()=>({rows:[row]}),{modules}),r=res();await h.load('controllers/labelController.js').generateLabels(req({body:{doNumber:'DO1',barcodes:['SPOOFED'],customerName:'Spoofed'}}),r);
 assert.equal(r.code,200);assert.equal(printed[1][0],'ALREADY-PRINTED');assert.equal(printed[2],'Stored recipient');assert.equal(record.userId,23);assert.ok(!h.calls.some(c=>c.sql.startsWith('UPDATE')));
});
test('missing label job never creates a booking or prints request-provided labels',async()=>{
 let printed=false;const modules={fs:{},path:require('node:path'),'../models/Job':{},'../models/Label':{},'../services/labelService':{generateShippingLabels:async()=>{printed=true;}},'../config/constants':{LABELS_DIR:'/tmp'}};
 const h=harness(async()=>({rows:[]}),{modules}),r=res();await h.load('controllers/labelController.js').generateLabels(req({body:{doNumber:'MISSING',barcodes:['MISSING-1']}}),r);assert.equal(r.code,404);assert.equal(printed,false);assert.ok(h.calls.every(c=>c.sql.startsWith('SELECT')));
});
test('staff barcode lookup searches stored labels and returns original barcode and DO',async()=>{const h=harness(async()=>({rows:[{id:5,do_number:'DO-02340102-043',matched_barcode:'DO-02340102-043-1',barcodes:['DO-02340102-043-1']}]})),r=res();await h.load('controllers/databaseJobController.js').getJobByBarcode(req({query:{barcode:' #DO-02340102-043-1\r\n'}}),r);assert.equal(r.body.data.do_number,'DO-02340102-043');assert.equal(r.body.matched_barcode,'DO-02340102-043-1');assert.match(h.calls[0].sql,/jsonb_array_elements_text/);assert.equal(h.calls[0].params[0],'#DO-02340102-043-1');assert.match(h.calls[0].sql,/j.user_id = \$2/);});
test('unknown staff barcode does not fall back to guessed reference or external provider',async()=>{const h=harness(async()=>({rows:[]})),r=res();await h.load('controllers/databaseJobController.js').getJobByBarcode(req({user:{id:3,role:'staff'},query:{barcode:'missing-1'}}),r);assert.equal(r.code,404);assert.equal(h.calls.length,1);assert.doesNotMatch(h.calls[0].sql,/user_id/);});
test('ambiguous barcode refuses to select or mutate an arbitrary booking',async()=>{const h=harness(async()=>({rows:[{id:1},{id:2}]})),r=res();await h.load('controllers/databaseJobController.js').getJobByBarcode(req({query:{barcode:'D1-1'}}),r);assert.equal(r.code,409);assert.equal(h.calls.length,1);});
