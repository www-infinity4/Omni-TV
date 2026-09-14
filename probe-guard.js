(function(){
  'use strict';

  const ROOT='https://www-infinity4.github.io/';
  const REGISTRY=ROOT+'Control-Phi/channels.json';
  const RAW='https://raw.githubusercontent.com/www-infinity4/Control-Phi/main/channels.json';
  const SELF_SLUG='omni-tv';
  let surfChannels=[];
  let registryPromise=null;

  const clean=value=>String(value??'').replace(/\s+/g,' ').trim();
  const slugOf=item=>clean(item?.path||item?.slug||item?.repo||item?.name?.replace(/\s+/g,'-'));

  function normalizeRegistry(list){
    const seen=new Set();
    return (Array.isArray(list)?list:[]).map(item=>{
      if(typeof item==='string')item={name:item,path:item};
      const slug=slugOf(item);
      if(!slug||slug.toLowerCase()===SELF_SLUG)return null;
      return{slug,name:clean(item?.name||slug)};
    }).filter(Boolean).filter(item=>{
      const key=item.slug.toLowerCase();
      if(seen.has(key))return false;
      seen.add(key);
      return true;
    });
  }

  async function loadSurfChannels(){
    if(surfChannels.length)return surfChannels;
    if(registryPromise)return registryPromise;
    registryPromise=(async()=>{
      for(const source of [REGISTRY,RAW]){
        try{
          const response=await fetch(source+(source.includes('?')?'&':'?')+'_selector='+Date.now(),{cache:'no-store'});
          if(!response.ok)continue;
          const data=await response.json();
          const list=normalizeRegistry(data?.channels);
          if(list.length){surfChannels=list;return surfChannels}
        }catch(_){ }
      }
      return surfChannels;
    })();
    try{return await registryPromise}finally{registryPromise=null}
  }

  function currentSlug(){
    try{return decodeURIComponent(location.hash.slice(1)||'').toLowerCase()}catch{return''}
  }

  function clickDestination(channel){
    if(!channel)return false;
    const card=[...document.querySelectorAll('.channel-card[data-slug]')].find(node=>String(node.dataset.slug||'').toLowerCase()===channel.slug.toLowerCase());
    if(card){card.click();return true}
    location.hash=encodeURIComponent(channel.slug);
    return true;
  }

  async function surf(delta){
    const pool=await loadSurfChannels();
    if(!pool.length)return;
    const slug=currentSlug();
    let index=pool.findIndex(channel=>channel.slug.toLowerCase()===slug);
    if(index<0)index=delta>0?-1:0;
    index=(index+delta+pool.length)%pool.length;
    clickDestination(pool[index]);
  }

  // CH-/CH+ always follow the canonical registry order. Card sorting, likes,
  // watch time, shares, genres, searches, and viewer score can never reorder surfing.
  document.addEventListener('click',event=>{
    const button=event.target?.closest?.('#prevChannel,#nextChannel');
    if(!button)return;
    event.preventDefault();
    event.stopImmediatePropagation();
    surf(button.id==='nextChannel'?1:-1);
  },true);

  // Warm the selector list without waiting for the first CH press.
  loadSurfChannels();

  function guard(frame){
    if(!frame||frame.dataset.omniGuarded==='1')return;
    frame.dataset.omniGuarded='1';
    let tries=0;
    const timer=setInterval(()=>{
      tries++;
      try{
        const win=frame.contentWindow,doc=frame.contentDocument;
        if(win&&doc&&doc.documentElement){
          win.__infinityChannelGuide=true;
          doc.getElementById('infinityChannelGuide')?.remove();
          doc.querySelectorAll('iframe.icg-probe').forEach(node=>node.remove());
        }
      }catch(_){ }
      if(tries>=220||!frame.isConnected)clearInterval(timer);
    },25);
    frame.addEventListener('load',()=>{
      try{
        frame.contentWindow.__infinityChannelGuide=true;
        frame.contentDocument.getElementById('infinityChannelGuide')?.remove();
        frame.contentDocument.querySelectorAll('iframe.icg-probe').forEach(node=>node.remove());
      }catch(_){ }
    });
  }

  const observer=new MutationObserver(records=>records.forEach(record=>record.addedNodes.forEach(node=>{
    if(!(node instanceof Element))return;
    if(node.matches('iframe.probe-frame'))guard(node);
    node.querySelectorAll?.('iframe.probe-frame').forEach(guard);
  })));
  observer.observe(document.documentElement,{childList:true,subtree:true});
  document.querySelectorAll('iframe.probe-frame').forEach(guard);
})();
