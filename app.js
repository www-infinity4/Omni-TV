(function(){
  "use strict";

  const ROOT="https://www-infinity4.github.io/";
  const EXTRAS=[
    {name:"ESPN",slug:"ESPN"},{name:"ABC",slug:"ABC"},{name:"CBS",slug:"CBS"},
    {name:"Comedy Central",slug:"Comedy-Central"},{name:"USA TV",slug:"USA-TV"},
    {name:"AMC",slug:"AMC"},{name:"Motor TV",slug:"Motor-TV"},{name:"CCR TV",slug:"CCR-TV"}
  ];
  const $=id=>document.getElementById(id);
  const els={
    frame:$("stationFrame"),probe:$("probeFrame"),grid:$("channelGrid"),clock:$("clock"),
    networkState:$("networkState"),channelLabel:$("channelLabel"),nowTitle:$("nowTitle"),nowMeta:$("nowMeta"),
    idle:$("idleCard"),loading:$("loadingCard"),loadingChannel:$("loadingChannel"),
    prev:$("prevChannel"),next:$("nextChannel"),wake:$("wakeChannel"),open:$("openStation"),
    share:$("shareButton"),search:$("channelSearch"),status:$("status")
  };

  let channels=[];
  let selectedIndex=-1;
  let selected=null;
  let stationPoll=null;
  let probeRunning=false;
  const liveState=new Map();

  function clean(value){return String(value==null?"":value).replace(/\s+/g," ").trim()}
  function esc(value){return clean(value).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]))}
  function slugOf(item){return clean(item.slug||item.path||item.repo||item.name.replace(/\s+/g,"-"))}
  function normalize(item){
    if(!item)return null;
    if(typeof item==="string")item={name:item,slug:item};
    const slug=slugOf(item); if(!slug)return null;
    return {name:clean(item.name||slug),slug,url:item.url||`${ROOT}${slug}/`,group:item.group||"TV"};
  }
  function dedupe(list){
    const seen=new Set();
    return list.map(normalize).filter(Boolean).filter(item=>{
      const key=item.slug.toLowerCase(); if(seen.has(key))return false; seen.add(key); return true;
    });
  }
  function fmtClock(){return new Intl.DateTimeFormat("en-US",{hour:"numeric",minute:"2-digit"}).format(new Date())+" local"}

  function coreChannels(){
    const source=Array.isArray(window.INFINITY_CHANNELS)?window.INFINITY_CHANNELS:[];
    return source.filter(item=>!item.group||item.group==="TV");
  }

  async function addDeployedExtras(list){
    const existing=new Set(list.map(item=>item.slug.toLowerCase()));
    const additions=[];
    for(const extra of EXTRAS){
      if(existing.has(extra.slug.toLowerCase()))continue;
      const candidate=normalize(extra);
      try{
        const response=await fetch(candidate.url,{method:"GET",cache:"no-store"});
        if(response.ok)additions.push(candidate);
      }catch(_){ }
    }
    return dedupe(list.concat(additions));
  }

  function cardHTML(channel,index){
    const state=liveState.get(channel.slug)||{};
    const title=state.title||"Checking live program…";
    const art=state.image||"";
    return `<button class="channel-card" type="button" data-index="${index}" data-search="${esc((channel.name+" "+title).toLowerCase())}" style="--art:${art?`url('${art.replace(/'/g,"%27")}')`:"none"}" aria-current="${selected&&selected.slug===channel.slug?"true":"false"}"><span class="channel-top"><span class="channel-name">${esc(channel.name)}</span><span class="live-badge">LIVE</span></span><strong class="program-title"${state.title?"":' data-state="checking"'}>${esc(title)}</strong><span class="program-meta">Tap to watch here</span></button>`;
  }

  function renderGrid(){
    if(!els.grid)return;
    els.grid.innerHTML=channels.map(cardHTML).join("");
    els.grid.querySelectorAll(".channel-card").forEach(button=>button.addEventListener("click",()=>selectChannel(Number(button.dataset.index))));
    applyFilter();
    if(els.networkState)els.networkState.textContent=`${channels.length} LIVE CHANNELS`;
  }

  function updateCard(slug){
    const index=channels.findIndex(item=>item.slug===slug); if(index<0)return;
    const old=els.grid&&els.grid.querySelector(`[data-index="${index}"]`); if(!old)return;
    const holder=document.createElement("div"); holder.innerHTML=cardHTML(channels[index],index);
    const fresh=holder.firstElementChild;
    fresh.addEventListener("click",()=>selectChannel(index));
    old.replaceWith(fresh);
    applyFilter();
  }

  function applyFilter(){
    const term=clean(els.search&&els.search.value).toLowerCase();
    els.grid&&els.grid.querySelectorAll(".channel-card").forEach(card=>{card.hidden=!!term&&!card.dataset.search.includes(term)});
  }

  function pageImage(doc){
    return doc.querySelector('meta[property="og:image"],meta[name="twitter:image"]')?.content||"";
  }

  function liveTitle(doc){
    const node=doc.querySelector("#nowTitle,[data-now-playing],#programTitle,.now-title");
    const text=clean(node&&node.textContent);
    if(!text||/loading|choose|please wait|tuning/i.test(text))return "";
    return text;
  }

  function liveMeta(doc){
    const bits=[doc.querySelector("#programTime")?.textContent,doc.querySelector("#nowMeta")?.textContent].map(clean).filter(Boolean);
    return bits.join(" · ");
  }

  function isolatePlayer(doc){
    try{
      const shell=doc.querySelector(".screen-shell")||doc.querySelector("#player")?.parentElement||doc.querySelector(".player")?.parentElement;
      if(!shell)return false;
      let node=shell;
      while(node&&node!==doc.body){
        const parent=node.parentElement; if(!parent)break;
        Array.from(parent.children).forEach(child=>{if(child!==node)child.style.setProperty("display","none","important")});
        parent.style.setProperty("margin","0","important");
        parent.style.setProperty("padding","0","important");
        parent.style.setProperty("width","100%","important");
        parent.style.setProperty("max-width","none","important");
        parent.style.setProperty("height","100%","important");
        node=parent;
      }
      doc.documentElement.style.setProperty("margin","0","important");
      doc.documentElement.style.setProperty("padding","0","important");
      doc.documentElement.style.setProperty("overflow","hidden","important");
      doc.body.style.setProperty("margin","0","important");
      doc.body.style.setProperty("padding","0","important");
      doc.body.style.setProperty("overflow","hidden","important");
      doc.body.style.setProperty("background","#000","important");
      shell.style.setProperty("position","fixed","important");
      shell.style.setProperty("inset","0","important");
      shell.style.setProperty("width","100vw","important");
      shell.style.setProperty("height","100vh","important");
      shell.style.setProperty("max-width","none","important");
      shell.style.setProperty("aspect-ratio","auto","important");
      shell.style.setProperty("border","0","important");
      shell.style.setProperty("border-radius","0","important");
      shell.style.setProperty("margin","0","important");
      const enter=doc.querySelector("#enterButton,.enter-button,[data-enter-channel]");
      if(enter&&typeof enter.click==="function")enter.click();
      return true;
    }catch(_){return false}
  }

  function syncSelectedInfo(){
    if(!selected||!els.frame.contentDocument)return;
    try{
      const doc=els.frame.contentDocument;
      const title=liveTitle(doc);
      if(title){
        const previous=liveState.get(selected.slug)||{};
        liveState.set(selected.slug,{...previous,title,image:previous.image||pageImage(doc),meta:liveMeta(doc)});
        els.nowTitle.textContent=title;
        els.nowMeta.textContent=liveMeta(doc)||`Live from ${selected.name} · synchronized to the station clock`;
        updateCard(selected.slug);
      }
    }catch(_){ }
  }

  function selectChannel(index){
    if(!channels.length)return;
    index=(index+channels.length)%channels.length;
    selectedIndex=index; selected=channels[index];
    els.idle.hidden=true; els.loading.hidden=false; els.loadingChannel.textContent=`Tuning ${selected.name}…`;
    els.channelLabel.textContent=`LIVE · ${selected.name}`;
    els.nowTitle.textContent=(liveState.get(selected.slug)||{}).title||`Joining ${selected.name}`;
    els.nowMeta.textContent="Loading the station at its current synchronized position.";
    els.open.disabled=false; els.wake.disabled=false;
    els.frame.src=`${selected.url}${selected.url.includes("?")?"&":"?"}omni=1&t=${Date.now()}`;
    history.replaceState(null,"",`#${encodeURIComponent(selected.slug)}`);
    renderGrid();
    if(stationPoll)clearInterval(stationPoll);
    stationPoll=setInterval(syncSelectedInfo,1000);
  }

  function wakeSelected(){
    if(!selected)return;
    try{
      const doc=els.frame.contentDocument;
      isolatePlayer(doc);
      const enter=doc.querySelector("#enterButton,.enter-button,[data-enter-channel]");
      if(enter&&typeof enter.click==="function")enter.click();
      const player=doc.querySelector("#player iframe,.player iframe,iframe[src*='youtube.com/embed']");
      if(player&&typeof player.focus==="function")player.focus();
      els.status.textContent=`${selected.name} is joined live.`;
    }catch(_){els.status.textContent="Tap the video once if this station requires a playback gesture."}
  }

  els.frame.addEventListener("load",()=>{
    if(!selected)return;
    setTimeout(()=>{
      let isolated=false;
      try{isolated=isolatePlayer(els.frame.contentDocument)}catch(_){ }
      els.loading.hidden=true;
      syncSelectedInfo();
      els.status.textContent=isolated?`${selected.name} piped into Omni TV.`:`${selected.name} loaded. Tap Enter live if needed.`;
    },550);
  });

  async function waitForProbe(doc,timeoutMs=3200){
    const started=Date.now();
    while(Date.now()-started<timeoutMs){
      const title=liveTitle(doc);
      if(title)return {title,image:pageImage(doc),meta:liveMeta(doc)};
      await new Promise(resolve=>setTimeout(resolve,250));
    }
    return {title:"Live station",image:pageImage(doc),meta:""};
  }

  function probeLoad(url){
    return new Promise(resolve=>{
      let finished=false;
      const done=value=>{if(finished)return;finished=true;clearTimeout(timer);resolve(value)};
      const timer=setTimeout(()=>done(null),5000);
      els.probe.onload=async()=>{
        try{done(await waitForProbe(els.probe.contentDocument))}catch(_){done(null)}
      };
      els.probe.src=`${url}${url.includes("?")?"&":"?"}omni_probe=1&t=${Date.now()}`;
    });
  }

  async function probeNetwork(){
    if(probeRunning)return; probeRunning=true;
    for(const channel of channels){
      if(selected&&channel.slug===selected.slug){syncSelectedInfo();continue}
      const state=await probeLoad(channel.url);
      if(state){liveState.set(channel.slug,state);updateCard(channel.slug)}
    }
    probeRunning=false;
  }

  function chooseFromHash(){
    const slug=decodeURIComponent(location.hash.slice(1)||"").toLowerCase();
    if(!slug)return;
    const index=channels.findIndex(channel=>channel.slug.toLowerCase()===slug);
    if(index>=0)selectChannel(index);
  }

  async function share(){
    const title=selected?(liveState.get(selected.slug)||{}).title:"Omni TV";
    const payload={title:selected?`${title||selected.name} · Omni TV`:"Omni TV — Live Network Surfer",text:selected?`Watching ${title||selected.name} live from ${selected.name} inside Omni TV.`:"Flip through the Infinity TV network live on one page.",url:location.href};
    try{
      if(navigator.share)await navigator.share(payload);
      else if(navigator.clipboard){await navigator.clipboard.writeText(payload.url);els.status.textContent="Omni TV link copied."}
    }catch(error){if(!error||error.name!=="AbortError")els.status.textContent="Share did not complete."}
  }

  async function start(){
    els.clock.textContent=fmtClock(); setInterval(()=>els.clock.textContent=fmtClock(),1000);
    let base=dedupe(coreChannels());
    channels=await addDeployedExtras(base);
    renderGrid();
    chooseFromHash();
    setTimeout(probeNetwork,700);
    setInterval(probeNetwork,5*60*1000);
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
