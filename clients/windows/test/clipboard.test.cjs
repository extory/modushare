const {test}=require('node:test');
const assert=require('node:assert/strict');
let text='', image=Buffer.alloc(0), request;
const picture = buffer => ({isEmpty:()=>buffer.length===0,toPNG:()=>buffer});
const clipboard={readText:()=>text,readImage:()=>picture(image),availableFormats:()=>[],writeText:value=>{text=value;image=Buffer.alloc(0);},writeImage:value=>{image=value.toPNG();text='';}};
require.cache[require.resolve('electron')]={exports:{app:{getVersion:()=>'1.3.26'},clipboard,nativeImage:{createFromBuffer:picture},Notification:class{show(){}}}};
require.cache[require.resolve('axios')]={exports:{get:()=>new Promise(resolve=>{request=resolve})}};
const {WSClient}=require('../dist/electron/wsClient');
const {ClipboardPoller}=require('../dist/electron/clipboardPoller');
const settings={syncEnabled:true,serverUrl:'https://test.local',accessToken:'test'};
const store={get:key=>settings[key]};
test('automatic sharing keeps latest copy and prevents an old image overwriting it',async()=>{
 const ws=new WSClient(store);const poller=new ClipboardPoller(ws,store);ws.setPoller(poller);
 const pending=ws.writeClipboard({contentType:'image',imageUrl:'/uploads/old.png'},true);
 await ws.writeClipboard({contentType:'text',content:'latest'},true);
 request({data:Buffer.from('old image')});assert.equal(await pending,false);assert.equal(text,'latest');
});
test('local copy while an image downloads remains intact',async()=>{
 const ws=new WSClient(store);
 const pending=ws.writeClipboard({contentType:'image',imageUrl:'/uploads/old.png'},true);
 clipboard.writeText('new local copy');request({data:Buffer.from('image')});
 assert.equal(await pending,false);assert.equal(text,'new local copy');
});
test('received and manually selected content never echo back',async()=>{
 const ws=new WSClient(store);const poller=new ClipboardPoller(ws,store);ws.setPoller(poller);
 let sends=0;ws.isConnected=()=>true;ws.sendClipboardUpdate=()=>sends++;
 await ws.writeClipboard({contentType:'text',content:'received'});poller.poll();assert.equal(sends,0);
 await ws.writeClipboard({contentType:'image',imageData:Buffer.from('image').toString('base64')});poller.poll();assert.equal(sends,0);
 clipboard.writeText('local');poller.poll();assert.equal(sends,1);
});
test('automatic option off preserves clipboard; manual selection still works',async()=>{
 const ws=new WSClient(store);settings.syncEnabled=false;clipboard.writeText('keep');
 assert.equal(await ws.writeClipboard({contentType:'text',content:'auto'},true),false);assert.equal(text,'keep');
 assert.equal(await ws.writeClipboard({contentType:'text',content:'selected'}),true);assert.equal(text,'selected');settings.syncEnabled=true;
});
test('manual delivery notification never writes clipboard, wrong device is ignored',()=>{
 const ws=new WSClient(store);settings.deviceId='mine';let received=0;ws.on('directClipboard',()=>received++);
 ws.handleMessage({type:'CLIPBOARD_DELIVERY',payload:{targetDeviceId:'other'}});
 ws.handleMessage({type:'CLIPBOARD_DELIVERY',payload:{targetDeviceId:'mine'}});
 assert.equal(received,1);assert.equal(text,'selected');
});

test('copy while disconnected is delivered once after reconnect, only latest survives',()=>{
 const ws=new WSClient(store);const poller=new ClipboardPoller(ws,store);
 let connected=false, reconnects=0;const sent=[];
 ws.isConnected=()=>connected;ws.reconnectNow=()=>reconnects++;ws.sendClipboardUpdate=e=>sent.push(e);
 poller.adoptClipboard();clipboard.writeText('offline one');poller.poll();
 clipboard.writeText('offline two');poller.poll();assert.equal(sent.length,0);assert.ok(reconnects>0);
 connected=true;poller.poll();poller.poll();assert.deepEqual(sent,[{type:'text',text:'offline two'}]);
});
test('oversized image and server rejection surface errors instead of silent success',()=>{
 const ws=new WSClient(store);ws.connected=true;ws.ws={send:()=>assert.fail('must not send')};
 const errors=[];ws.on('syncError',error=>errors.push(error));
 ws.sendClipboardUpdate({type:'image',imageSize:6*1024*1024,imageBase64:'abc'});
 ws.handleMessage({type:'ERROR',payload:{code:'SYNC_DISABLED',message:'Sync is disabled'}});
 assert.equal(errors.length,2);
});
