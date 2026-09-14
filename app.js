(function(){
  "use strict";

  const ROOT="https://www-infinity4.github.io/";
  const RAW_CHANNELS="https://raw.githubusercontent.com/www-infinity4/Control-Phi/main/channels.json";
  const NON_TV=new Set(["News-Phi","Control-Phi","Omni-TV","Hydrogen-Digital-TV"]);
  const $=id=>document.getElementById(id);
  const els={
    shell:$("screenShell"),frame:$("stationFrame"),grid:$("channelGrid"),clock:$("clock"),networkState:$("networkState"),
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
  let probeGeneration=0;
  const liveState=new Map();
  const PROBE_WORKERS=4;
  const PROBE_TIMEOUT=2800;
  const RESCAN_MS=180000;

  const clean=value=>String(value==null?"":value).replace(/\s+/g," ").trim();
  const esc=value=>clean(value).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
  const slugOf=item=>clean(item?.slug||item?.path||item?.repo||item?.name?.replace(/\s+/g,"-")||"");

  const tapOverlay=document.createElement("button");
  tapOverlay.type="button";
  tapOverlay.className="tap-live-overlay";
  tapOverlay.hidden=true;
  tapOverlay.innerHTML="<span>READY</span><strong>Tap to start</strong><small>Join this channel at the live position</small>";
  els.shell?.appendChild(tapOverlay);

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

  async function fetchRegistry(url){
    const response=await fetch(`${url}${url.includes("?")?"&":"?"}_omni=${Date.now()}`,{cache:"no-store"});
    if(!response.ok)throw new Error(`Channel registry ${response.status}`);
    const data=await response.json();
    return dedupe(Array.isArray(data?.channels)?data.channels:[]);
  }

  async function loadChannels(){
    for(const source of [`${ROOT}Control-Phi/channels.json`,RAW_CHANNELS]){
      try{
        const list=await fetchRegistry(source);
        if(list.length)return list;
      }catch(error){
        console.warn("Channel registry source unavailable",source,error);
      }
    }
    return dedupe(Array.isArray(window.INFINITY_CHANNELS)?window.INFINITY_CHANNELS:[]);
  }

  function cardHTML(channel,index){
    const state=liveState.get(channel.slug)||{};
    const title=state.title||(state.checked?"Program title unavailable":"Checking what’s on…");
    const meta=state.meta||(state.checked?`Live on ${channel.name}`:"Reading station schedule…");
    const stateAttr=state.title?"live":"checking";
    return `<button class="channel-card" type="button" data-index="${index}" data-search="${esc((channel.name+" "+title).toLowerCase())}" aria-current="${selected&&selected.slug===channel.slug?"true":"false"}"><span class="channel-top"><span class="channel-name">${esc(channel.name)}</span><span class="live-badge">LIVE</span></span><strong class="program-title" data-state="${stateAttr}">${esc(title)}</strong><span class="program-meta">${esc(meta)}</span></button>`;
  }

  function wireCard(button,index){
    const channel=channels[index];
    const art=liveState.get(channel?.slug)?.image||"";
    try{
      const url=new URL(art,location.href);
      if(/^https?:$/.test(url.protocol))button.style.setProperty("--art",`url(${JSON.stringify(url.href)})`);
      else button.style.setProperty("--art","none");
    }catch(_){button.style.setProperty("--art","none")}
    button.addEventListener("click",()=>selectChannel(index));
  }

  function renderGrid(){
    if(!els.grid)return;
    els.grid.innerHTML=channels.map(cardHTML).join("");
    els.grid.querySelectorAll(".channel-card").forEach(button=>wireCard(button,Number(button.dataset.index)));
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
    wireCard(fresh,index);
    old.replaceWith(fresh);
    applyFilter();
  }

  function applyFilter(){
    const term=clean(els.search?.value).toLowerCase();
    els.grid?.querySelectorAll(".channel-card").forEach(card=>{card.hidden=!!term&&!card.dataset.search.includes(term)});
  }

  function pageImage(doc,baseUrl=""){
    const meta=doc.querySelector('meta[property="og:image"],meta[name="twitter:image"]')?.content||"";
    if(!meta)return "";
    try{return new URL(meta,baseUrl||location.href).href}catch(_){return meta}
  }

  function programArt(doc,baseUrl=""){
    try{
      const raw=getComputedStyle(doc.body).getPropertyValue("--program-art")||doc.body?.style?.getPropertyValue("--program-art")||"";
      const match=String(raw).match(/url\(["']?([^"')]+)["']?\)/i);
      if(match?.[1])return new URL(match[1],baseUrl||location.href).href;
    }catch(_){ }
    // A page/social image describes the channel, not necessarily the named
    // program. Only explicit current-program artwork belongs on this card.
    return "";
  }

  function liveTitle(doc){
    const selectors=[
      "[data-now-playing]","#programTitle","#nowTitle",
      "[aria-current='true'] [data-program-title]",
      ".guide-row.current .program-title",
      ".current-program [data-program-title]",
      "#stationCard:not([hidden]) #stationCardTitle"
    ];
    for(const selector of selectors){
      const node=doc.querySelector(selector);
      const text=clean(node?.dataset?.programTitle||node?.textContent);
      if(!text)continue;
      if(/loading|choose|please wait|tuning|joining|station break|live network|what.?s on|tv guide/i.test(text))continue;
      if(text.length>180)continue;
      return text;
    }
    return "";
  }

  function liveMeta(doc){
    const values=[
      doc.querySelector("#programTime")?.textContent,
      doc.querySelector("#nowMeta")?.textContent,
      doc.querySelector("#slotTime")?.textContent,
      doc.querySelector(".guide-row.current time")?.textContent
    ].map(clean).filter(Boolean);
    return [...new Set(values)].slice(0,2).join(" · ");
  }

  function enterButton(doc){
    return doc.querySelector("#enterButton,#enter,.enter-button,.enter,[data-enter-channel],button[data-enter-channel]");
  }

  function playerShell(doc){
    return doc.querySelector("[data-player-shell],.screen-shell,.player-shell,.video-shell")||doc.querySelector("#player")?.parentElement||doc.querySelector(".player")?.parentElement;
  }

  function stationDocument(){
    try{return els.frame.contentDocument||els.frame.contentWindow?.document||null}catch(_){return null}
  }

  function setTuning(active,text=""){
    if(els.loading)els.loading.hidden=!active;
    if(active&&els.loadingChannel&&text)els.loadingChannel.textContent=text;
  }

  function hideTapOverlay(){
    tapOverlay.hidden=true;
    els.shell?.classList.remove("awaiting-tap");
  }

  function showTapOverlay(){
    if(!selected)return;
    tapOverlay.innerHTML=`<span>LIVE · ${esc(selected.name)}</span><strong>Tap to start</strong><small>${esc((liveState.get(selected.slug)||{}).title||"Join at the current live position")}</small>`;
    tapOverlay.hidden=false;
    els.shell?.classList.add("awaiting-tap");
  }

  function hideStationFrame(){
    els.shell?.classList.remove("station-ready","station-playing");
    hideTapOverlay();
  }

  function revealStationFrame(){
    els.shell?.classList.add("station-ready");
  }

  function isolatePlayer(doc){
    try{
      const shell=playerShell(doc);
      if(!shell)return false;
      doc.documentElement.dataset.omniPlayerOnly="1";
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
        parent.style.setProperty("min-height","0","important");
        parent.style.setProperty("overflow","hidden","important");
        node=parent;
      }
      doc.documentElement.style.cssText+=";margin:0!important;padding:0!important;width:100%!important;height:100%!important;overflow:hidden!important;background:#000!important";
      doc.body.style.cssText+=";margin:0!important;padding:0!important;width:100%!important;height:100%!important;min-height:0!important;overflow:hidden!important;background:#000!important";
      shell.style.setProperty("position","fixed","important");
      shell.style.setProperty("inset","0","important");
      shell.style.setProperty("width","100vw","important");
      shell.style.setProperty("height","100vh","important");
      shell.style.setProperty("max-width","none","important");
      shell.style.setProperty("aspect-ratio","auto","important");
      shell.style.setProperty("border","0","important");
      shell.style.setProperty("border-radius","0","important");
      shell.style.setProperty("margin","0","important");
      shell.style.setProperty("transform","none","important");
      return true;
    }catch(error){
      console.warn("Could not isolate station player",error);
      return false;
    }
  }

  function captureState(channel,doc,baseUrl=""){
    if(!channel||!doc?.body)return null;
    const previous=liveState.get(channel.slug)||{};
    const title=liveTitle(doc);
    const sameProgram=!!title&&title===previous.title;
    const image=programArt(doc,baseUrl)||(sameProgram?previous.image:"")||"";
    const meta=liveMeta(doc)||(sameProgram?previous.meta:"")||"";
    const next={...previous,title,image,meta,checked:true,checkedAt:Date.now()};
    liveState.set(channel.slug,next);
    updateCard(channel.slug);
    return next;
  }

  function syncSelectedInfo(){
    if(!selected)return;
    try{
      const doc=stationDocument();
      if(!doc||!doc.body)return;
      const next=captureState(selected,doc,selected.url);
      if(next?.title)els.nowTitle.textContent=next.title;
      els.nowMeta.textContent=next?.meta||`Live from ${selected.name} · synchronized to the station clock`;
    }catch(_){ }
  }

  function configureLoadedStation(){
    if(!selected)return false;
    try{
      const doc=stationDocument();
      if(!doc||!doc.body)return false;
      const isolated=isolatePlayer(doc);
      syncSelectedInfo();
      if(isolated)revealStationFrame();
      return isolated;
    }catch(_){return false}
  }

  function markStationReady(generation){
    if(generation!==tuneGeneration||!selected)return false;
    const doc=stationDocument();
    if(!doc||!doc.body||!playerShell(doc))return false;
    clearTimeout(loadTimer);
    if(!configureLoadedStation())return false;
    setTuning(false);
    showTapOverlay();
    els.status.textContent="";
    if(els.wake){els.wake.disabled=false;els.wake.textContent="Tap to start";}
    return true;
  }

  function watchStationReadiness(generation){
    if(readinessPoll)clearInterval(readinessPoll);
    let checks=0;
    readinessPoll=setInterval(()=>{
      checks++;
      if(generation!==tuneGeneration){clearInterval(readinessPoll);readinessPoll=null;return;}
      if(markStationReady(generation)){clearInterval(readinessPoll);readinessPoll=null;return;}
      if(checks>=96){
        clearInterval(readinessPoll);readinessPoll=null;
        setTuning(false);
        hideStationFrame();
        if(selected){
          els.nowTitle.textContent=(liveState.get(selected.slug)||{}).title||`${selected.name} player unavailable`;
          els.nowMeta.textContent="Omni TV could not isolate this station’s player shell.";
          els.status.textContent="Open station is available while this channel is repaired for Omni mode.";
          els.wake.disabled=true;
          els.wake.textContent="Player unavailable";
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
    const known=liveState.get(selected.slug)||{};

    if(els.idle)els.idle.hidden=true;
    hideStationFrame();
    setTuning(true,`Tuning ${selected.name}…`);
    els.channelLabel.textContent=`LIVE · ${selected.name}`;
    els.nowTitle.textContent=known.title||`Tuning ${selected.name}`;
    els.nowMeta.textContent=known.meta||"Preparing the live player without leaving Omni TV.";
    els.open.disabled=false;
    els.wake.disabled=true;
    els.wake.textContent="Tuning…";
    els.status.textContent="";

    clearTimeout(loadTimer);
    loadTimer=setTimeout(()=>{
      if(generation!==tuneGeneration)return;
      setTuning(false);
      if(!markStationReady(generation)){
        els.status.textContent="Still locating this station’s player…";
      }
    },7000);

    const separator=selected.url.includes("?")?"&":"?";
    els.frame.src=`${selected.url}${separator}omni=player&v=${Date.now()}`;
    history.replaceState(null,"",`#${encodeURIComponent(selected.slug)}`);
    renderGrid();
    watchStationReadiness(generation);

    if(stationPoll)clearInterval(stationPoll);
    stationPoll=setInterval(()=>{
      if(generation!==tuneGeneration)return;
      syncSelectedInfo();
      if(!els.shell?.classList.contains("station-ready"))markStationReady(generation);
    },1000);
  }

  function wakeSelected(){
    if(!selected)return;
    const doc=stationDocument();
    if(!doc||!playerShell(doc))return;
    let activated=false;
    const enter=enterButton(doc);
    if(enter&&typeof enter.click==="function"){
      try{enter.click();activated=true;}catch(_){ }
    }
    isolatePlayer(doc);
    revealStationFrame();
    hideTapOverlay();
    els.shell?.classList.add("station-playing");
    els.wake.disabled=false;
    els.wake.textContent="Live";
    els.status.textContent=activated?`${selected.name} joined live.`:`${selected.name} player is ready. Tap the video if Android requests one more playback gesture.`;
    try{
      const iframe=doc.querySelector("#player iframe,.player iframe,iframe[src*='youtube.com/embed']");
      iframe?.focus?.();
    }catch(_){ }
  }

  els.frame.addEventListener("load",()=>{
    if(!selected)return;
    const generation=tuneGeneration;
    setTimeout(()=>markStationReady(generation),0);
    setTimeout(()=>markStationReady(generation),120);
    setTimeout(()=>markStationReady(generation),450);
    setTimeout(()=>markStationReady(generation),1000);
  });

  function chooseFromHash(){
    const slug=decodeURIComponent(location.hash.slice(1)||"").toLowerCase();
    if(!slug)return false;
    const index=channels.findIndex(channel=>channel.slug.toLowerCase()===slug);
    if(index>=0){selectChannel(index);return true}
    return false;
  }

  async function probeChannel(channel,frame,generation){
    if(generation!==probeGeneration)return;
    await new Promise(resolve=>{
      let settled=false;
      let interval=null;
      const finish=()=>{
        if(settled)return;
        settled=true;
        clearInterval(interval);
        clearTimeout(timeout);
        frame.onload=null;
        resolve();
      };
      const inspect=()=>{
        if(generation!==probeGeneration)return finish();
        try{
          const doc=frame.contentDocument||frame.contentWindow?.document;
          if(!doc?.body)return;
          const title=liveTitle(doc);
          if(title){captureState(channel,doc,channel.url);return finish();}
        }catch(_){ }
      };
      frame.onload=()=>{
        inspect();
        interval=setInterval(inspect,120);
      };
      const timeout=setTimeout(()=>{
        try{
          const doc=frame.contentDocument||frame.contentWindow?.document;
          if(doc?.body)captureState(channel,doc,channel.url);
          else{
            const previous=liveState.get(channel.slug)||{};
            liveState.set(channel.slug,{...previous,checked:true,checkedAt:Date.now()});
            updateCard(channel.slug);
          }
        }catch(_){
          const previous=liveState.get(channel.slug)||{};
          liveState.set(channel.slug,{...previous,checked:true,checkedAt:Date.now()});
          updateCard(channel.slug);
        }
        finish();
      },PROBE_TIMEOUT);
      const sep=channel.url.includes("?")?"&":"?";
      frame.src=`${channel.url}${sep}omni=meta&probe=${generation}-${Date.now()}`;
    });
  }

  function startMetadataScan(){
    if(!channels.length)return;
    probeGeneration++;
    const generation=probeGeneration;
    const queue=channels.slice();
    let cursor=0;
    const workers=Array.from({length:Math.min(PROBE_WORKERS,queue.length)},()=>{
      const frame=document.createElement("iframe");
      frame.className="probe-frame";
      frame.setAttribute("aria-hidden","true");
      frame.tabIndex=-1;
      document.body.appendChild(frame);
      return frame;
    });
    workers.forEach(async frame=>{
      while(generation===probeGeneration){
        const index=cursor++;
        if(index>=queue.length)break;
        const channel=queue[index];
        if(selected&&channel.slug===selected.slug){
          const doc=stationDocument();
          if(doc?.body)captureState(channel,doc,channel.url);
          continue;
        }
        await probeChannel(channel,frame,generation);
      }
      frame.remove();
    });
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
        els.status.textContent="Omni TV link copied.";
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
      els.status.textContent="Channel registry did not load.";
      return;
    }
    startMetadataScan();
    setInterval(startMetadataScan,RESCAN_MS);
    if(!chooseFromHash()){
      els.nowMeta.textContent="Choose any channel below. Omni TV will open its live player here.";
    }
  }

  tapOverlay.addEventListener("click",wakeSelected);
  els.prev.addEventListener("click",()=>selectChannel(selectedIndex<0?channels.length-1:selectedIndex-1));
  els.next.addEventListener("click",()=>selectChannel(selectedIndex<0?0:selectedIndex+1));
  els.wake.addEventListener("click",wakeSelected);
  els.open.addEventListener("click",()=>{if(selected)window.open(selected.url,"_blank","noopener")});
  els.share.addEventListener("click",share);
  els.search.addEventListener("input",applyFilter);
  window.addEventListener("hashchange",chooseFromHash);

  start();
})();
