// Read-only native macOS clipboard smoke test. Does not connect or replace clipboard.
const {app, clipboard, nativeImage, Tray, BrowserWindow}=require('electron');
const Module=require('module');
const assert=require('node:assert/strict');
app.setPath('userData',require('fs').mkdtempSync(require('path').join(require('os').tmpdir(),'modushare-receive-smoke-')));
app.whenReady().then(async()=>{
  const original=Module._load;
  let writes=0;
  Module._load=function(id,...args){
    if(id==='electron') return {app,clipboard:{readText:()=>clipboard.readText(),readImage:()=>clipboard.readImage(),writeText:()=>writes++,writeImage:()=>writes++}, nativeImage,Notification:class{show(){}}};
    return original.call(this,id,...args);
  };
  const {WSClient}=require('../dist/electron/wsClient');
  Module._load=original;
  const ws=new WSClient({get:key=>({syncEnabled:true,serverUrl:'https://example.test'})[key]});
  assert.equal(await ws.writeClipboard({contentType:'text',content:'ModuShare smoke'},true),true);
  assert.equal(writes,1);console.log('PASS: native macOS clipboard snapshot accepts incoming text without modifying the real clipboard');
  const icon=nativeImage.createEmpty();
  const tray=new Tray(icon);
  console.log('MAC_BALLOON_API',typeof tray.displayBalloon);
  tray.destroy();
  const win=new BrowserWindow({show:false,webPreferences:{preload:require('path').resolve(__dirname,'../dist/electron/sharingPreload.js'),sandbox:true,contextIsolation:true}});
  win.webContents.on('preload-error',(_e,_p,error)=>console.log('PRELOAD_ERROR',error.message));
  await win.loadURL('data:text/html,<html><body>Smoke</body></html>');
  assert.equal(await win.webContents.executeJavaScript('typeof window.sharing'),'object');
  console.log('PASS: sandboxed sharing preload exposes inbox API');
  win.destroy();app.quit();
}).catch(e=>{console.error(e);app.exit(1)});
