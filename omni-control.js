(function omniControlNetworkRemote(){
  'use strict';
  if(window.__OMNI_CONTROL_REMOTE__)return;
  window.__OMNI_CONTROL_REMOTE__='2026-09-14.3';

  const ROOT='https://www-infinity4.github.io/';
  const RAW='https://raw.githubusercontent.com/www-infinity4/Control-Phi/main/channels.json';
  const PAGES=ROOT+'Control-Phi/channels.json';
  const STYLE_ID='omniControlNetworkStyle';
  const BUTTON_ID='omniControlButton';
  const PANEL_ID='omniControlPanel';
  const WALLET_GUEST_KEY='starquest_guest_profile_v1';
  const WALLET_SESSION_KEY='starquest_session';
  const WALLET_USERS_KEY='starquest_users';

  const clean=value=>String(value??'').replace(/\s+/g,' ').trim();
  const esc=value=>clean(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const hrefFor=item=>item.url||ROOT+encodeURIComponent(clean(item.path)).replace(/%2F/gi,'/')+'/';
  const read=(key,fallback)=>{try{return JSON.parse(localStorage.getItem(key))??fallback}catch{return fallback}};
  const setText=(el,value)=>{if(!el)return;const next=String(value);if(el.textContent!==next)el.textContent=next};

  function walletState(){
    const session=read(WALLET_SESSION_KEY,null);
    const users=read(WALLET_USERS_KEY,{});
    const profile=session&&session.key&&users&&users[session.key]?users[session.key]:read(WALLET_GUEST_KEY,{});
    const settled=Math.max(0,Number(profile?.tokens)||0);
    const progress=Math.max(0,Number(profile?.pendingShareCredits)||0);
    const balance=Number((settled+(progress/10)).toFixed(1));
    return{balance,settled,progress,shareCount:Math.max(0,Number(profile?.shareCount)||0),username:clean(profile?.username||'Guest')||'Guest'};
  }

  function syncWalletUI(){
    const state=walletState();
    const balanceText=state.balance.toFixed(1);
    const balanceStar=`${balanceText} ⭐`;
    const progressText=`${state.progress}/10`;
    document.querySelectorAll('[data-omni-wallet-balance]').forEach(el=>setText(el,balanceStar));
    document.querySelectorAll('[data-omni-wallet-progress]').forEach(el=>setText(el,progressText));
    document.querySelectorAll('[data-control-phi-wallet-balance]').forEach(el=>setText(el,balanceText));
    document.querySelectorAll('[data-control-phi-wallet-menu-balance]').forEach(el=>setText(el,balanceStar));
    document.querySelectorAll('[data-control-phi-wallet-progress],[data-control-phi-wallet-menu-progress]').forEach(el=>setText(el,progressText));
    const shared=document.getElementById('controlPhiWalletButton');
    if(shared){
      setText(shared.querySelector('strong'),balanceText);
      setText(shared.querySelector('small'),progressText);
    }
    return state;
  }

  function openWallet(){
    syncWalletUI();
    const shared=document.getElementById('controlPhiWalletButton');
    if(shared){shared.click();setTimeout(syncWalletUI,0);return}
    const status=document.querySelector(`#${PANEL_ID} .oc-status`);
    setText(status,'StarCoin wallet is loading. Your confirmed share credits are still saved.');
  }

  function installWalletSync(){
    if(window.__OMNI_WALLET_SYNC__)return;
    window.__OMNI_WALLET_SYNC__=true;
    const refresh=()=>setTimeout(syncWalletUI,0);
    window.addEventListener('controlphi:wallet-change',refresh);
    window.addEventListener('starquest:share-progress',refresh);
    window.addEventListener('storage',refresh);
    document.addEventListener('click',event=>{if(event.target?.closest?.('#controlPhiWalletButton,#controlPhiWalletMenuButton,#omniControlWallet'))refresh()});
    syncWalletUI();
  }

  function style(){
    if(document.getElementById(STYLE_ID))return;
    const node=document.createElement('style');node.id=STYLE_ID;
    node.textContent=`
      details.channel-menu[data-omni-legacy-menu],details[data-channel-menu][data-omni-legacy-menu]{display:none!important}
      #${BUTTON_ID}{position:fixed;top:max(10px,env(safe-area-inset-top));right:max(10px,env(safe-area-inset-right));z-index:2147483645;min-width:108px;height:46px;padding:0 13px;border:1px solid rgba(255,255,255,.28);border-radius:14px;background:linear-gradient(145deg,#1ea85f,#096d3d);color:#fff;box-shadow:0 10px 30px rgba(0,0,0,.42);font:900 12px/1 system-ui;letter-spacing:.04em;text-transform:uppercase;display:flex;align-items:center;justify-content:center;gap:8px;cursor:pointer}
      #${BUTTON_ID} .oc-bars{font-size:20px;line-height:1}
      #${PANEL_ID}{position:fixed;inset:0 0 0 auto;z-index:2147483646;width:min(390px,92vw);padding:max(18px,env(safe-area-inset-top)) 15px max(24px,env(safe-area-inset-bottom));overflow:auto;background:linear-gradient(180deg,#07150f,#070a10 55%,#090811);color:#fff;box-shadow:-24px 0 80px rgba(0,0,0,.62);transform:translateX(105%);transition:transform .2s ease;font-family:Inter,system-ui,sans-serif}
      #${PANEL_ID}.open{transform:translateX(0)}
      #${PANEL_ID} .oc-head{display:flex;align-items:center;justify-content:space-between;gap:12px;margin-bottom:12px}#${PANEL_ID} .oc-head strong{font-size:1.22rem;letter-spacing:.03em}#${PANEL_ID} .oc-close{width:42px;height:42px;border:1px solid #ffffff35;border-radius:12px;background:#ffffff0d;color:#fff;font-size:24px;cursor:pointer}
      #${PANEL_ID} .oc-note{margin:0 0 10px;padding:11px 12px;border:1px solid #ffffff1c;border-radius:13px;background:#ffffff08;color:#cbd5e1;font-size:12px;line-height:1.45}
      #${PANEL_ID} .oc-wallet{box-sizing:border-box;width:100%;min-height:54px;margin:0 0 10px;padding:9px 11px;border:1px solid rgba(255,221,89,.42);border-radius:13px;background:linear-gradient(135deg,rgba(122,83,12,.42),rgba(18,15,9,.94));color:#fff;display:grid;grid-template-columns:1fr auto;grid-template-rows:auto auto;gap:2px 10px;text-align:left;cursor:pointer;font-family:inherit}#${PANEL_ID} .oc-wallet span{font-weight:900}#${PANEL_ID} .oc-wallet strong{grid-row:1/3;grid-column:2;align-self:center;font-size:16px}#${PANEL_ID} .oc-wallet small{color:#d8c985;font-weight:750}
      #${PANEL_ID} .oc-tools{display:grid;grid-template-columns:1fr 1fr;gap:7px;margin-bottom:10px}#${PANEL_ID} .oc-tools a{min-height:42px;display:flex;align-items:center;justify-content:center;padding:8px;border:1px solid #ffffff20;border-radius:11px;background:#101826;color:#fff;text-decoration:none;font:850 12px/1.2 system-ui}
      #${PANEL_ID} .oc-search{box-sizing:border-box;width:100%;min-height:48px;margin:0 0 10px;padding:0 13px;border:1px solid #63d99566;border-radius:12px;background:#07101c;color:#fff;outline:0;font:700 14px system-ui}#${PANEL_ID} .oc-search::placeholder{color:#9fb3a7}
      #${PANEL_ID} .oc-tabs{display:flex;gap:6px;margin-bottom:10px}#${PANEL_ID} .oc-tabs button{flex:1;min-height:38px;border:1px solid #ffffff1f;border-radius:999px;background:#101826;color:#dbeafe;font:850 11px system-ui;cursor:pointer}#${PANEL_ID} .oc-tabs button[aria-pressed="true"]{background:linear-gradient(135deg,#0ea5e9,#7c3aed);border-color:transparent;color:#fff}
      #${PANEL_ID} .oc-links{display:grid;grid-template-columns:1fr 1fr;gap:7px}#${PANEL_ID} .oc-links a{min-height:46px;padding:10px;display:flex;align-items:center;border:1px solid #ffffff18;border-radius:11px;background:#ffffff09;color:#fff;text-decoration:none;font:780 13px/1.25 system-ui}#${PANEL_ID} .oc-links a[data-type="website"]{border-color:#8b5cf64d;background:#7c3aed1f}#${PANEL_ID} .oc-links a[hidden]{display:none!important}
      #${PANEL_ID} .oc-status{margin:11px 2px 0;color:#9fb3a7;font:650 11px/1.4 system-ui}
      @media(max-width:430px){#${BUTTON_ID}{top:max(8px,env(safe-area-inset-top));right:8px;min-width:102px;height:43px}#${PANEL_ID} .oc-links{grid-template-columns:1fr}}
      @media(prefers-reduced-motion:reduce){#${PANEL_ID}{transition:none}}
    `;
    document.head.appendChild(node);
  }

  function hideLegacyMenus(){
    document.querySelectorAll('details.channel-menu,details[data-channel-menu]').forEach(menu=>{
      if(menu.closest(`#${PANEL_ID}`))return;
      menu.dataset.omniLegacyMenu='1';
      menu.removeAttribute('open');
      menu.setAttribute('aria-hidden','true');
    });
  }

  function createShell(){
    style();hideLegacyMenus();
    let button=document.getElementById(BUTTON_ID),panel=document.getElementById(PANEL_ID);
    if(!button){button=document.createElement('button');button.id=BUTTON_ID;button.type='button';button.setAttribute('aria-label','Open Channels');button.setAttribute('aria-expanded','false');button.innerHTML='<span class="oc-bars" aria-hidden="true">☰</span><span>Channels</span>';document.body.appendChild(button)}
    if(!panel){
      panel=document.createElement('aside');panel.id=PANEL_ID;panel.setAttribute('aria-hidden','true');
      panel.innerHTML='<div class="oc-head"><strong>Omni Control</strong><button class="oc-close" type="button" aria-label="Close channels">×</button></div><p class="oc-note">One shared remote for TV channels, websites, News Phi and search. Every page reads the same Control Phi destination registry.</p><button id="omniControlWallet" class="oc-wallet" type="button"><span>StarCoin Wallet</span><strong data-omni-wallet-balance>0.0 ⭐</strong><small>Confirmed share credit <b data-omni-wallet-progress>0/10</b></small></button><nav class="oc-tools" aria-label="Infinity tools"><a href="'+ROOT+'Omni-TV/">Omni TV</a><a href="'+ROOT+'News-Phi/">News Phi</a><a href="'+ROOT+'Omni-Phi/">Omni Phi</a><a href="'+ROOT+'C13b0/phi/">Infinity Phi</a></nav><input class="oc-search" type="search" placeholder="Find a channel, site or genre" aria-label="Search channels"><div class="oc-tabs" role="group" aria-label="Destination type"><button type="button" data-type="all" aria-pressed="true">All</button><button type="button" data-type="tv" aria-pressed="false">TV</button><button type="button" data-type="website" aria-pressed="false">Websites</button></div><nav class="oc-links" aria-label="Channels"></nav><p class="oc-status">Loading network…</p>';
      document.body.appendChild(panel);
      panel.querySelector('#omniControlWallet')?.addEventListener('click',openWallet);
    }
    syncWalletUI();
    return{button,panel};
  }

  function wire(shell){
    const {button,panel}=shell;if(button.dataset.omniWired==='1')return;button.dataset.omniWired='1';
    const close=()=>{panel.classList.remove('open');panel.setAttribute('aria-hidden','true');button.setAttribute('aria-expanded','false')};
    const open=()=>{hideLegacyMenus();syncWalletUI();panel.classList.add('open');panel.setAttribute('aria-hidden','false');button.setAttribute('aria-expanded','true')};
    button.addEventListener('click',()=>panel.classList.contains('open')?close():open());panel.querySelector('.oc-close')?.addEventListener('click',close);panel.addEventListener('click',event=>{if(event.target.closest('a[href]'))close()});document.addEventListener('keydown',event=>{if(event.key==='Escape')close()});
    const search=panel.querySelector('.oc-search'),tabs=[...panel.querySelectorAll('.oc-tabs button')];let type='all';
    const filter=()=>{const q=clean(search?.value).toLowerCase();panel.querySelectorAll('.oc-links a').forEach(a=>{const typeOk=type==='all'||a.dataset.type===type;const textOk=!q||(a.dataset.search||'').includes(q);a.hidden=!(typeOk&&textOk)})};
    search?.addEventListener('input',filter);tabs.forEach(tab=>tab.addEventListener('click',()=>{type=tab.dataset.type||'all';tabs.forEach(x=>x.setAttribute('aria-pressed',String(x===tab)));filter()}));
  }

  function render(data){
    const shell=createShell();wire(shell);const links=shell.panel.querySelector('.oc-links'),status=shell.panel.querySelector('.oc-status');const channels=Array.isArray(data?.channels)?data.channels:[];
    links.innerHTML=channels.map(item=>{const genres=Array.isArray(item.genres)?item.genres.join(' '):'';const type=clean(item.type||'tv');const search=esc([item.name,item.path,type,genres].join(' ').toLowerCase());return '<a href="'+esc(hrefFor(item))+'" data-type="'+esc(type)+'" data-search="'+search+'">'+esc(item.name||item.path)+'</a>'}).join('');
    setText(status,channels.length+' destinations · Control Phi registry v'+(data?.version??'?'));
    hideLegacyMenus();syncWalletUI();
  }

  async function getRegistry(){
    const sources=[`${PAGES}?omni=${Date.now()}`,`${RAW}?omni=${Date.now()}`];
    for(const source of sources){try{const r=await fetch(source,{cache:'no-store'});if(!r.ok)continue;const data=await r.json();if(Array.isArray(data?.channels)&&data.channels.length)return data}catch(_){}}
    throw new Error('registry unavailable');
  }

  async function refresh(){
    try{const data=await getRegistry();render(data);window.dispatchEvent(new CustomEvent('omnicontrol:ready',{detail:{count:data.channels.length,version:data.version??null}}))}
    catch(_){const shell=createShell();wire(shell);setText(shell.panel.querySelector('.oc-status'),'Registry temporarily unavailable. Core Infinity tools and saved StarCoin wallet remain available.')}
  }

  function mount(){
    if(!document.body)return;
    installWalletSync();hideLegacyMenus();refresh();
    window.addEventListener('focus',refresh);
    document.addEventListener('visibilitychange',()=>{if(!document.hidden)refresh()});
    setInterval(refresh,60000);
    setInterval(syncWalletUI,1500);
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',mount,{once:true});else mount();
})();