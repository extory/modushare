const {test}=require('node:test');const assert=require('node:assert/strict');const {EventEmitter}=require('node:events');
Object.defineProperty(process,'platform',{value:'darwin'});Object.defineProperty(process,'arch',{value:'arm64'});
let version='v1.3.26',notifications=0,opened=[],fail=false;
require.cache[require.resolve('axios')]={exports:{get:async()=>{if(fail)throw new Error('Network unavailable');return {data:{tag_name:version,assets:[{name:'ModuShare-1.3.27-arm64.dmg',browser_download_url:'https://github.com/extory/modushare/releases/download/v1.3.27/ModuShare-1.3.27-arm64.dmg'}]}}}}};
require.cache[require.resolve('electron-updater')]={exports:{autoUpdater:new EventEmitter()}};
require.cache[require.resolve('electron')]={exports:{app:{isPackaged:true,getVersion:()=> '1.3.26'},BrowserWindow:{getAllWindows:()=>[]},Notification:class extends EventEmitter{show(){notifications++}},shell:{openExternal:async url=>opened.push(url)}}};
const api=require('../dist/electron/updater');
test('Mac checks actual release, opens DMG only on request and reports failed checks',async()=>{
 const interval=global.setInterval;global.setInterval=()=>0;api.setupAutoUpdater({get:()=>true});global.setInterval=interval;
 await api.checkForUpdates();assert.equal(api.getUpdateState().status,'current');assert.equal(notifications,0);
 version='v1.3.27';await api.checkForUpdates();await api.checkForUpdates();
 assert.equal(api.getUpdateState().status,'available');assert.equal(notifications,1);assert.equal(opened.length,0);
 await api.downloadUpdate();assert.equal(opened.length,1);assert.ok(opened[0].endsWith('.dmg'));assert.equal(api.getUpdateState().status,'manual');
 fail=true;await api.checkForUpdates();assert.equal(api.getUpdateState().status,'error');
 await api.downloadUpdate();assert.equal(opened.length,1);
});
