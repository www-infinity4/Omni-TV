(function(){
  "use strict";

  const ROOT="https://www-infinity4.github.io/";
  const CHANNEL_SOURCE=`${ROOT}Control-Phi/channels.json?v=20260913-omnitune2`;
  const NON_TV=new Set(["News-Phi","Control-Phi","Omni-TV"]);
  const $=id=>document.getElementById(id);
  const els={
    frame:$("stationFrame"),grid:$("channelGrid"),clock:$("clock"),networkState:$("networkState"),
    channelLabel:$("channelLabel"),nowTitle:$("nowTitle"),nowMeta:$("nowMeta"),idle:$("idleCard"),
    loading:$("loadingCard"),loadingChannel:$("loadingChannel"),prev:$("prevChannel"),next:$("nextChannel"),
    wake:$("wakeChannel"),open:$("openStation"),share:$("shareButton"),search:$("channelSearch"),status:$("status")
  };

  let channels=[];
  let selectedIndex=-1;
  let selected=null;
  let stationPoll=null;
  let readinessPoll=null;
  let loadTimer=null;
  let tuneGeneration=0;
  const liveState=new Map();

  const clean=value=>String(value==null?"":value).replace(/\s+/g," ").trim();
  const esc=value=>clean(value).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
  const slugOf=item=>clean(item?.slug||item?.path||item?.repo||item?.name?.replace(/\s+/g,"-")||"");

  function normalize(item){
    if(!item)return null;
    if(typeof item==="string")item={name:item,path:item};
    const slug=slugOf(item);
    if(!slug||NON_TV.has(slug))return null;
    return {name:clean(item.name||slug),slug,url:item.url||`${ROOT}${slug}/`};
  }

  function dedupe(list){
    const seen=new Set();
    return list.map(normalize).filter(Boolean).filter(item=>{
      const key=item.slug.toLowerCase();
      if(seen.has(key))return false;
      seen.add(key);
      return true;
    });
  }

  function fmtClock(){
    return new Intl.DateTimeFormat("en-US",{hour:"numeric",minute:"2-digit"}).format(new Date())+" local";
  }

  async function loadChannels(){
    try{
      const response=await fetch(CHANNEL_SOURCE,{cache:"no-store"});
      if(!response.ok)throw new Error(`Channel registry ${response.status}`);
      const data=await response.json();
      const list=dedupe(Array.isArray(data?.channels)?data.channels:[]);
      if(list.length)return list;
    }catch(error){
      console.warn("Control Phi channel registry unavailable",error);
    }
    return dedupe(Array.isArray(window.INFINITY_CHANNELS)?window.INFINITY_CHANNELS:[]);
  }

  function cardHTML(channel,index){
    const state=liveState.get(channel.slug)||{};
    const title=state.title||"Live channel";
    const art=state.image||"";
    return `<button class="channel-card" type="button" data-index="${index}" data-search="${esc((channel.name+" "+title).toLowerCase())}" style="--art:${art?`url('${art.replace(/'/g,"%27")}')`:"none"}" aria-current="${selected&&selected.slug===channel.slug?"true":"false"}"><span class="channel-top"><span class="channel-name">${esc(channel.name)}</span><span class="live-badge">LIVE</span></span><strong class="program-title">${esc(title)}</strong><span class="program-meta">Tap to watch here</span></button>`;
  }

  function renderGrid(){
    if(!els.grid)return;
    els.grid.innerHTML=channels.map(cardHTML).join("");
    els.grid.querySelectorAll(".channel-card").forEach(button=>button.addEventListener("click",()=>selectChannel(Number(button.dataset.index))));
    applyFilter();
    els.networkState.textContent=channels.length?`${channels.length} LIVE CHANNELS`:"CHANNEL REGISTRY OFFLINE";
  }

  function updateCard(slug){
    const index=channels.findIndex(item=>item.slug===slug);
    if(index<0||!els.grid)return;
    const old=els.grid.querySelector(`[data-index="${index}"]`);
    if(!old)return;
    const holder=document.createElement("div");
    holder.innerHTML=cardHTML(channels[index],index);
    const fresh=holder.firstElementChild;
    fresh.addEventListener("click",()=>selectChannel(index));
    old.replaceWith(fresh);
    applyFilter();
  }

  function applyFilter(){
    const term=clean(els.search?.value).toLowerCase();
    els.grid?.querySelectorAll(".channel-card").forEach(card=>{card.hidden=!!term&&!card.dataset.search.includes(term)});
  }

  function pageImage(doc){
    return doc.querySelector('meta[property="og:image"],meta[name="twitter:image"]')?.content||"";
  }

  function liveTitle(doc){
    const node=doc.querySelector("#nowTitle,[data-now-playing],#programTitle,.now-title");
    const text=clean(node?.textContent);
    if(!text||/loading|choose|please wait|tuning|joining/i.test(text))return "";
    return text;
  }

  function liveMeta(doc){
    return [doc.querySelector("#programTime")?.textContent,doc.querySelector("#nowMeta")?.textContent,doc.querySelector("#slotTime")?.textContent]
      .map(clean).filter(Boolean).join(" · ");
  }

  function enterButton(doc){
    return doc.querySelector("#enterButton,#enter,.enter-button,.enter,[data-enter-channel],button[data-enter-channel]");
  }

  function playerShell(doc){
    return doc.querySelector(".screen-shell")||doc.querySelector(".player-shell")||doc.querySelector("#player")?.parentElement||doc.querySelector(".player")?.parentElement;
  }

  function stationDocument(){
    try{return els.frame.contentDocument||els.frame.contentWindow?.document||null}catch(_){return null}
  }

  function setTuning(active,text=""){
    if(els.loading)els.loading.hidden=!active;
    if(active&&els.loadingChannel&&text)els.loadingChannel.textContent=text;
  }

  function isolatePlayer(doc,{activate=false}={}){
    try{
      const shell=playerShell(doc);
      if(!shell)return false;
      let node=shell;
      while(node&&node!==doc.body){
        const parent=node.parentElement;
        if(!parent)break;
        Array.from(parent.children).forEach(child=>{if(child!==node)child.style.setProperty("display","none","important")});
        parent.style.setProperty("margin","0","important");
        parent.style.setProperty("padding","0","important");
        parent.style.setProperty("width","100%","important");
        parent.style.setProperty("max-width","none","important");
        parent.style.setProperty("height","100%","important");
        node=parent;
      }
      doc.documentElement.style.cssText+=";margin:0!important;padding:0!important;overflow:hidden!important;background:#000!important";
      doc.body.style.cssText+=";margin:0!important;padding:0!important;overflow:hidden!important;background:#000!important";
      shell.style.setProperty("position","fixed","important");
      shell.style.setProperty("inset","0","important");
      shell.style.setProperty("width","100vw","important");
      shell.style.setProperty("height","100vh","important");
      shell.style.setProperty("max-width","none","important");
      shell.style.setProperty("aspect-ratio","auto","important");
      shell.style.setProperty("border","0","important");
      shell.style.setProperty("border-radius","0","important");
      shell.style.setProperty("margin","0","important");
      if(activate){
        const enter=enterButton(doc);
        if(enter&&typeof enter.click==="function")enter.click();
      }
      return true;
    }catch(error){
      console.warn("Could not isolate station player",error);
      return false;
    }
  }

  function syncSelectedInfo(){
    if(!selected)return;
    try{
      const doc=stationDocument();
      if(!doc||!doc.body)return;
      const title=liveTitle(doc);
      const previous=liveState.get(selected.slug)||{};
      const next={...previous,title:title||previous.title||"",image:previous.image||pageImage(doc),meta:liveMeta(doc)};
      liveState.set(selected.slug,next);
      if(next.title)els.nowTitle.textContent=next.title;
      els.nowMeta.textContent=next.meta||`Live from ${selected.name} · synchronized to the station clock`;
      updateCard(selected.slug);
    }catch(_){ }
  }

  function configureLoadedStation(activate=false){
    if(!selected)return false;
    try{
      const doc=stationDocument();
      if(!doc||!doc.body)return false;
      const isolated=isolatePlayer(doc,{activate});
      syncSelectedInfo();
      return isolated;
    }catch(_){return false}
  }

  function markStationReady(generation,reason){
    if(generation!==tuneGeneration||!selected)return false;
    const doc=stationDocument();
    if(!doc||!doc.body)return false;
    const shell=playerShell(doc);
    const usable=!!shell||doc.readyState==="interactive"||doc.readyState==="complete";
    if(!usable)return false;

    clearTimeout(loadTimer);
    setTuning(false);
    const isolated=configureLoadedStation(false);
    els.status.textContent=isolated
      ? `${selected.name} is in the Omni TV screen. Tap Enter live to start playback.`
      : `${selected.name} is connected. Tap Enter live to start playback.`;
    if(els.wake){els.wake.disabled=false;els.wake.textContent=`Enter ${selected.name}`;}
    return true;
  }

  function watchStationReadiness(generation){
    if(readinessPoll)clearInterval(readinessPoll);
    let checks=0;
    readinessPoll=setInterval(()=>{
      checks++;
      if(generation!==tuneGeneration){clearInterval(readinessPoll);readinessPoll=null;return;}
      if(markStationReady(generation,"poll")){clearInterval(readinessPoll);readinessPoll=null;return;}
      if(checks>=80){
        clearInterval(readinessPoll);readinessPoll=null;
        setTuning(false);
        if(selected){
          els.nowTitle.textContent=`${selected.name} selected`;
          els.nowMeta.textContent="The station page did not expose its player yet.";
          els.status.textContent="Tap Enter live. If the station source is unavailable, Open station will show its own status.";
        }
      }
    },125);
  }

  function selectChannel(index){
    if(!channels.length)return;
    index=(index+channels.length)%channels.length;
    selectedIndex=index;
    selected=channels[index];
    tuneGeneration++;
    const generation=tuneGeneration;

    if(els.idle)els.idle.hidden=true;
    setTuning(true,`Tuning ${selected.name}…`);
    els.channelLabel.textContent=`LIVE · ${selected.name}`;
    els.nowTitle.textContent=(liveState.get(selected.slug)||{}).title||`Joining ${selected.name}`;
    els.nowMeta.textContent="Connecting to the station at its current synchronized position.";
    els.open.disabled=false;
    els.wake.disabled=true;
    els.wake.textContent="Connecting…";
    els.status.textContent="";

    clearTimeout(loadTimer);
    loadTimer=setTimeout(()=>{
      if(generation!==tuneGeneration)return;
      setTuning(false);
      els.wake.disabled=false;
      els.wake.textContent=`Enter ${selected.name}`;
      els.status.textContent="Station page is still initializing. Tap Enter live to retry the player connection.";
    },6500);

    els.frame.src=`${selected.url}${selected.url.includes("?")?"&":"?"}omni=1`;
    history.replaceState(null,"",`#${encodeURIComponent(selected.slug)}`);
    renderGrid();
    watchStationReadiness(generation);

    if(stationPoll)clearInterval(stationPoll);
    stationPoll=setInterval(()=>{
      if(generation!==tuneGeneration)return;
      syncSelectedInfo();
      if(els.loading&&!els.loading.hidden)markStationReady(generation,"info-poll");
    },1000);
  }

  function wakeSelected(){
    if(!selected)return;
    setTuning(false);
    const doc=stationDocument();
    const enter=doc?enterButton(doc):null;
    let activated=false;
    if(enter&&typeof enter.click==="function"){
      try{enter.click();activated=true;}catch(_){ }
    }
    const isolated=doc?isolatePlayer(doc,{activate:false}):false;
    try{
      const iframe=doc?.querySelector("#player iframe,.player iframe,iframe[src*='youtube.com/embed']");
      if(iframe&&typeof iframe.focus==="function")iframe.focus();
    }catch(_){ }
    els.status.textContent=(activated||isolated)
      ? `${selected.name} is joined live.`
      : `${selected.name} is selected. Tap the video once if Android requires the playback gesture.`;
  }

  els.frame.addEventListener("load",()=>{
    if(!selected)return;
    const generation=tuneGeneration;
    markStationReady(generation,"load");
    setTimeout(()=>markStationReady(generation,"load-250"),250);
    setTimeout(()=>markStationReady(generation,"load-900"),900);
    setTimeout(()=>configureLoadedStation(false),1600);
  });

  function chooseFromHash(){
    const slug=decodeURIComponent(location.hash.slice(1)||"").toLowerCase();
    if(!slug)return false;
    const index=channels.findIndex(channel=>channel.slug.toLowerCase()===slug);
    if(index>=0){selectChannel(index);return true}
    return false;
  }

  async function share(){
    const state=selected?(liveState.get(selected.slug)||{}):{};
    const title=state.title||selected?.name||"Omni TV";
    const payload={
      title:selected?`${title} · Omni TV`:"Omni TV — Live Network Surfer",
      text:selected?`Watching ${title} live from ${selected.name} inside Omni TV.`:"Flip through the Infinity TV network live on one page.",
      url:location.href
    };
    try{
      if(navigator.share){
        await navigator.share(payload);
        els.status.textContent="Shared. News Phi received this completed share.";
      }else if(navigator.clipboard){
        await navigator.clipboard.writeText(payload.url);
        els.status.textContent="Omni TV link copied. A completed system share creates the News Phi card.";
      }
    }catch(error){
      if(!error||error.name!=="AbortError")els.status.textContent="Share did not complete.";
    }
  }

  async function start(){
    els.clock.textContent=fmtClock();
    setInterval(()=>els.clock.textContent=fmtClock(),1000);
    channels=await loadChannels();
    renderGrid();
    if(!channels.length){
      els.status.textContent="Control Phi channel registry did not load.";
      return;
    }
    if(!chooseFromHash()){
      els.nowMeta.textContent="Choose any channel below. Omni TV only loads the station you select.";
    }
  }

  els.prev.addEventListener("click",()=>selectChannel(selectedIndex<0?channels.length-1:selectedIndex-1));
  els.next.addEventListener("click",()=>selectChannel(selectedIndex<0?0:selectedIndex+1));
  els.wake.addEventListener("click",wakeSelected);
  els.open.addEventListener("click",()=>{if(selected)window.open(selected.url,"_blank","noopener")});
  els.share.addEventListener("click",share);
  els.search.addEventListener("input",applyFilter);
  window.addEventListener("hashchange",chooseFromHash);

  start();
})();
