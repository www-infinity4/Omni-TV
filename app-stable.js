(function(){
  'use strict';
  const ROOT='https://www-infinity4.github.io/';
  const REGISTRY=ROOT+'Control-Phi/channels.json';
  const RAW='https://raw.githubusercontent.com/www-infinity4/Control-Phi/main/channels.json';
  const SKIP=new Set(['Omni-TV']);
  const CACHE_KEY='omni:guide:v6';
  const AUDIENCE_KEY='omni:audience:v1';
  const CACHE_MS=5*60*1000;
  const $=id=>document.getElementById(id);
  const els={shell:$('screenShell'),frame:$('stationFrame'),grid:$('channelGrid'),clock:$('clock'),networkState:$('networkState'),channelLabel:$('channelLabel'),nowTitle:$('nowTitle'),nowMeta:$('nowMeta'),idle:$('idleCard'),loading:$('loadingCard'),loadingChannel:$('loadingChannel'),prev:$('prevChannel'),next:$('nextChannel'),wake:$('wakeChannel'),open:$('openStation'),share:$('shareButton'),search:$('channelSearch'),status:$('status'),genre:$('genreFilter'),siteCard:$('siteCard'),siteTitle:$('siteCardTitle'),siteText:$('siteCardText'),siteOpen:$('siteCardOpen')};
  const clean=v=>String(v??'').replace(/\s+/g,' ').trim();
  const safeUrl=(v,base=location.href)=>{try{const u=new URL(v,base);return /^https?:$/.test(u.protocol)?u.href:''}catch{return ''}};
  let channels=[],selected=null,tuneId=0,stationPoll=0,mode='all',selectedAt=0;
  const states=new Map(),cards=new Map(),probeTokens=new Map(),queued=new Set();
  let probeQueue=[],runningProbes=0,visibleObserver=null,audience=readJson(AUDIENCE_KEY,{});

  const overlay=document.createElement('button');overlay.type='button';overlay.className='tap-live-overlay';overlay.hidden=true;overlay.innerHTML='<span>READY</span><strong>Tap to start</strong><small>Join this channel at the live position</small>';els.shell?.appendChild(overlay);

  function readJson(key,fallback){try{return JSON.parse(localStorage.getItem(key))||fallback}catch{return fallback}}
  function writeJson(key,value){try{localStorage.setItem(key,JSON.stringify(value))}catch(_){}}
  function slugOf(item){return clean(item?.path||item?.slug||item?.repo||item?.name?.replace(/\s+/g,'-'))}
  function normalize(item,index){
    if(!item)return null;if(typeof item==='string')item={name:item,path:item};
    const slug=slugOf(item);if(!slug||SKIP.has(slug))return null;
    const type=clean(item.type).toLowerCase()==='website'?'website':'tv';
    const genres=Array.isArray(item.genres)?item.genres.map(v=>clean(v).toLowerCase()).filter(Boolean):[];
    return{name:clean(item.name||slug),slug,type,genres,index,url:safeUrl(item.url||ROOT+slug+'/',ROOT),audience:Number(item.viewerRating??item.audience??item.rating??0)||0};
  }
  function dedupe(list){const seen=new Set();return list.map(normalize).filter(Boolean).filter(item=>{const key=item.slug.toLowerCase();if(seen.has(key))return false;seen.add(key);return true})}
  async function getChannels(){for(const source of [REGISTRY,RAW]){try{const r=await fetch(source+(source.includes('?')?'&':'?')+'_omni='+Date.now(),{cache:'no-store'});if(!r.ok)continue;const data=await r.json(),list=dedupe(Array.isArray(data?.channels)?data.channels:[]);if(list.length)return list}catch(_){}}return[]}
  function clock(){return new Intl.DateTimeFormat('en-US',{hour:'numeric',minute:'2-digit'}).format(new Date())+' local'}
  function readCache(){return readJson(CACHE_KEY,{})}
  function writeCache(){const out={};states.forEach((value,key)=>{if(value?.checked)out[key]=value});writeJson(CACHE_KEY,out)}

  function stats(channel){return audience[channel.slug]||{tunes:0,dwell:0,last:0}}
  function rankScore(channel){const s=stats(channel);const recency=s.last?Math.max(0,7-(Date.now()-s.last)/86400000):0;return channel.audience*100+Math.sqrt(s.tunes||0)*10+Math.min((s.dwell||0)/60,35)+recency}
  function recordTune(channel){if(!channel)return;const s=stats(channel);audience[channel.slug]={...s,tunes:(s.tunes||0)+1,last:Date.now()};writeJson(AUDIENCE_KEY,audience)}
  function commitDwell(){if(!selected||!selectedAt)return;const seconds=Math.max(0,Math.min(1800,Math.round((Date.now()-selectedAt)/1000)));if(seconds>1){const s=stats(selected);audience[selected.slug]={...s,dwell:(s.dwell||0)+seconds,last:Date.now()};writeJson(AUDIENCE_KEY,audience)}selectedAt=0}
  function dailySeed(){const d=new Date();return Number(`${d.getFullYear()}${String(d.getMonth()+1).padStart(2,'0')}${String(d.getDate()).padStart(2,'0')}`)}
  function smartOrder(list){
    const ranked=[...list].sort((a,b)=>rankScore(b)-rankScore(a)||a.index-b.index);
    if(ranked.length<7)return ranked;
    const top=ranked.slice(0,4),rest=ranked.slice(4),out=[...top],seed=dailySeed();let turn=0;
    while(rest.length){
      if(out.length%5===4&&rest.length>2){const pick=(seed+turn*7)%rest.length;out.push(rest.splice(pick,1)[0]);turn++;}
      else out.push(rest.shift());
    }
    return out;
  }

  function currentTitle(doc){
    const selectors=['[data-now-playing]','#programTitle','#nowTitle','#nowPlaying','.now-title','.guide-row.current .program-title','.guide-row.current strong','.row.now strong','.current-program strong'];
    for(const selector of selectors){const text=clean(doc.querySelector(selector)?.textContent);if(text&&text.length<180&&!/loading|choose|please wait|tuning|station break|live network|tv guide|intermission/i.test(text))return text}return'';
  }
  function currentMeta(doc){return [...new Set(['#programTime','#nowMeta','#slotTime','.guide-row.current time','.row.now time'].map(s=>clean(doc.querySelector(s)?.textContent)).filter(Boolean))].slice(0,2).join(' · ')}
  function currentImage(doc,base){
    const src=doc.querySelector('[data-program-art] img,[data-now-art] img,.guide-row.current img,.row.now img,.current-program img')?.getAttribute?.('src')||'';if(src)return safeUrl(src,base);
    try{const raw=doc.body?.style?.getPropertyValue('--program-art')||doc.documentElement?.style?.getPropertyValue('--program-art')||'';const m=String(raw).match(/url\(["']?([^"')]+)["']?\)/i);if(m?.[1])return safeUrl(m[1],base)}catch(_){ }
    return safeUrl(doc.querySelector('meta[property="og:image"],meta[name="twitter:image"]')?.content||'',base);
  }
  function frameMatches(frame,channel){try{const here=new URL(frame.contentWindow.location.href),there=new URL(channel.url);return here.origin===there.origin&&here.pathname.replace(/\/$/,'').startsWith(there.pathname.replace(/\/$/,''))}catch{return false}}
  function capture(channel,doc,frame){
    if(!channel||!doc?.body||channel.type!=='tv')return false;if(frame&&!frameMatches(frame,channel))return false;
    const old=states.get(channel.slug)||{},title=currentTitle(doc)||old.title||'',meta=currentMeta(doc)||old.meta||'',image=currentImage(doc,channel.url)||old.image||'';
    states.set(channel.slug,{title,meta,image,checked:true,at:Date.now()});paintCard(channel.slug);writeCache();return !!title;
  }
  async function probeWebsite(channel){
    if(!channel||channel.type!=='website')return;
    const old=states.get(channel.slug)||{};if(old.checked&&Date.now()-(old.at||0)<CACHE_MS)return;
    try{const r=await fetch(channel.url+(channel.url.includes('?')?'&':'?')+'_omni_meta='+Date.now(),{cache:'no-store'});if(!r.ok)throw 0;const html=await r.text(),doc=new DOMParser().parseFromString(html,'text/html');const title=clean(doc.querySelector('meta[property="og:title"]')?.content||doc.title||channel.name),image=safeUrl(doc.querySelector('meta[property="og:image"],meta[name="twitter:image"]')?.content||'',channel.url);states.set(channel.slug,{title,meta:'Website · '+(channel.genres.slice(0,3).join(' · ')||'discover'),image,checked:true,at:Date.now()});paintCard(channel.slug);writeCache()}catch(_){states.set(channel.slug,{...old,title:old.title||channel.name,meta:'Website · tap to preview or open',checked:true,at:Date.now()});paintCard(channel.slug);writeCache()}
  }

  function makeCard(channel){
    const card=document.createElement('button');card.type='button';card.className='channel-card';card.dataset.slug=channel.slug;card.dataset.type=channel.type;card.dataset.genres=channel.genres.join(' ');
    card.innerHTML='<img class="channel-art" alt="" loading="lazy" hidden><span class="channel-shade" aria-hidden="true"></span><span class="channel-top"><span class="channel-name"></span><span class="type-badge"></span><span class="live-badge">LIVE</span></span><strong class="program-title" data-state="checking">Checking…</strong><span class="program-meta">Reading guide…</span>';
    card.querySelector('.channel-name').textContent=channel.name;card.querySelector('.type-badge').textContent=channel.type==='website'?'WEB':'TV';card.addEventListener('click',()=>select(channel));cards.set(channel.slug,card);paintCard(channel.slug);return card;
  }
  function paintCard(slug){
    const channel=channels.find(c=>c.slug===slug),card=cards.get(slug);if(!channel||!card)return;const state=states.get(slug)||{};
    const title=state.title||(channel.type==='website'?channel.name:(state.checked?'Open live schedule':'Checking what’s on…'));
    const meta=state.meta||(channel.type==='website'?'Website · '+(channel.genres.slice(0,3).join(' · ')||'discover'):(state.checked?'Tap to tune this station':'Reading station schedule…'));
    const titleEl=card.querySelector('.program-title'),metaEl=card.querySelector('.program-meta'),img=card.querySelector('.channel-art');titleEl.textContent=title;titleEl.dataset.state=state.title?'live':'checking';metaEl.textContent=meta;card.dataset.search=(channel.name+' '+title+' '+meta+' '+channel.genres.join(' ')).toLowerCase();card.dataset.score=String(rankScore(channel));if(state.image){if(img.src!==state.image)img.src=state.image;img.hidden=false}else{img.removeAttribute('src');img.hidden=true}
  }
  function populateGenres(){const set=new Set();channels.forEach(c=>c.genres.forEach(g=>set.add(g)));[...set].sort().forEach(g=>{const o=document.createElement('option');o.value=g;o.textContent=g.replace(/(^|-)([a-z])/g,(_,a,b)=>a+b.toUpperCase());els.genre.appendChild(o)})}
  function matches(channel){const term=clean(els.search?.value).toLowerCase(),genre=els.genre?.value||'all';if(mode!=='all'&&channel.type!==mode)return false;if(genre!=='all'&&!channel.genres.includes(genre))return false;if(term&&!String(cards.get(channel.slug)?.dataset.search||'').includes(term))return false;return true}
  function visibleChannels(){return smartOrder(channels.filter(matches))}
  function applyFilters(){const order=visibleChannels(),visible=new Set(order.map(c=>c.slug));order.forEach(c=>{const card=cards.get(c.slug);card.hidden=false;els.grid.appendChild(card)});cards.forEach((card,slug)=>{if(!visible.has(slug))card.hidden=true});els.networkState.textContent=`${order.length} ${mode==='website'?'WEBSITES':mode==='tv'?'LIVE CHANNELS':'TV + WEB PICKS'}`;setupVisibleScanning()}
  function renderCards(){cards.clear();const frag=document.createDocumentFragment();channels.forEach(c=>frag.appendChild(makeCard(c)));els.grid.replaceChildren(frag);populateGenres();applyFilters();markSelection();channels.filter(c=>c.type==='website').forEach(probeWebsite)}
  function markSelection(){cards.forEach((card,slug)=>card.setAttribute('aria-current',selected?.slug===slug?'true':'false'))}

  function queueProbe(channel,force=false){if(!channel||channel.type!=='tv'||selected?.slug===channel.slug)return;const state=states.get(channel.slug)||{};if(!force&&state.checked&&Date.now()-(state.at||0)<CACHE_MS)return;if(queued.has(channel.slug))return;queued.add(channel.slug);probeQueue.push(channel);pumpProbes()}
  function pumpProbes(){const max=innerWidth<=760?1:2;while(runningProbes<max&&probeQueue.length){const channel=probeQueue.shift();runningProbes++;probeFresh(channel).finally(()=>{runningProbes--;queued.delete(channel.slug);pumpProbes()})}}
  function probeFresh(channel){
    return new Promise(resolve=>{
      const token=(probeTokens.get(channel.slug)||0)+1;probeTokens.set(channel.slug,token);const frame=document.createElement('iframe');frame.className='probe-frame';frame.tabIndex=-1;frame.setAttribute('aria-hidden','true');frame.setAttribute('title','');let done=false,timer=0,limit=0;
      const validToken=()=>probeTokens.get(channel.slug)===token;const finish=(mark=true)=>{if(done)return;done=true;clearInterval(timer);clearTimeout(limit);frame.onload=null;frame.remove();if(mark&&validToken()){const state=states.get(channel.slug)||{};if(!state.checked){states.set(channel.slug,{...state,checked:true,at:Date.now()});paintCard(channel.slug);writeCache()}}resolve()};
      const inspect=()=>{if(!validToken())return finish(false);try{const doc=frame.contentDocument;if(!doc?.body||!frameMatches(frame,channel))return;const title=currentTitle(doc);if(title){capture(channel,doc,frame);finish(false)}}catch(_){ }};frame.onload=()=>{inspect();timer=setInterval(inspect,250)};limit=setTimeout(()=>{if(validToken()){try{if(frame.contentDocument?.body&&frameMatches(frame,channel))capture(channel,frame.contentDocument,frame)}catch(_){ }}finish(true)},5000);frame.src=channel.url+(channel.url.includes('?')?'&':'?')+'omni=meta&probe='+encodeURIComponent(channel.slug)+'&v='+Date.now();document.body.appendChild(frame);
    });
  }
  function setupVisibleScanning(){visibleObserver?.disconnect();visibleObserver=new IntersectionObserver(entries=>{entries.forEach(entry=>{if(!entry.isIntersecting)return;const channel=channels.find(c=>c.slug===entry.target.dataset.slug);queueProbe(channel)})},{rootMargin:'260px'});cards.forEach(card=>{if(!card.hidden)visibleObserver.observe(card)})}
  function refreshVisible(){cards.forEach((card,slug)=>{if(card.hidden)return;const r=card.getBoundingClientRect();if(r.bottom>=-260&&r.top<=innerHeight+260)queueProbe(channels.find(c=>c.slug===slug),true)})}

  function stationDoc(){try{return els.frame.contentDocument||null}catch{return null}}
  function playerShell(doc){return doc?.querySelector('[data-player-shell],.screen-shell,.player-shell,.video-shell,.screen')||doc?.querySelector('#player')?.parentElement||doc?.querySelector('.player')?.parentElement}
  function enterButton(doc){return doc?.querySelector('#enterButton,#enter,.enter-button,.enter,[data-enter-channel]')}
  function isolate(doc){try{const shell=playerShell(doc);if(!shell)return false;let node=shell;while(node&&node!==doc.body){const parent=node.parentElement;if(!parent)break;Array.from(parent.children).forEach(child=>{if(child!==node)child.style.setProperty('display','none','important')});['margin','padding'].forEach(p=>parent.style.setProperty(p,'0','important'));parent.style.setProperty('width','100%','important');parent.style.setProperty('max-width','none','important');parent.style.setProperty('height','100%','important');parent.style.setProperty('overflow','hidden','important');node=parent}doc.documentElement.style.cssText+=';margin:0!important;padding:0!important;width:100%!important;height:100%!important;overflow:hidden!important;background:#000!important';doc.body.style.cssText+=';margin:0!important;padding:0!important;width:100%!important;height:100%!important;min-height:0!important;overflow:hidden!important;background:#000!important';shell.style.cssText+=';position:fixed!important;inset:0!important;width:100vw!important;height:100vh!important;max-width:none!important;aspect-ratio:auto!important;border:0!important;border-radius:0!important;margin:0!important;transform:none!important';return true}catch{return false}}
  function syncSelected(){if(!selected||selected.type!=='tv')return false;const doc=stationDoc();if(!doc?.body)return false;capture(selected,doc);const state=states.get(selected.slug)||{};if(state.title)els.nowTitle.textContent=state.title;els.nowMeta.textContent=state.meta||('Live from '+selected.name+' · synchronized to the station clock');return true}
  function ready(generation){
    if(generation!==tuneId||!selected)return false;
    if(selected.type==='website'){els.shell.classList.add('station-ready','station-playing');els.loading.hidden=true;overlay.hidden=true;els.wake.disabled=false;els.wake.textContent='Website';els.status.textContent='';return true}
    const doc=stationDoc();if(!doc?.body||!playerShell(doc))return false;if(!isolate(doc))return false;syncSelected();els.shell.classList.add('station-ready');els.loading.hidden=true;overlay.querySelector('span').textContent='LIVE · '+selected.name;overlay.querySelector('small').textContent=(states.get(selected.slug)||{}).title||'Join at the current live position';overlay.hidden=false;els.wake.disabled=false;els.wake.textContent='Tap to start';els.status.textContent='';return true;
  }
  function showWebsiteFallback(channel){els.siteTitle.textContent=channel.name;els.siteText.textContent='This website cannot be shown inside Omni TV. Open it directly, or use CH− / CH+ to keep surfing.';els.siteCard.hidden=false;els.loading.hidden=true;els.wake.disabled=false;els.wake.textContent='Open website';els.status.textContent='Website preview blocked; surfing still works.'}
  function isInternal(channel){try{return new URL(channel.url).hostname==='www-infinity4.github.io'}catch{return false}}

  function select(channel){
    if(!channel)return;commitDwell();selected=channel;selectedAt=Date.now();recordTune(channel);probeTokens.set(selected.slug,(probeTokens.get(selected.slug)||0)+1);tuneId++;const generation=tuneId,state=states.get(selected.slug)||{};markSelection();applyFilters();els.idle.hidden=true;els.siteCard.hidden=true;els.loading.hidden=false;els.loadingChannel.textContent=(selected.type==='website'?'Opening ':'Tuning ')+selected.name+'…';els.shell.classList.remove('station-ready','station-playing');overlay.hidden=true;els.channelLabel.textContent=(selected.type==='website'?'WEB · ':'LIVE · ')+selected.name;els.nowTitle.textContent=state.title||selected.name;els.nowMeta.textContent=state.meta||(selected.type==='website'?'Website discovery · open here or directly.':'Preparing the live player without leaving Omni TV.');els.open.disabled=false;els.open.textContent=selected.type==='website'?'Open website':'Open station';els.wake.disabled=true;els.wake.textContent=selected.type==='website'?'Opening…':'Tuning…';els.status.textContent='';clearInterval(stationPoll);
    if(selected.type==='website'&&!isInternal(selected)){els.frame.removeAttribute('src');showWebsiteFallback(selected);history.replaceState(null,'','#'+encodeURIComponent(selected.slug));return}
    els.frame.src=selected.url+(selected.url.includes('?')?'&':'?')+'omni='+(selected.type==='website'?'site':'player')+'&v='+Date.now();history.replaceState(null,'','#'+encodeURIComponent(selected.slug));let tries=0;stationPoll=setInterval(()=>{if(generation!==tuneId){clearInterval(stationPoll);return}tries++;if(ready(generation)){clearInterval(stationPoll);if(selected.type==='tv')stationPoll=setInterval(syncSelected,2000);return}if(tries>80){clearInterval(stationPoll);els.loading.hidden=true;if(selected.type==='website')showWebsiteFallback(selected);else{els.status.textContent='This station player needs repair; Open station still works.';els.wake.textContent='Player unavailable'}}},150);
  }
  function surf(step){const list=visibleChannels();if(!list.length)return;let i=selected?list.findIndex(c=>c.slug===selected.slug):-1;if(i<0)i=step>0?-1:0;select(list[(i+step+list.length)%list.length])}
  function wake(){if(!selected)return;if(selected.type==='website'){if(els.siteCard.hidden){els.wake.textContent='Website';els.status.textContent=selected.name+' is open in Omni TV.'}else window.open(selected.url,'_blank','noopener');return}const doc=stationDoc();if(!doc?.body)return;try{enterButton(doc)?.click()}catch(_){ }isolate(doc);els.shell.classList.add('station-ready','station-playing');overlay.hidden=true;els.wake.disabled=false;els.wake.textContent='Live';els.status.textContent=selected.name+' joined live.';syncSelected()}
  function fromHash(){const slug=decodeURIComponent(location.hash.slice(1)||'').toLowerCase();if(!slug)return false;const channel=channels.find(c=>c.slug.toLowerCase()===slug);if(channel){select(channel);return true}return false}
  async function share(){const state=selected?(states.get(selected.slug)||{}):{},title=state.title||selected?.name||'Omni TV',payload={title:selected?title+' · Omni TV':'Omni TV — Channel + Website Surfer',text:selected?(selected.type==='website'?'Found '+selected.name+' while surfing Omni TV.':'Watching '+title+' live from '+selected.name+' inside Omni TV.'):'Flip through live TV channels and useful websites on one remote.',url:location.href};try{if(navigator.share){await navigator.share(payload);els.status.textContent='Shared. News Phi received this completed share.'}else{await navigator.clipboard.writeText(payload.url);els.status.textContent='Omni TV link copied.'}}catch(e){if(e?.name!=='AbortError')els.status.textContent='Share did not complete.'}}
  function setMode(next){mode=next;document.querySelectorAll('[data-mode]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.mode===mode)));applyFilters()}

  async function start(){
    els.clock.textContent=clock();setInterval(()=>els.clock.textContent=clock(),1000);const cached=readCache();Object.entries(cached).forEach(([slug,state])=>{if(state&&Date.now()-(state.at||0)<CACHE_MS)states.set(slug,state)});channels=await getChannels();renderCards();if(!channels.length){els.status.textContent='Channel registry did not load.';return}if(!fromHash())els.nowMeta.textContent='Choose a channel or website below. CH− / CH+ follows the filters you choose.';setInterval(refreshVisible,CACHE_MS);
  }
  els.frame.addEventListener('load',()=>{const generation=tuneId;if(selected?.type==='website'){setTimeout(()=>ready(generation),100);return}[0,150,500,1000].forEach(ms=>setTimeout(()=>ready(generation),ms))});overlay.addEventListener('click',wake);els.prev.addEventListener('click',()=>surf(-1));els.next.addEventListener('click',()=>surf(1));els.wake.addEventListener('click',wake);els.open.addEventListener('click',()=>selected&&window.open(selected.url,'_blank','noopener'));els.siteOpen.addEventListener('click',()=>selected&&window.open(selected.url,'_blank','noopener'));els.share.addEventListener('click',share);els.search.addEventListener('input',applyFilters);els.genre.addEventListener('change',applyFilters);document.querySelectorAll('[data-mode]').forEach(b=>b.addEventListener('click',()=>setMode(b.dataset.mode)));window.addEventListener('hashchange',fromHash);window.addEventListener('pagehide',commitDwell);document.addEventListener('visibilitychange',()=>{if(document.hidden)commitDwell();else if(selected)selectedAt=Date.now()});start();
})();
