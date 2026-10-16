'use strict';const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const html=fs.readFileSync('index.html','utf8'),js=fs.readFileSync('app-stable.js','utf8'),css=fs.readFileSync('styles.css','utf8');
test('Embedded Omni retains its real remote while hiding redundant chrome',()=>{
 assert.match(html,/omni-embedded/);assert.ok(css.includes('body.omni-embedded .topbar'));
 for(const id of ['stationFrame','prevChannel','nextChannel','wakeChannel','channelGrid'])assert.ok(html.includes('id="'+id+'"'));
 assert.ok(!css.includes('body.omni-embedded .surf-controls{display:none'));
 assert.ok(html.includes('app-stable.js?v=20261015-inline1'));
});
test('Embedded QuantaPhi maps the known station players to same origin',()=>{
 assert.ok(js.includes("location.origin!=='https://quantaphi.org'"));
 for(const path of ['/TV-Database/','/Chiller/','/shoplc/'])assert.ok(js.includes(path));
 assert.match(js,/frameLoadedGeneration/);
 assert.match(js,/v1\\/now\\/starquest/);
 assert.match(js,/youtube-nocookie\\.com\\/embed/);
 assert.match(js,/autoStartedChillerFor/);
 assert.match(js,/Station page opened in Omni TV/);
 assert.doesNotThrow(()=>new Function(js));
});
