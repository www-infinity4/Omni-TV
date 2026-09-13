(function(){
  "use strict";

  const SIGNAL_KEY="phiShared:interestSignals:v1";
  const ROOT="https://www-infinity4.github.io/";
  const MAX_SIGNALS=250;
  const DUPLICATE_WINDOW_MS=30000;
  const clean=value=>String(value==null?"":value).replace(/\s+/g," ").trim();
  const slug=value=>clean(value).toLowerCase().replace(/[^a-z0-9]+/g,"-").replace(/^-|-$/g,"").slice(0,120)||"interest";
  const read=(key,fallback)=>{try{return JSON.parse(localStorage.getItem(key))??fallback}catch(_){return fallback}};
  const write=(key,value)=>{try{localStorage.setItem(key,JSON.stringify(value));return true}catch(_){return false}};
  const validProgram=value=>{
    const text=clean(value);
    return text&&!/checking what|program title unavailable|tuning |choose a live channel|player unavailable|still locating|station break/i.test(text);
  };

  let pendingShare=null;
  let searchTimer=null;
  let pageViewTimer=null;
  let lastViewFingerprint="";
  let lastViewAt=0;

  function currentContext(){
    const channelLabel=clean(document.getElementById("channelLabel")?.textContent).replace(/^LIVE\s*·\s*/i,"");
    const program=clean(document.getElementById("nowTitle")?.textContent);
    const selectedCard=document.querySelector('.channel-card[aria-current="true"]');
    const cardChannel=clean(selectedCard?.querySelector(".channel-name")?.textContent);
    const cardProgram=clean(selectedCard?.querySelector(".program-title")?.textContent);
    const channel=cardChannel||channelLabel;
    const title=validProgram(cardProgram)?cardProgram:(validProgram(program)?program:"");
    const channelSlug=selectedCard?clean((selectedCard.dataset.search||"").split(" ")[0]):slug(channel);
    let image="";
    if(selectedCard){
      const style=selectedCard.getAttribute("style")||"";
      const match=style.match(/url\(['\"]?([^'\")]+)['\"]?\)/i);
      image=match?.[1]||"";
    }
    return {channel,channelSlug,program:title,image,url:location.href,meta:clean(document.getElementById("nowMeta")?.textContent)};
  }

  function recordSignal(kind,detail={}){
    const now=Date.now();
    const query=clean(detail.query);
    const channel=clean(detail.channel);
    const program=clean(detail.program);
    if(kind==="search"&&!query)return null;
    if(kind!=="search"&&!channel&&!program)return null;

    const topicKey=kind==="search"?`search:${slug(query)}`:`program:${slug(channel)}:${slug(program||channel)}`;
    const list=read(SIGNAL_KEY,[]);
    const index=list.findIndex(item=>item&&item.kind===kind&&item.topicKey===topicKey);
    const previous=index>=0?list[index]:null;
    const recent=previous&&now-Number(previous.lastAt||0)<DUPLICATE_WINDOW_MS;
    const next={
      ...(previous||{}),
      id:previous?.id||`omni-${kind}-${now.toString(36)}-${Math.random().toString(36).slice(2,7)}`,
      topicKey,
      kind,
      source:"Omni TV",
      channel,
      channelSlug:clean(detail.channelSlug)||slug(channel),
      program,
      query,
      url:detail.url||location.href,
      image:detail.image||previous?.image||"",
      meta:clean(detail.meta)||previous?.meta||"",
      hits:recent?Math.max(1,Number(previous?.hits)||1):Math.max(0,Number(previous?.hits)||0)+1,
      createdAt:previous?.createdAt||new Date(now).toISOString(),
      lastAt:now,
      collectedAt:new Date(now).toISOString()
    };
    if(index>=0)list.splice(index,1);
    list.unshift(next);
    write(SIGNAL_KEY,list.slice(0,MAX_SIGNALS));
    window.dispatchEvent(new CustomEvent("newsphi:interest",{detail:next}));
    const status=document.getElementById("phiInterestStatus");
    if(status){
      const label=kind==="search"?`Search indexed for News Phi: ${query}`:kind==="share"?`Completed share indexed for News Phi: ${program||channel}`:`View indexed for News Phi: ${program||channel}`;
      status.textContent=label;
    }
    return next;
  }

  function recordCurrentView(){
    const context=currentContext();
    if(!context.channel||!validProgram(context.program))return;
    const fingerprint=`${slug(context.channel)}:${slug(context.program)}`;
    const now=Date.now();
    if(fingerprint===lastViewFingerprint&&now-lastViewAt<20000)return;
    lastViewFingerprint=fingerprint;
    lastViewAt=now;
    recordSignal("view",context);
  }

  function scheduleCurrentView(delay=700){
    clearTimeout(pageViewTimer);
    pageViewTimer=setTimeout(recordCurrentView,delay);
  }

  function addBottomPanel(){
    if(document.getElementById("phiDiscoveryBridge"))return;
    const panel=document.createElement("section");
    panel.id="phiDiscoveryBridge";
    panel.className="phi-discovery-bridge";
    panel.setAttribute("aria-labelledby","phiDiscoveryHeading");
    panel.innerHTML=`
      <div class="phi-discovery-copy">
        <p>PERSONAL DISCOVERY LOOP</p>
        <h2 id="phiDiscoveryHeading">What you watch helps build your News Phi.</h2>
        <span>Tap a live program and Omni TV saves the channel plus the title as an interest signal. Searches add subjects you are looking for. Completed shares are a stronger signal. News Phi turns those signals into reusable story cards, with repeated interests returning toward the top so the feed follows what you actually explore.</span>
        <small id="phiInterestStatus">Only activity on these Infinity pages in this browser is used for this feed.</small>
      </div>
      <nav class="phi-discovery-links" aria-label="Phi discovery tools">
        <a href="${ROOT}News-Phi/">News Phi</a>
        <a href="${ROOT}Omni-Phi/">Omni Phi</a>
        <a href="${ROOT}Infinity-Phi/">Infinity Phi Search</a>
      </nav>`;
    const style=document.createElement("style");
    style.textContent=`
      .phi-discovery-bridge{width:min(1180px,calc(100% - 28px));margin:24px auto 34px;padding:22px;display:grid;grid-template-columns:minmax(0,1.5fr) minmax(240px,.7fr);gap:20px;border:1px solid rgba(255,255,255,.13);border-radius:22px;background:linear-gradient(135deg,rgba(16,24,39,.94),rgba(9,12,20,.97));box-shadow:0 18px 54px rgba(0,0,0,.28)}
      .phi-discovery-copy p{margin:0 0 7px;font-size:.72rem;font-weight:900;letter-spacing:.16em;color:#7dd3fc}.phi-discovery-copy h2{margin:0 0 8px;font-size:clamp(1.35rem,4vw,2rem)}.phi-discovery-copy span{display:block;max-width:780px;line-height:1.55;color:rgba(255,255,255,.76)}.phi-discovery-copy small{display:block;margin-top:10px;color:rgba(255,255,255,.56)}
      .phi-discovery-links{display:grid;gap:9px;align-content:center}.phi-discovery-links a{display:flex;align-items:center;justify-content:center;min-height:48px;padding:10px 14px;border-radius:14px;text-decoration:none;font-weight:900;color:#fff;background:rgba(255,255,255,.08);border:1px solid rgba(255,255,255,.14)}.phi-discovery-links a:first-child{background:rgba(249,115,22,.18);border-color:rgba(251,146,60,.5)}
      @media(max-width:760px){.phi-discovery-bridge{grid-template-columns:1fr}.phi-discovery-links{grid-template-columns:1fr}.phi-discovery-copy span{font-size:.95rem}}
    `;
    document.head.appendChild(style);
    const footer=document.querySelector("footer");
    if(footer)footer.before(panel);else document.body.appendChild(panel);
  }

  document.addEventListener("click",event=>{
    const card=event.target.closest?.(".channel-card");
    if(card){
      const channel=clean(card.querySelector(".channel-name")?.textContent);
      const program=clean(card.querySelector(".program-title")?.textContent);
      if(channel&&validProgram(program)){
        const fingerprint=`${slug(channel)}:${slug(program)}`;
        lastViewFingerprint=fingerprint;
        lastViewAt=Date.now();
        recordSignal("view",{channel,channelSlug:slug(channel),program,url:location.href,meta:clean(card.querySelector(".program-meta")?.textContent)});
      }else scheduleCurrentView(1200);
      return;
    }
    if(event.target.closest?.("#prevChannel,#nextChannel")){scheduleCurrentView(1200);return;}
    if(event.target.closest?.("#shareButton")){pendingShare=currentContext();}
  },true);

  const search=document.getElementById("channelSearch");
  search?.addEventListener("input",()=>{
    clearTimeout(searchTimer);
    searchTimer=setTimeout(()=>{
      const query=clean(search.value);
      if(query.length>=2)recordSignal("search",{query,...currentContext()});
    },700);
  });

  const status=document.getElementById("status");
  if(status){
    new MutationObserver(()=>{
      const text=clean(status.textContent);
      if(/^Shared\./i.test(text)&&pendingShare){recordSignal("share",pendingShare);pendingShare=null;}
      else if(/did not complete/i.test(text))pendingShare=null;
    }).observe(status,{childList:true,subtree:true,characterData:true});
  }

  const nowTitle=document.getElementById("nowTitle");
  if(nowTitle)new MutationObserver(()=>scheduleCurrentView(650)).observe(nowTitle,{childList:true,subtree:true,characterData:true});

  addBottomPanel();
  scheduleCurrentView(1800);
})();
