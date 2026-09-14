(function(){
  'use strict';
  const ROOT='https://www-infinity4.github.io/';
  const REGISTRY=ROOT+'Control-Phi/channels.json';
  const RAW='https://raw.githubusercontent.com/www-infinity4/Control-Phi/main/channels.json';
  const CACHE_KEY='omni:guide:v7';
  const RATING_KEY='omni:viewer-ratings:v1';
  const CACHE_MS=5*60*1000;
  const $=id=>document.getElementById(id);
  const els={
    shell:$('screenShell'),frame:$('stationFrame'),grid:$('channelGrid'),clock:$('clock'),networkState:$('networkState'),
    channelLabel:$('channelLabel'),nowTitle:$('nowTitle'),nowMeta:$('nowMeta'),idle:$('idleCard'),loading:$('loadingCard'),
    loadingChannel:$('loadingChannel'),prev:$('prevChannel'),next:$('nextChannel'),wake:$('wakeChannel'),open:$('openStation'),
    share:$('shareButton'),search:$('channelSearch'),status:$('status'),genre:$('genreFilter'),sort:$('sortMode'),filterSummary:$('filterSummary')
  };
  const clean=v=>String(v??'').replace(/\s+/g,' ').trim();
  const safeUrl=(v,base=location.href)=>{try{const u=new URL(v,base);return /^https?:$/.test(u.protocol)?u.href:''}catch{return ''}};
  const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

  let channels=[],viewChannels=[],selected=null,tuneId=0,stationPoll=0,selectedStartedAt=0;
  let activeType='all';
  const states=new Map(),cards=new Map(),probeTokens=new Map(),queued=new Set();
  let probeQueue=[],runningProbes=0,visibleObserver=null;
  const ratings=readJson(RATING_KEY,{});

  const overlay=document.createElement('button');
  overlay.type='button';overlay.className='tap-live-overlay';overlay.hidden=true;
  overlay.innerHTML='<span>READY</span><strong>Tap to start</strong><small>Join this channel at the live position</small>';
  els.shell?.appendChild(overlay);

  function readJson(key,fallback){try{return JSON.parse(localStorage.getItem(key))??fallback}catch{return fallback}}
  function writeJson(key,value){try{localStorage.setItem(key,JSON.stringify(value))}catch(_){}}
  function slugOf(item){return clean(item?.path||item?.slug||item?.repo||item?.name?.replace(/\s+/g,'-'))}
  function normalizeType(value,slug){
    const type=clean(value).toLowerCase();
    if(type==='website'||type==='site'||type==='web')return'website';
    if(type==='tv'||type==='channel')return'tv';
    return /(?:news-phi|omni-phi|c13b0\/phi|tv-database|omni-tv)/i.test(slug)?'website':'tv';
  }
  function normalize(item,order){
    if(!item)return null;if(typeof item==='string')item={name:item,path:item};
    const slug=slugOf(item);if(!slug)return null;
    const type=normalizeType(item.type,slug);
    const genres=[...new Set((Array.isArray(item.genres)?item.genres:[]).map(v=>clean(v).toLowerCase()).filter(Boolean))];
    return{name:clean(item.name||slug),slug,url:safeUrl(item.url||ROOT+slug+'/',ROOT),type,genres,order,globalRating:Number(item.viewerRating??item.rating??0)||0};
  }
  function dedupe(list){const seen=new Set();return list.map((item,index)=>normalize(item,index)).filter(Boolean).filter(item=>{const key=item.slug.toLowerCase();if(seen.has(key))return false;seen.add(key);return true})}
  async function getChannels(){
    for(const source of [REGISTRY,RAW]){
      try{
        const r=await fetch(source+(source.includes('?')?'&':'?')+'_omni='+Date.now(),{cache:'no-store'});if(!r.ok)continue;
        const data=await r.json(),list=dedupe(Array.isArray(data?.channels)?data.channels:[]);if(list.length)return list;
      }catch(_){ }
    }
    return[];
  }
  function clock(){return new Intl.DateTimeFormat('en-US',{hour:'numeric',minute:'2-digit'}).format(new Date())+' local'}
  function readCache(){return readJson(CACHE_KEY,{})}
  function writeCache(){const out={};states.forEach((value,key)=>{if(value?.checked)out[key]=value});writeJson(CACHE_KEY,out)}

  function metric(slug){
    const row=ratings[slug]||{};
    return{tunes:Math.max(0,Number(row.tunes)||0),seconds:Math.max(0,Number(row.seconds)||0),shares:Math.max(0,Number(row.shares)||0),lastViewed:Math.max(0,Number(row.lastViewed)||0)};
  }
  function saveMetric(slug,patch){
    const old=metric(slug);ratings[slug]={...old,...patch};writeJson(RATING_KEY,ratings);
  }
  function commitSelectedTime(){
    if(!selected||!selectedStartedAt)return;
    const elapsed=Math.max(0,Math.min(6*3600,Math.floor((Date.now()-selectedStartedAt)/1000)));
    if(elapsed>=2){const old=metric(selected.slug);saveMetric(selected.slug,{seconds:old.seconds+elapsed,lastViewed:Date.now()})}
    selectedStartedAt=0;
  }
  function viewerScore(channel){
    const m=metric(channel.slug);
    const recency=m.lastViewed?Math.max(0,1-(Date.now()-m.lastViewed)/(14*86400000)):0;
    const local=Math.log2(1+m.tunes)*8+Math.log2(1+m.seconds/60)*5+m.shares*12+recency*4;
    return channel.globalRating>0?channel.globalRating*100+local:local;
  }
  function scoreLabel(channel){
    if(channel.globalRating>0)return`★ ${channel.globalRating.toFixed(1)}`;
    const m=metric(channel.slug);if(!m.tunes&&!m.seconds&&!m.shares)return'NEW';
    return`RANK ${Math.max(1,Math.round(viewerScore(channel)))}`;
  }

  function currentTitle(doc){
    const selectors=['[data-now-playing]','#programTitle','#nowTitle','#nowPlaying','.now-title','.guide-row.current .program-title','.guide-row.current strong','.row.now strong','.current-program strong'];
    for(const selector of selectors){const text=clean(doc.querySelector(selector)?.textContent);if(text&&text.length<180&&!/loading|choose|please wait|tuning|station break|live network|tv guide|intermission/i.test(text))return text}
    return'';
  }
  function currentMeta(doc){return [...new Set(['#programTime','#nowMeta','#slotTime','.guide-row.current time','.row.now time'].map(s=>clean(doc.querySelector(s)?.textContent)).filter(Boolean))].slice(0,2).join(' · ')}
  function pageTitle(doc){return clean(doc.querySelector('meta[property="og:title"]')?.content||doc.title||doc.querySelector('h1')?.textContent||'')}
  function pageDescription(doc){return clean(doc.querySelector('meta[name="description"],meta[property="og:description"]')?.content||'')}
  function currentImage(doc,base){
    const src=doc.querySelector('[data-program-art] img,[data-now-art] img,.guide-row.current img,.row.now img,.current-program img')?.getAttribute?.('src')||'';if(src)return safeUrl(src,base);
    try{const raw=doc.body?.style?.getPropertyValue('--program-art')||doc.documentElement?.style?.getPropertyValue('--program-art')||'';const m=String(raw).match(/url\(["']?([^"')]+)["']?\)/i);if(m?.[1])return safeUrl(m[1],base)}catch(_){ }
    return safeUrl(doc.querySelector('meta[property="og:image"],meta[name="twitter:image"]')?.content||'',base);
  }
  function frameMatches(frame,channel){try{const path=frame.contentWindow.location.pathname.split('/').filter(Boolean).join('/');return path.toLowerCase().startsWith(channel.slug.toLowerCase())}catch{return false}}
  function capture(channel,doc,frame){
    if(!channel||!doc?.body)return false;if(frame&&!frameMatches(frame,channel))return false;
    const old=states.get(channel.slug)||{};
    const title=channel.type==='website'?(pageTitle(doc)||old.title||channel.name):(currentTitle(doc)||old.title||'');
    const meta=channel.type==='website'?(pageDescription(doc)||old.meta||'Website'):(currentMeta(doc)||old.meta||'');
    const image=currentImage(doc,channel.url)||old.image||'';
    states.set(channel.slug,{title,meta,image,checked:true,at:Date.now()});paintCard(channel.slug);writeCache();return!!title;
  }

  function makeCard(channel){
    const card=document.createElement('button');card.type='button';card.className='channel-card';card.dataset.slug=channel.slug;card.dataset.type=channel.type;
    card.innerHTML='<img class="channel-art" alt="" loading="lazy" hidden><span class="channel-shade" aria-hidden="true"></span><span class="channel-top"><span class="channel-name"></span><span class="kind-badge"></span></span><strong class="program-title" data-state="checking"></strong><span class="program-meta"></span><span class="viewer-rank"></span>';
    card.querySelector('.channel-name').textContent=channel.name;card.addEventListener('click',()=>selectChannel(channel));cards.set(channel.slug,card);paintCard(channel.slug);return card;
  }
  function paintCard(slug){
    const channel=channels.find(c=>c.slug===slug),card=cards.get(slug);if(!channel||!card)return;
    const state=states.get(slug)||{};
    const title=state.title||(channel.type==='website'?'Browse website':state.checked?'Open live schedule':'Checking what’s on…');
    const meta=state.meta||(channel.type==='website'?channel.genres.join(' · '):state.checked?'Tap to tune this station':'Reading station schedule…');
    card.querySelector('.program-title').textContent=title;card.querySelector('.program-title').dataset.state=state.title?'live':'checking';
    card.querySelector('.program-meta').textContent=meta;
    card.querySelector('.kind-badge').textContent=channel.type==='website'?'WEB':'LIVE';
    card.querySelector('.viewer-rank').textContent=scoreLabel(channel);
    card.dataset.search=(channel.name+' '+title+' '+meta+' '+channel.genres.join(' ')).toLowerCase();
    const img=card.querySelector('.channel-art');if(state.image){if(img.src!==state.image)img.src=state.image;img.hidden=false}else{img.removeAttribute('src');img.hidden=true}
  }

  function activeGenre(){return clean(els.genre?.value).toLowerCase()}
  function activeSort(){return clean(els.sort?.value)||'top'}
  function typeMatches(channel){return activeType==='all'||channel.type===activeType}
  function genreMatches(channel){const genre=activeGenre();return !genre||channel.genres.includes(genre)}
  function searchMatches(channel){const term=clean(els.search?.value).toLowerCase();if(!term)return true;const card=cards.get(channel.slug);return String(card?.dataset.search||'').includes(term)}
  function compareChannels(a,b){
    const mode=activeSort();
    if(mode==='network')return a.order-b.order;
    if(mode==='az')return a.name.localeCompare(b.name);
    const delta=viewerScore(b)-viewerScore(a);return Math.abs(delta)>0.001?delta:a.order-b.order;
  }
  function applyView(){
    viewChannels=channels.filter(typeMatches).filter(genreMatches).filter(searchMatches).sort(compareChannels);
    const frag=document.createDocumentFragment();viewChannels.forEach(channel=>{const card=cards.get(channel.slug);if(card)frag.appendChild(card)});els.grid.replaceChildren(frag);
    markSelection();setupVisibleScanning();
    const tv=viewChannels.filter(c=>c.type==='tv').length,web=viewChannels.length-tv;
    if(els.filterSummary)els.filterSummary.textContent=`${viewChannels.length} shown · ${tv} TV · ${web} websites`;
  }
  function renderCards(){
    cards.clear();channels.forEach(channel=>makeCard(channel));applyView();
    const tvCount=channels.filter(c=>c.type==='tv').length,webCount=channels.length-tvCount;
    els.networkState.textContent=channels.length?`${tvCount} TV · ${webCount} SITES`:'NETWORK REGISTRY OFFLINE';
    populateGenres();
  }
  function populateGenres(){
    if(!els.genre)return;
    const previous=els.genre.value;
    const genres=[...new Set(channels.flatMap(c=>c.genres))].sort((a,b)=>a.localeCompare(b));
    els.genre.innerHTML='<option value="">All genres</option>'+genres.map(g=>`<option value="${esc(g)}">${esc(g.replace(/\b\w/g,m=>m.toUpperCase()))}</option>`).join('');
    if(genres.includes(previous))els.genre.value=previous;
  }
  function markSelection(){cards.forEach((card,slug)=>card.setAttribute('aria-current',selected?.slug===slug?'true':'false'))}
  function setType(type){activeType=['all','tv','website'].includes(type)?type:'all';document.querySelectorAll('[data-view-type]').forEach(button=>button.setAttribute('aria-pressed',button.dataset.viewType===activeType?'true':'false'));applyView()}

  function queueProbe(channel,force=false){
    if(!channel||selected?.slug===channel.slug)return;
    const state=states.get(channel.slug)||{};if(!force&&state.checked&&Date.now()-(state.at||0)<CACHE_MS)return;
    if(queued.has(channel.slug))return;queued.add(channel.slug);probeQueue.push(channel);pumpProbes();
  }
  function pumpProbes(){const max=innerWidth<=760?1:2;while(runningProbes<max&&probeQueue.length){const channel=probeQueue.shift();runningProbes++;probeFresh(channel).finally(()=>{runningProbes--;queued.delete(channel.slug);pumpProbes()})}}
  function probeFresh(channel){
    return new Promise(resolve=>{
      const token=(probeTokens.get(channel.slug)||0)+1;probeTokens.set(channel.slug,token);
      const frame=document.createElement('iframe');frame.className='probe-frame';frame.tabIndex=-1;frame.setAttribute('aria-hidden','true');frame.setAttribute('title','');
      let done=false,timer=0,limit=0;
      const validToken=()=>probeTokens.get(channel.slug)===token;
      const finish=(mark=true)=>{if(done)return;done=true;clearInterval(timer);clearTimeout(limit);frame.onload=null;frame.remove();if(mark&&validToken()){const state=states.get(channel.slug)||{};if(!state.checked){states.set(channel.slug,{...state,checked:true,at:Date.now()});paintCard(channel.slug);writeCache()}}resolve()};
      const inspect=()=>{if(!validToken())return finish(false);try{const doc=frame.contentDocument;if(!doc?.body||!frameMatches(frame,channel))return;const title=channel.type==='website'?pageTitle(doc):currentTitle(doc);if(title){capture(channel,doc,frame);finish(false)}}catch(_){ }};
      frame.onload=()=>{inspect();timer=setInterval(inspect,300)};
      limit=setTimeout(()=>{if(validToken()){try{if(frame.contentDocument?.body&&frameMatches(frame,channel))capture(channel,frame.contentDocument,frame)}catch(_){ }}finish(true)},channel.type==='website'?3500:5000);
      const sep=channel.url.includes('?')?'&':'?';frame.src=channel.url+sep+'omni=meta&probe='+encodeURIComponent(channel.slug)+'&v='+Date.now();document.body.appendChild(frame);
    });
  }
  function setupVisibleScanning(){
    visibleObserver?.disconnect();visibleObserver=new IntersectionObserver(entries=>{entries.forEach(entry=>{if(!entry.isIntersecting)return;const channel=channels.find(c=>c.slug===entry.target.dataset.slug);queueProbe(channel)})},{rootMargin:'260px'});
    viewChannels.forEach(channel=>{const card=cards.get(channel.slug);if(card)visibleObserver.observe(card)});
  }
  function refreshVisible(){viewChannels.forEach(channel=>{const card=cards.get(channel.slug);if(!card)return;const r=card.getBoundingClientRect();if(r.bottom>=-260&&r.top<=innerHeight+260)queueProbe(channel,true)})}

  function stationDoc(){try{return els.frame.contentDocument||null}catch{return null}}
  function playerShell(doc){return doc?.querySelector('[data-player-shell],.screen-shell,.player-shell,.video-shell,.screen')||doc?.querySelector('#player')?.parentElement||doc?.querySelector('.player')?.parentElement}
  function enterButton(doc){return doc?.querySelector('#enterButton,#enter,.enter-button,.enter,[data-enter-channel]')}
  function isolate(doc){
    try{
      const shell=playerShell(doc);if(!shell)return false;let node=shell;
      while(node&&node!==doc.body){const parent=node.parentElement;if(!parent)break;Array.from(parent.children).forEach(child=>{if(child!==node)child.style.setProperty('display','none','important')});['margin','padding'].forEach(p=>parent.style.setProperty(p,'0','important'));parent.style.setProperty('width','100%','important');parent.style.setProperty('max-width','none','important');parent.style.setProperty('height','100%','important');parent.style.setProperty('overflow','hidden','important');node=parent}
      doc.documentElement.style.cssText+=';margin:0!important;padding:0!important;width:100%!important;height:100%!important;overflow:hidden!important;background:#000!important';
      doc.body.style.cssText+=';margin:0!important;padding:0!important;width:100%!important;height:100%!important;min-height:0!important;overflow:hidden!important;background:#000!important';
      shell.style.cssText+=';position:fixed!important;inset:0!important;width:100vw!important;height:100vh!important;max-width:none!important;aspect-ratio:auto!important;border:0!important;border-radius:0!important;margin:0!important;transform:none!important';return true;
    }catch{return false}
  }
  function syncSelected(){
    if(!selected)return false;const doc=stationDoc();if(!doc?.body)return false;capture(selected,doc);
    const state=states.get(selected.slug)||{};
    if(selected.type==='website'){
      els.nowTitle.textContent=state.title||selected.name;
      els.nowMeta.textContent=state.meta||`Website · ${selected.genres.join(' · ')}`;
    }else{
      if(state.title)els.nowTitle.textContent=state.title;
      els.nowMeta.textContent=state.meta||('Live from '+selected.name+' · synchronized to the station clock');
    }
    return true;
  }
  function ready(generation){
    if(generation!==tuneId||!selected)return false;const doc=stationDoc();if(!doc?.body)return false;
    if(selected.type==='website'){
      capture(selected,doc);els.shell.classList.add('station-ready','website-ready');els.loading.hidden=true;overlay.hidden=true;els.wake.disabled=false;els.wake.textContent='Browse';els.status.textContent='Website loaded inside Omni TV.';syncSelected();return true;
    }
    if(!playerShell(doc)||!isolate(doc))return false;syncSelected();els.shell.classList.add('station-ready');els.shell.classList.remove('website-ready');els.loading.hidden=true;
    overlay.querySelector('span').textContent='LIVE · '+selected.name;overlay.querySelector('strong').textContent='Tap to start';overlay.querySelector('small').textContent=(states.get(selected.slug)||{}).title||'Join at the current live position';overlay.hidden=false;els.wake.disabled=false;els.wake.textContent='Tap to start';els.status.textContent='';return true;
  }

  function selectChannel(channel){
    if(!channel)return;commitSelectedTime();selected=channel;selectedStartedAt=Date.now();
    const old=metric(channel.slug);saveMetric(channel.slug,{tunes:old.tunes+1,lastViewed:Date.now()});
    paintCard(channel.slug);applyView();probeTokens.set(channel.slug,(probeTokens.get(channel.slug)||0)+1);tuneId++;
    const generation=tuneId,state=states.get(channel.slug)||{};markSelection();els.idle.hidden=true;els.loading.hidden=false;els.loadingChannel.textContent=(channel.type==='website'?'Loading ':'Tuning ')+channel.name+'…';
    els.shell.classList.remove('station-ready','station-playing','website-ready');overlay.hidden=true;els.channelLabel.textContent=(channel.type==='website'?'WEBSITE · ':'LIVE · ')+channel.name;
    els.nowTitle.textContent=state.title||(channel.type==='website'?channel.name:'Tuning '+channel.name);els.nowMeta.textContent=state.meta||(channel.type==='website'?'Loading the full page inside Omni TV.':'Preparing the live player without leaving Omni TV.');
    els.open.disabled=false;els.open.textContent=channel.type==='website'?'Open website':'Open station';els.wake.disabled=true;els.wake.textContent=channel.type==='website'?'Loading…':'Tuning…';els.status.textContent='';
    els.frame.src=channel.url+(channel.url.includes('?')?'&':'?')+(channel.type==='website'?'omni=website':'omni=player')+'&v='+Date.now();history.replaceState(null,'','#'+encodeURIComponent(channel.slug));
    clearInterval(stationPoll);let tries=0;stationPoll=setInterval(()=>{if(generation!==tuneId){clearInterval(stationPoll);return}tries++;if(ready(generation)){clearInterval(stationPoll);stationPoll=setInterval(syncSelected,2000);return}if(tries>80){clearInterval(stationPoll);els.loading.hidden=true;els.status.textContent=channel.type==='website'?'This website cannot be embedded; Open website still works.':'This station player needs repair; Open station still works.';els.wake.textContent=channel.type==='website'?'Open website':'Player unavailable'}},150);
  }
  function step(delta){
    const pool=viewChannels.length?viewChannels:channels;if(!pool.length)return;
    let index=selected?pool.findIndex(c=>c.slug===selected.slug):-1;if(index<0)index=delta>0?-1:0;index=(index+delta+pool.length)%pool.length;selectChannel(pool[index]);
  }
  function wake(){
    if(!selected)return;if(selected.type==='website'){try{els.frame.contentWindow.focus()}catch(_){ }els.status.textContent='Browsing '+selected.name+' inside Omni TV.';return}
    const doc=stationDoc();if(!doc?.body)return;try{enterButton(doc)?.click()}catch(_){ }isolate(doc);els.shell.classList.add('station-ready','station-playing');overlay.hidden=true;els.wake.disabled=false;els.wake.textContent='Live';els.status.textContent=selected.name+' joined live.';syncSelected();
  }
  function fromHash(){const slug=decodeURIComponent(location.hash.slice(1)||'').toLowerCase();if(!slug)return false;const channel=channels.find(c=>c.slug.toLowerCase()===slug);if(channel){selectChannel(channel);return true}return false}
  async function share(){
    const state=selected?(states.get(selected.slug)||{}):{},title=state.title||selected?.name||'Omni TV';
    const payload={title:selected?title+' · Omni TV':'Omni TV — Live Network Surfer',text:selected?(selected.type==='website'?'Browsing ':'Watching ')+title+' from '+selected.name+' inside Omni TV.':'Flip through the Infinity network live on one page.',url:location.href};
    try{
      if(navigator.share){await navigator.share(payload);els.status.textContent='Shared. News Phi received this completed share.'}else{await navigator.clipboard.writeText(payload.url);els.status.textContent='Omni TV link copied.'}
      if(selected){const old=metric(selected.slug);saveMetric(selected.slug,{shares:old.shares+1,lastViewed:Date.now()});paintCard(selected.slug);applyView()}
    }catch(e){if(e?.name!=='AbortError')els.status.textContent='Share did not complete.'}
  }

  async function start(){
    els.clock.textContent=clock();setInterval(()=>els.clock.textContent=clock(),1000);
    const cached=readCache();Object.entries(cached).forEach(([slug,state])=>{if(state&&Date.now()-(state.at||0)<CACHE_MS)states.set(slug,state)});
    channels=await getChannels();renderCards();if(!channels.length){els.status.textContent='Channel registry did not load.';return}
    if(!fromHash())els.nowMeta.textContent='Surf TV and websites together, or filter the remote below.';
    setInterval(refreshVisible,CACHE_MS);
  }

  els.frame.addEventListener('load',()=>{const generation=tuneId;[0,150,500,1000].forEach(ms=>setTimeout(()=>ready(generation),ms))});
  overlay.addEventListener('click',wake);els.prev.addEventListener('click',()=>step(-1));els.next.addEventListener('click',()=>step(1));els.wake.addEventListener('click',wake);
  els.open.addEventListener('click',()=>selected&&window.open(selected.url,'_blank','noopener'));els.share.addEventListener('click',share);
  els.search?.addEventListener('input',applyView);els.genre?.addEventListener('change',applyView);els.sort?.addEventListener('change',applyView);
  document.querySelectorAll('[data-view-type]').forEach(button=>button.addEventListener('click',()=>setType(button.dataset.viewType)));
  window.addEventListener('hashchange',fromHash);window.addEventListener('beforeunload',commitSelectedTime);document.addEventListener('visibilitychange',()=>{if(document.hidden)commitSelectedTime();else if(selected)selectedStartedAt=Date.now()});
  start();
})();
