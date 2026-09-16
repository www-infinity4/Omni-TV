(function channelShareContract(){
  'use strict';
  if(window.__INFINITY_CHANNEL_SHARE_CONTRACT__)return;
  window.__INFINITY_CHANNEL_SHARE_CONTRACT__='2026-09-16.1';

  const GUEST_KEY='starquest_guest_profile_v1';
  const SESSION_KEY='starquest_session';
  const USERS_KEY='starquest_users';
  const LEGACY_PROGRESS_KEY='infinity_channel_share_progress_v1';
  const NICK_KEY='infinity_nick_shares';
  const LEGACY_MIGRATION_KEY='infinity_legacy_share_progress_migrated_v1';
  const NICK_MIGRATION_KEY='infinity_nick_share_wallet_migrated_v1';
  const CONTRACT_MIGRATION_KEY='infinity_channel_share_contract_migrated_v1';
  const CHANNEL_PATHS=new Set(['Hermit-TV','Star-Launcher','HBO','Starz','Cinemax','Showtime','Encore','Cartoon-Network','WGN','TNT','NBC','FOX','FX','Nickelodeon','FSN','ESPN','MTV','VH1','AMC','Disney','USA','Comedy-Central','BET','Discovery','Nintendo-TV','Chiller','TBS','ABC','CBS','PBS','History-Channel','CNN','Trump-TV','ShopLC','Ozzy-TV','CCR-TV','Motor-TV','Physics-TV','Adventure-TV','Trigger-TV','Time-Surfers','Syncord','Astraflix','Vintech','Flix-Blender','Abstractia-','Animasync','SeekSync']);
  const currentPath=(location.pathname.split('/').filter(Boolean)[0]||'');
  if(!CHANNEL_PATHS.has(currentPath))return;

  const clean=value=>String(value==null?'':value).replace(/\s+/g,' ').trim();
  const read=(key,fallback)=>{try{const value=localStorage.getItem(key);return value==null?fallback:JSON.parse(value)}catch{return fallback}};
  const originalSet=Storage.prototype.setItem;
  const originalGet=Storage.prototype.getItem;
  let nativeShareConfirmedUntil=0;
  let nativeShareSerial=0;
  let consumedShareSerial=0;

  function walletStore(){
    const session=read(SESSION_KEY,null);
    const users=read(USERS_KEY,{});
    const signedIn=session&&session.key&&users&&users[session.key];
    const profile=signedIn||read(GUEST_KEY,{key:'__guest__',username:'Guest',tokens:0,shareCount:0,pendingShareCredits:0,shareEvents:[],ledger:[]});
    return{session,users,signedIn:!!signedIn,profile};
  }

  function saveStore(store){
    if(store.signedIn&&store.session&&store.session.key){
      store.users[store.session.key]=store.profile;
      originalSet.call(localStorage,USERS_KEY,JSON.stringify(store.users));
    }else originalSet.call(localStorage,GUEST_KEY,JSON.stringify(store.profile));
  }

  function credit(count,reference,source){
    count=Math.max(0,Math.floor(Number(count)||0));
    if(!count)return{awarded:0,progressToNextCoin:walletStore().profile.pendingShareCredits||0,balance:walletStore().profile.tokens||0};
    const store=walletStore(),profile=store.profile,now=Date.now();
    profile.tokens=Math.max(0,Number(profile.tokens)||0);
    profile.shareCount=Math.max(0,Number(profile.shareCount)||0)+count;
    profile.pendingShareCredits=Math.max(0,Number(profile.pendingShareCredits)||0)+count;
    let awarded=0;
    while(profile.pendingShareCredits>=10){profile.pendingShareCredits-=10;profile.tokens+=1;awarded+=1;}
    profile.shareEvents=Array.isArray(profile.shareEvents)?profile.shareEvents:[];
    for(let i=0;i<count;i++)profile.shareEvents.push({id:`channel-share-${now.toString(36)}-${i}-${Math.random().toString(36).slice(2,8)}`,contentId:reference||location.href,createdAt:now+i,confirmed:true,verified:true,method:source||'web_share_api',channel:currentPath});
    profile.shareEvents=profile.shareEvents.slice(-250);
    profile.ledger=Array.isArray(profile.ledger)?profile.ledger:[];
    profile.ledger.push({id:`tx-channel-share-${now.toString(36)}-${Math.random().toString(36).slice(2,8)}`,type:awarded?'share_reward':'share_credit',amount:awarded,balance:profile.tokens,pendingShareCredits:profile.pendingShareCredits,shareCredits:count,channel:currentPath,source:source||'channel-share',createdAt:now});
    profile.ledger=profile.ledger.slice(-500);
    saveStore(store);
    const detail={channel:currentPath,awarded,progressToNextCoin:profile.pendingShareCredits,balance:profile.tokens,shareCount:profile.shareCount,source:source||'channel-share'};
    try{window.dispatchEvent(new CustomEvent('starquest:share-progress',{detail}))}catch{}
    try{window.dispatchEvent(new CustomEvent('controlphi:wallet-change',{detail}))}catch{}
    refreshStatus(detail);
    return detail;
  }

  function refreshStatus(detail){
    const progress=Math.max(0,Number(detail&&detail.progressToNextCoin)||0);
    const balance=Math.max(0,Number(detail&&detail.balance)||0);
    const text=detail&&detail.awarded?`Shared · 1 StarCoin completed!`:`Shared · StarCoin progress ${progress}/10`;
    ['shareStatus','share-status'].forEach(id=>{const el=document.getElementById(id);if(el)el.textContent=text;});
    document.querySelectorAll('[data-channel-share-status]').forEach(el=>el.textContent=text);
    document.querySelectorAll('[data-omni-wallet-balance]').forEach(el=>el.textContent=`${(balance+progress/10).toFixed(1)} ⭐`);
    document.querySelectorAll('[data-omni-wallet-progress]').forEach(el=>el.textContent=`${progress}/10`);
  }

  function confirmationAvailable(){return Date.now()<=nativeShareConfirmedUntil&&nativeShareSerial>consumedShareSerial;}
  function consumeConfirmation(){if(!confirmationAvailable())return false;consumedShareSerial=nativeShareSerial;nativeShareConfirmedUntil=0;return true;}

  function wrapNativeShare(){
    if(typeof navigator.share!=='function'||navigator.share.__infinityChannelWrapped)return;
    const native=navigator.share.bind(navigator);
    const wrapped=async function(payload){
      const result=await native(payload);
      nativeShareSerial+=1;
      nativeShareConfirmedUntil=Date.now()+30000;
      return result;
    };
    wrapped.__infinityChannelWrapped=true;
    try{navigator.share=wrapped}catch{
      try{Object.defineProperty(navigator,'share',{configurable:true,value:wrapped})}catch{}
    }
  }

  function maybeMirrorLegacy(key,oldValue,newValue){
    if(!confirmationAvailable())return;
    const oldNum=Math.max(0,Number(oldValue)||0),nextNum=Math.max(0,Number(newValue)||0);
    let isShare=false;
    if(key===LEGACY_PROGRESS_KEY)isShare=(nextNum===oldNum+1)||(oldNum>=9&&nextNum===0);
    if(key===NICK_KEY)isShare=nextNum===oldNum+1;
    if(!isShare||!consumeConfirmation())return;
    credit(1,location.href,key===NICK_KEY?'nickelodeon-legacy-share':'legacy-channel-share');
  }

  function maybeMirrorCommunity(key,value){
    if(!String(key).startsWith('infinity_site_share_pending_v1:'))return;
    let record=null;try{record=JSON.parse(value)}catch{}
    const method=clean(record&&record.method);
    const nativeConfirmed=method==='native-share'&&consumeConfirmation();
    const userConfirmed=method==='user-confirmed-link-share';
    if(!nativeConfirmed&&!userConfirmed)return;
    credit(1,location.href,userConfirmed?'user-confirmed-link-share':'native-share');
  }

  function wrapStorage(){
    if(Storage.prototype.setItem.__infinityChannelWrapped)return;
    const wrapped=function(key,value){
      const isLocal=this===localStorage;
      let oldValue=null;if(isLocal)try{oldValue=originalGet.call(localStorage,key)}catch{}
      const result=originalSet.apply(this,arguments);
      if(isLocal){
        if(key===LEGACY_PROGRESS_KEY||key===NICK_KEY)maybeMirrorLegacy(key,oldValue,value);
        else maybeMirrorCommunity(key,value);
      }
      return result;
    };
    wrapped.__infinityChannelWrapped=true;
    Storage.prototype.setItem=wrapped;
  }

  function migrateLegacyRemainders(){
    try{
      if(localStorage.getItem(CONTRACT_MIGRATION_KEY)==='1')return;
      if(localStorage.getItem(LEGACY_MIGRATION_KEY)!=='1'){
        const legacy=Math.min(9,Math.max(0,Number(localStorage.getItem(LEGACY_PROGRESS_KEY))||0));
        if(legacy)credit(legacy,location.href,'legacy-progress-recovery');
        originalSet.call(localStorage,LEGACY_MIGRATION_KEY,'1');
      }
      if(currentPath==='Nickelodeon'&&localStorage.getItem(NICK_MIGRATION_KEY)!=='1'){
        const nick=Math.max(0,Math.floor(Number(localStorage.getItem(NICK_KEY))||0));
        if(nick)credit(nick,location.href,'nickelodeon-share-recovery');
        originalSet.call(localStorage,NICK_MIGRATION_KEY,'1');
      }
      originalSet.call(localStorage,CONTRACT_MIGRATION_KEY,'1');
    }catch{}
  }

  async function canonicalShare(){
    const nowTitle=clean(document.querySelector('[data-now-title],#nowTitle,#programTitle,h1')?.textContent)||currentPath.replace(/-/g,' ');
    const payload={title:`${nowTitle} · ${currentPath.replace(/-/g,' ')}`,text:`Watch ${nowTitle} on ${currentPath.replace(/-/g,' ')}.`,url:location.href};
    const status=document.querySelector('[data-channel-share-status]');
    if(typeof navigator.share!=='function'){
      try{await navigator.clipboard.writeText(payload.url);if(status)status.textContent='Link copied. Open Android Share to earn 1/10 StarCoin.';}catch{if(status)status.textContent='Sharing is unavailable in this browser.';}
      return;
    }
    try{
      await navigator.share(payload);
      consumeConfirmation();
      credit(1,payload.url,'omni-control-share');
    }catch(error){if(!error||error.name!=='AbortError'){if(status)status.textContent='Share did not complete.';}}
  }

  function installOmniShareButton(){
    const panel=document.getElementById('omniControlPanel');
    if(!panel||panel.querySelector('[data-channel-share-contract]'))return false;
    const wallet=panel.querySelector('#omniControlWallet');
    if(!wallet)return false;
    const button=document.createElement('button');
    button.type='button';button.dataset.channelShareContract='1';button.className='oc-wallet';
    button.style.borderColor='rgba(72,220,128,.5)';button.style.background='linear-gradient(135deg,rgba(9,109,61,.62),rgba(7,21,15,.96))';
    button.innerHTML='<span>Share channel · +1/10 ⭐</span><strong aria-hidden="true">↗</strong><small data-channel-share-status>Confirmed shares feed the StarCoin wallet</small>';
    wallet.insertAdjacentElement('afterend',button);
    button.addEventListener('click',canonicalShare);
    return true;
  }

  wrapNativeShare();
  migrateLegacyRemainders();
  wrapStorage();
  installOmniShareButton();
  window.addEventListener('omnicontrol:ready',installOmniShareButton);
  const observer=new MutationObserver(()=>{if(installOmniShareButton())observer.disconnect()});
  if(document.documentElement)observer.observe(document.documentElement,{childList:true,subtree:true});
  setTimeout(()=>observer.disconnect(),15000);

  window.InfinityChannelShareContract={version:'2026-09-16.1',credit,share:canonicalShare,channel:currentPath};
})();
