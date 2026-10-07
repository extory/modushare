// Run after compiling server: node --test server/test/directClipboard.test.cjs
// Uses Node's SQLite for an isolated DB; no production files or accounts are touched.
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { DatabaseSync } = require('node:sqlite');
const fs = require('node:fs');
const path = require('node:path');
const express = require('express');
const sql = new DatabaseSync(':memory:');
sql.exec('PRAGMA foreign_keys=ON; CREATE TABLE users(id TEXT PRIMARY KEY,email TEXT); CREATE TABLE share_pairs(user_id TEXT,target_id TEXT);');
sql.exec(fs.readFileSync(path.join(__dirname,'../src/db/migrations/010_direct_clipboard.sql'),'utf8'));
sql.exec(`INSERT INTO users VALUES ('a','a@test'),('b','b@test'),('c','c@test'); INSERT INTO share_pairs VALUES ('a','b');
 INSERT INTO clipboard_devices VALUES ('a','a1','Laptop'),('a','a2','Desktop'),('b','b1','Partner'),('c','c1','Stranger');`);
function stub(modulePath, exports) { require.cache[require.resolve(modulePath)] = { exports }; }
stub('../dist/db', { __esModule:true, default: { prepare: q => sql.prepare(q), transaction: fn => () => {
 sql.exec('BEGIN'); try { fn(); sql.exec('COMMIT'); } catch(e) { sql.exec('ROLLBACK'); throw e; }
} } });
stub('../dist/middleware/auth', { requireAuth: (req,res,next) => { req.user={userId:req.headers['x-user'] || 'a'}; next(); } });
const deliveries=[];
stub('../dist/websocket/userSessions', { userSessions: { broadcastToUser: (userId,message) => deliveries.push({userId,message}) } });
const app=express(); app.use(express.json()); app.use(require('../dist/routes/directClipboard').default);
let server, base;
before(async () => { server=app.listen(0,'127.0.0.1'); await new Promise(r=>server.once('listening',r)); base=`http://127.0.0.1:${server.address().port}`; });
after(() => {server.close();sql.close();});
const send = (targets,content='hello') => fetch(base+'/send',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({targets,payload:{contentType:'text',content}})});
test('targets contain own and paired devices, exclude unrelated users',async()=>{
 const {devices}=await (await fetch(base+'/targets')).json(); assert.deepEqual(devices.map(d=>d.deviceId).sort(),['a1','a2','b1']);
});
test('unauthorized target rejects whole send before storing or broadcasting',async()=>{
 const r=await send([{userId:'b',deviceId:'b1'},{userId:'c',deviceId:'c1'}]);assert.equal(r.status,403);
 assert.equal(sql.prepare('SELECT COUNT(*) AS n FROM clipboard_deliveries').get().n,0);assert.equal(deliveries.length,0);
});
test('multiple targets deduplicate and notify only designated recipients',async()=>{
 const r=await send([{userId:'a',deviceId:'a2'},{userId:'b',deviceId:'b1'},{userId:'b',deviceId:'b1'}]);assert.equal((await r.json()).count,2);
 assert.deepEqual(deliveries.map(d=>[d.userId,d.message.payload.targetDeviceId]),[['a','a2'],['b','b1']]);
});
test('inbox retains latest ten with seconds-capable timestamps and account isolation',async()=>{
 for(let i=0;i<12;i++) assert.equal((await send([{userId:'b',deviceId:'b1'}],`copy ${i}`)).status,200);
 const {items}=await (await fetch(base+'/inbox/b1',{headers:{'x-user':'b'}})).json();
 assert.equal(items.length,10);assert.equal(items[0].payload.content,'copy 11');assert.equal(items[9].payload.content,'copy 2');
 assert.ok(Number.isInteger(items[0].createdAt));assert.equal(items[0].senderEmail,'a@test');
 assert.equal((await (await fetch(base+'/inbox/b1')).json()).items.length,0);
 assert.equal(sql.prepare("SELECT COUNT(*) AS n FROM clipboard_deliveries WHERE user_id='b'").get().n,10);
});
test('invalid payload and unknown device do not store',async()=>{
 assert.equal((await send([{userId:'b',deviceId:'missing'}])).status,403);
 assert.equal((await send([{userId:'b',deviceId:'b1'}],'')).status,400);
 assert.equal((await send([])).status,400);
});
