(function omniControlNetworkRemote(){
  'use strict';
  if(window.__OMNI_CONTROL_REMOTE__)return;
  window.__OMNI_CONTROL_REMOTE__='2026-09-14.1';

  const ROOT='https://www-infinity4.github.io/';
  const RAW='https://raw.githubusercontent.com/www-infinity4/Control-Phi/main/channels.json';
  const PAGES=ROOT+'Control-Phi/channels.json';
  const STYLE_ID='omniControlNetworkStyle';
  const BUTTON_ID='omniControlButton';
  const PANEL_ID='omniControlPanel';

  const clean=value=>String(value??'').replace(/\s+/g,' ').trim();
  const esc=value=>clean(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const hrefFor=item=>item.url||ROOT+encodeURIComponent(clean(item.path)).replace(/%2F/gi,'/')+'/';

  function style(){
    if(document.getElementById(STYLE_ID))return;
    const node=document.createElement('style');node.id=STYLE_ID;
    node.textContent=`
      #${BUTTON_ID}{position:fixed;top:max(10px,env(safe-area-inset-top));right:max(10px,env(safe-area-inset-right));z-index:2147483645;min-width:108px;height:46px;padding:0 13px;border:1px solid rgba(255,255,255,.28);border-radius:14px;background:linear-gradient(145deg,#1ea85f,#096d3d);color:#fff;box-shadow:0 10px 30px rgba(0,0,0,.42);font:900 12px/1 system-ui;letter-spacing:.04em;text-transform:uppercase;display:flex;align-items:center;justify-content:center;gap:8px;cursor:pointer}
      #${BUTTON_ID} .oc-bars{font-size:20px;line-height:1}
      #${PANEL_ID}{position:fixed;inset:0 0 0 auto;z-index:2147483646;width:min(390px,92vw);padding:max(18px,env(safe-area-inset-top)) 15px max(24px,env(safe-area-inset-bottom));overflow:auto;background:linear-gradient(180deg,#07150f,#070a10 55%,#090811);color:#fff;box-shadow:-24px 0 80px rgba(0,0,0,.62);transform:translateX(105%);transition:transform .2s ease;font-family:Inter,system-ui,sans-serif}
      #${PANEL_ID}.open{transform:translateX(0)}
      #${PANEL_ID} .oc-head{display:flex;align-items:center;justify-content:space-between;gap:12px;margin-bottom:12px}#${PANEL_ID} .oc-head strong{font-size:1.22rem;letter-spacing:.03em}#${PANEL_ID} .oc-close{width:42px;height:42px;border:1px solid #ffffff35;border-radius:12px;background:#ffffff0d;color:#fff;font-size:24px;cursor:pointer}
      #${PANEL_ID} .oc-note{margin:0 0 12px;padding:11px 12px;border:1px solid #ffffff1c;border-radius:13px;background:#ffffff08;color:#cbd5e1;font-size:12px;line-height:1.45}
      #${PANEL_ID} .oc-tools{display:grid;grid-template-columns:1fr 1fr;gap:7px;margin-bottom:10px}#${PANEL_ID} .oc-tools a{min-height:42px;display:flex;align-items:center;justify-content:center;padding:8px;border:1px solid #ffffff20;border-radius:11px;background:#101826;color:#fff;text-decoration:none;font:850 12px/1.2 system-ui}
      #${PANEL_ID} .oc-search{box-sizing:border-box;width:100%;min-height:48px;margin:0 0 10px;padding:0 13px;border:1px solid #63d99566;border-radius:12px;background:#07101c;color:#fff;outline:0;font:700 14px system-ui}#${PANEL_ID} .oc-search::placeholder{color:#9fb3a7}
      #${PANEL_ID} .oc-tabs{display:flex;gap:6px;margin-bottom:10px}#${PANEL_ID} .oc-tabs button{flex:1;min-height:38px;border:1px solid #ffffff1f;border-radius:999px;background:#101826;color:#dbeafe;font:850 11px system-ui;cursor:pointer}#${PANEL_ID} .oc-tabs button[aria-pressed="true"]{background:linear-gradient(135deg,#0ea5e9,#7c3aed);border-color:transparent;color:#fff}
      #${PANEL_ID} .oc-links{display:grid;grid-template-columns:1fr 1fr;gap:7px}#${PANEL_ID} .oc-links a{min-height:46px;padding:10px;display:flex;align-items:center;border:1px solid #ffffff18;border-radius:11px;background:#ffffff09;color:#fff;text-decoration:none;font:780 13px/1.25 system-ui}#${PANEL_ID} .oc-links a[data-type="website"]{border-color:#8b5cf64d;background:#7c3aed1f}#${PANEL_ID} .oc-links a[hidden]{display:none!important}
      #${PANEL_ID} .oc-status{margin:11px 2px 0;color:#9fb3a7;font:650 11px/1.4 system-ui}
      details.channel-menu[data-omni-control="1"]>nav{max-height:72vh;overflow:auto}details.channel-menu[data-omni-control="1"]>nav a{display:block}
      @media(max-width:430px){#${BUTTON_ID}{top:max(8px,env(safe-area-inset-top));right:8px;min-width:102px;height:43px}#${PANEL_ID} .oc-links{grid-template-columns:1fr}}
      @media(prefers-reduced-motion:reduce){#${PANEL_ID}{transition:none}}
    `;
    document.head.appendChild(node);
  }

  function existingMenu(){return document.querySelector('details.channel-menu,details[data-channel-menu]')}

  function createShell(){
    style();
    let button=document.getElementById(BUTTON_ID),panel=document.getElementById(PANEL_ID);
    if(!button){button=document.createElement('button');button.id=BUTTON_ID;button.type='button';button.setAttribute('aria-label','Open Channels');button.setAttribute('aria-expanded','false');button.innerHTML='<span class="oc-bars" aria-hidden="true">☰</span><span>Channels</span>';document.body.appendChild(button)}
    if(!panel){panel=document.createElement('aside');panel.id=PANEL_ID;panel.setAttribute('aria-hidden','true');panel.innerHTML='<div class="oc-head"><strong>Omni Control</strong><button class="oc-close" type="button" aria-label="Close channels">×</button></div><p class="oc-note">One shared remote for TV channels, websites, News Phi and search. The destination list is read from the Control Phi registry.</p><nav class="oc-tools" aria-label="Infinity tools"><a href="'+ROOT+'Omni-TV/">Omni TV</a><a href="'+ROOT+'News-Phi/">News Phi</a><a href="'+ROOT+'Omni-Phi/">Omni Phi</a><a href="'+ROOT+'C13b0/phi/">Infinity Phi</a></nav><input class="oc-search" type="search" placeholder="Find a channel, site or genre" aria-label="Search channels"><div class="oc-tabs" role="group" aria-label="Destination type"><button type="button" data-type="all" aria-pressed="true">All</button><button type="button" data-type="tv" aria-pressed="false">TV</button><button type="button" data-type="website" aria-pressed="false">Websites</button></div><nav class="oc-links" aria-label="Channels"></nav><p class="oc-status">Loading network…</p>';document.body.appendChild(panel)}
    return{button,panel};
  }

  function wire(shell){
    const {button,panel}=shell;if(button.dataset.omniWired==='1')return;button.dataset.omniWired='1';
    const close=()=>{panel.classList.remove('open');panel.setAttribute('aria-hidden','true');button.setAttribute('aria-expanded','false')};
    const open=()=>{panel.classList.add('open');panel.setAttribute('aria-hidden','false');button.setAttribute('aria-expanded','true')};
    button.addEventListener('click',()=>panel.classList.contains('open')?close():open());panel.querySelector('.oc-close')?.addEventListener('click',close);panel.addEventListener('click',event=>{if(event.target.closest('a[href]'))close()});document.addEventListener('keydown',event=>{if(event.key==='Escape')close()});
    const search=panel.querySelector('.oc-search'),tabs=[...panel.querySelectorAll('.oc-tabs button')];let type='all';
    const filter=()=>{const q=clean(search?.value).toLowerCase();panel.querySelectorAll('.oc-links a').forEach(a=>{const typeOk=type==='all'||a.dataset.type===type;const textOk=!q||(a.dataset.search||'').includes(q);a.hidden=!(typeOk&&textOk)})};
    search?.addEventListener('input',filter);tabs.forEach(tab=>tab.addEventListener('click',()=>{type=tab.dataset.type||'all';tabs.forEach(x=>x.setAttribute('aria-pressed',String(x===tab)));filter()}));
  }

  function renderFloating(data){
    const shell=createShell();wire(shell);const links=shell.panel.querySelector('.oc-links'),status=shell.panel.querySelector('.oc-status');const channels=Array.isArray(data?.channels)?data.channels:[];
    links.innerHTML=channels.map(item=>{const genres=Array.isArray(item.genres)?item.genres.join(' '):'';const type=clean(item.type||'tv');const search=esc([item.name,item.path,type,genres].join(' ').toLowerCase());return '<a href="'+esc(hrefFor(item))+'" data-type="'+esc(type)+'" data-search="'+search+'">'+esc(item.name||item.path)+'</a>'}).join('');if(status)status.textContent=channels.length+' destinations · registry v'+(data?.version??'?');
  }

  function renderExisting(menu,data){
    const nav=menu.querySelector('nav')||menu.appendChild(document.createElement('nav'));const channels=Array.isArray(data?.channels)?data.channels:[];nav.innerHTML=channels.map(item=>'<a href="'+esc(hrefFor(item))+'" data-name="'+esc(clean(item.name).toLowerCase())+'">'+esc(item.name||item.path)+'</a>').join('');menu.dataset.omniControl='1';menu.dataset.controlPhi='connected';
  }

  async function getRegistry(){
    const sources=[`${PAGES}?omni=${Date.now()}`,`${RAW}?omni=${Date.now()}`];
    for(const source of sources){try{const r=await fetch(source,{cache:'no-store'});if(!r.ok)continue;const data=await r.json();if(Array.isArray(data?.channels)&&data.channels.length)return data}catch(_){}}
    throw new Error('registry unavailable');
  }

  async function refresh(){
    try{const data=await getRegistry();const menu=existingMenu();if(menu)renderExisting(menu,data);else renderFloating(data);window.dispatchEvent(new CustomEvent('omnicontrol:ready',{detail:{count:data.channels.length,version:data.version??null}}))}
    catch(_){const menu=existingMenu();if(!menu){const shell=createShell();wire(shell);const status=shell.panel.querySelector('.oc-status');if(status)status.textContent='Registry temporarily unavailable. Core Infinity tools remain available.'}}
  }

  function mount(){if(!document.body)return;refresh();window.addEventListener('focus',refresh);document.addEventListener('visibilitychange',()=>{if(!document.hidden)refresh()});setInterval(refresh,60000)}
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',mount,{once:true});else mount();
})();
