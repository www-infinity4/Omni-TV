(function(){
  'use strict';
  const ROOT='https://www-infinity4.github.io/';
  const REGISTRY=ROOT+'Control-Phi/channels.json';
  const RAW='https://raw.githubusercontent.com/www-infinity4/Control-Phi/main/channels.json';
  const NON_TV=new Set(['News-Phi','Control-Phi','Omni-TV','Hydrogen-Digital-TV']);
  const CACHE_KEY='omni:guide:v5';
  const CACHE_MS=5*60*1000;
  const $=id=>document.getElementById(id);
  const els={shell:$('screenShell'),frame:$('stationFrame'),grid:$('channelGrid'),clock:$('clock'),networkState:$('networkState'),channelLabel:$('channelLabel'),nowTitle:$('nowTitle'),nowMeta:$('nowMeta'),idle:$('idleCard'),loading:$('loadingCard'),loadingChannel:$('loadingChannel'),prev:$('prevChannel'),next:$('nextChannel'),wake:$('wakeChannel'),open:$('openStation'),share:$('shareButton'),search:$('channelSearch'),status:$('status')};
  const clean=v=>String(v??'').replace(/\s+/g,' ').trim();
  const safeUrl=(v,base=location.href)=>{try{const u=new URL(v,base);return /^https?:$/.test(u.protocol)?u.href:''}catch{return ''}};
  let channels=[],selectedIndex=-1,selected=null,tuneId=0,stationPoll=0;
  const states=new Map(),cards=new Map(),probeTokens=new Map(),queued=new Set();
  let probeQueue=[],runningProbes=0,visibleObserver=null;

  const overlay=document.createElement('button');overlay.type='button';overlay.className='tap-live-overlay';overlay.hidden=true;overlay.innerHTML='<span>READY</span><strong>Tap to start</strong><small>Join this channel at the live position</small>';els.shell?.appendChild(overlay);

  function slugOf(item){return clean(item?.path||item?.slug||item?.repo||item?.name?.replace(/\s+/g,'-'))}
  function normalize(item){if(!item)return null;if(typeof item==='string')item={name:item,path:item};const slug=slugOf(item);if(!slug||NON_TV.has(slug))return null;return{name:clean(item.name||slug),slug,url:safeUrl(item.url||ROOT+slug+'/',ROOT)}}
  function dedupe(list){const seen=new Set();return list.map(normalize).filter(Boolean).filter(item=>{const key=item.slug.toLowerCase();if(seen.has(key))return false;seen.add(key);return true})}
  async function getChannels(){for(const source of [REGISTRY,RAW]){try{const r=await fetch(source+(source.includes('?')?'&':'?')+'_omni='+Date.now(),{cache:'no-store'});if(!r.ok)continue;const data=await r.json(),list=dedupe(Array.isArray(data?.channels)?data.channels:[]);if(list.length)return list}catch(_){}}return[]}
  function clock(){return new Intl.DateTimeFormat('en-US',{hour:'numeric',minute:'2-digit'}).format(new Date())+' local'}
  function readCache(){try{return JSON.parse(localStorage.getItem(CACHE_KEY))||{}}catch{return {}}}
  function writeCache(){try{const out={};states.forEach((value,key)=>{if(value?.checked)out[key]=value});localStorage.setItem(CACHE_KEY,JSON.stringify(out))}catch(_){}}

  function currentTitle(doc){
    const selectors=['[data-now-playing]','#programTitle','#nowTitle','#nowPlaying','.now-title','.guide-row.current .program-title','.guide-row.current strong','.row.now strong','.current-program strong'];
    for(const selector of selectors){const text=clean(doc.querySelector(selector)?.textContent);if(text&&text.length<180&&!/loading|choose|please wait|tuning|station break|live network|tv guide|intermission/i.test(text))return text}return''
  }
  function currentMeta(doc){return [...new Set(['#programTime','#nowMeta','#slotTime','.guide-row.current time','.row.now time'].map(s=>clean(doc.querySelector(s)?.textContent)).filter(Boolean))].slice(0,2).join(' · ')}
  function currentImage(doc,base){
    const src=doc.querySelector('[data-program-art] img,[data-now-art] img,.guide-row.current img,.row.now img,.current-program img')?.getAttribute?.('src')||'';if(src)return safeUrl(src,base);
    try{const raw=doc.body?.style?.getPropertyValue('--program-art')||doc.documentElement?.style?.getPropertyValue('--program-art')||'';const m=String(raw).match(/url\(["']?([^"')]+)["']?\)/i);if(m?.[1])return safeUrl(m[1],base)}catch(_){ }
    return safeUrl(doc.querySelector('meta[property="og:image"],meta[name="twitter:image"]')?.content||'',base)
  }
  function frameMatches(frame,channel){try{const path=frame.contentWindow.location.pathname.split('/').filter(Boolean)[0]||'';return path.toLowerCase()===channel.slug.toLowerCase()}catch{return false}}
  function capture(channel,doc,frame){
    if(!channel||!doc?.body)return false;
    if(frame&&!frameMatches(frame,channel))return false;
    const old=states.get(channel.slug)||{},title=currentTitle(doc)||old.title||'',meta=currentMeta(doc)||old.meta||'',image=currentImage(doc,channel.url)||old.image||'';
    states.set(channel.slug,{title,meta,image,checked:true,at:Date.now()});paintCard(channel.slug);writeCache();return !!title
  }

  function makeCard(channel,index){
    const card=document.createElement('button');card.type='button';card.className='channel-card';card.dataset.index=String(index);card.dataset.slug=channel.slug;card.innerHTML='<img class="channel-art" alt="" loading="lazy" hidden><span class="channel-shade" aria-hidden="true"></span><span class="channel-top"><span class="channel-name"></span><span class="live-badge">LIVE</span></span><strong class="program-title" data-state="checking">Checking what’s on…</strong><span class="program-meta">Reading station schedule…</span>';card.querySelector('.channel-name').textContent=channel.name;card.addEventListener('click',()=>select(index));cards.set(channel.slug,card);paintCard(channel.slug);return card
  }
  function paintCard(slug){const channel=channels.find(c=>c.slug===slug),card=cards.get(slug);if(!channel||!card)return;const state=states.get(slug)||{},title=state.title||(state.checked?'Open live schedule':'Checking what’s on…'),meta=state.meta||(state.checked?'Tap to tune this station':'Reading station schedule…');const titleEl=card.querySelector('.program-title'),metaEl=card.querySelector('.program-meta'),img=card.querySelector('.channel-art');titleEl.textContent=title;titleEl.dataset.state=state.title?'live':'checking';metaEl.textContent=meta;card.dataset.search=(channel.name+' '+title+' '+meta).toLowerCase();if(state.image){if(img.src!==state.image)img.src=state.image;img.hidden=false}else{img.removeAttribute('src');img.hidden=true}}
  function renderCards(){cards.clear();const frag=document.createDocumentFragment();channels.forEach((c,i)=>frag.appendChild(makeCard(c,i)));els.grid.replaceChildren(frag);filter();markSelection();els.networkState.textContent=channels.length?channels.length+' LIVE CHANNELS':'CHANNEL REGISTRY OFFLINE';setupVisibleScanning()}
  function filter(){const term=clean(els.search?.value).toLowerCase();cards.forEach(card=>card.hidden=!!term&&!String(card.dataset.search||'').includes(term))}
  function markSelection(){cards.forEach((card,slug)=>card.setAttribute('aria-current',selected?.slug===slug?'true':'false'))}

  function queueProbe(channel,force=false){
    if(!channel||selected?.slug===channel.slug)return;
    const state=states.get(channel.slug)||{};
    if(!force&&state.checked&&Date.now()-(state.at||0)<CACHE_MS)return;
    if(queued.has(channel.slug))return;
    queued.add(channel.slug);probeQueue.push(channel);pumpProbes();
  }
  function pumpProbes(){const max=innerWidth<=760?1:2;while(runningProbes<max&&probeQueue.length){const channel=probeQueue.shift();runningProbes++;probeFresh(channel).finally(()=>{runningProbes--;queued.delete(channel.slug);pumpProbes()})}}
  function probeFresh(channel){
    return new Promise(resolve=>{
      const token=(probeTokens.get(channel.slug)||0)+1;probeTokens.set(channel.slug,token);
      const frame=document.createElement('iframe');frame.className='probe-frame';frame.tabIndex=-1;frame.setAttribute('aria-hidden','true');frame.setAttribute('title','');
      let done=false,timer=0,limit=0;
      const validToken=()=>probeTokens.get(channel.slug)===token;
      const finish=(mark=true)=>{if(done)return;done=true;clearInterval(timer);clearTimeout(limit);frame.onload=null;frame.remove();if(mark&&validToken()){const state=states.get(channel.slug)||{};if(!state.checked){states.set(channel.slug,{...state,checked:true,at:Date.now()});paintCard(channel.slug);writeCache()}}resolve()};
      const inspect=()=>{if(!validToken())return finish(false);try{const doc=frame.contentDocument;if(!doc?.body||!frameMatches(frame,channel))return;const title=currentTitle(doc);if(title){capture(channel,doc,frame);finish(false)}}catch(_){ }};
      frame.onload=()=>{inspect();timer=setInterval(inspect,250)};
      limit=setTimeout(()=>{if(validToken()){try{if(frame.contentDocument?.body&&frameMatches(frame,channel))capture(channel,frame.contentDocument,frame)}catch(_){ } }finish(true)},5000);
      const sep=channel.url.includes('?')?'&':'?';frame.src=channel.url+sep+'omni=meta&probe='+encodeURIComponent(channel.slug)+'&v='+Date.now();document.body.appendChild(frame);
    })
  }
  function setupVisibleScanning(){
    visibleObserver?.disconnect();
    visibleObserver=new IntersectionObserver(entries=>{entries.forEach(entry=>{if(!entry.isIntersecting)return;const slug=entry.target.dataset.slug,channel=channels.find(c=>c.slug===slug);queueProbe(channel)})},{rootMargin:'260px'});
    cards.forEach(card=>visibleObserver.observe(card));
  }
  function refreshVisible(){cards.forEach((card,slug)=>{if(card.hidden)return;const r=card.getBoundingClientRect();if(r.bottom>=-260&&r.top<=innerHeight+260)queueProbe(channels.find(c=>c.slug===slug),true)})}

  function stationDoc(){try{return els.frame.contentDocument||null}catch{return null}}
  function playerShell(doc){return doc?.querySelector('[data-player-shell],.screen-shell,.player-shell,.video-shell,.screen')||doc?.querySelector('#player')?.parentElement||doc?.querySelector('.player')?.parentElement}
  function enterButton(doc){return doc?.querySelector('#enterButton,#enter,.enter-button,.enter,[data-enter-channel]')}
  function isolate(doc){try{const shell=playerShell(doc);if(!shell)return false;let node=shell;while(node&&node!==doc.body){const parent=node.parentElement;if(!parent)break;Array.from(parent.children).forEach(child=>{if(child!==node)child.style.setProperty('display','none','important')});['margin','padding'].forEach(p=>parent.style.setProperty(p,'0','important'));parent.style.setProperty('width','100%','important');parent.style.setProperty('max-width','none','important');parent.style.setProperty('height','100%','important');parent.style.setProperty('overflow','hidden','important');node=parent}doc.documentElement.style.cssText+=';margin:0!important;padding:0!important;width:100%!important;height:100%!important;overflow:hidden!important;background:#000!important';doc.body.style.cssText+=';margin:0!important;padding:0!important;width:100%!important;height:100%!important;min-height:0!important;overflow:hidden!important;background:#000!important';shell.style.cssText+=';position:fixed!important;inset:0!important;width:100vw!important;height:100vh!important;max-width:none!important;aspect-ratio:auto!important;border:0!important;border-radius:0!important;margin:0!important;transform:none!important';return true}catch{return false}}
  function syncSelected(){if(!selected)return false;const doc=stationDoc();if(!doc?.body)return false;capture(selected,doc);const state=states.get(selected.slug)||{};if(state.title)els.nowTitle.textContent=state.title;els.nowMeta.textContent=state.meta||('Live from '+selected.name+' · synchronized to the station clock');return true}
  function ready(generation){if(generation!==tuneId||!selected)return false;const doc=stationDoc();if(!doc?.body||!playerShell(doc))return false;if(!isolate(doc))return false;syncSelected();els.shell.classList.add('station-ready');els.loading.hidden=true;overlay.querySelector('span').textContent='LIVE · '+selected.name;overlay.querySelector('small').textContent=(states.get(selected.slug)||{}).title||'Join at the current live position';overlay.hidden=false;els.wake.disabled=false;els.wake.textContent='Tap to start';els.status.textContent='';return true}

  function select(index){if(!channels.length)return;index=(index+channels.length)%channels.length;selectedIndex=index;selected=channels[index];probeTokens.set(selected.slug,(probeTokens.get(selected.slug)||0)+1);tuneId++;const generation=tuneId,state=states.get(selected.slug)||{};markSelection();els.idle.hidden=true;els.loading.hidden=false;els.loadingChannel.textContent='Tuning '+selected.name+'…';els.shell.classList.remove('station-ready','station-playing');overlay.hidden=true;els.channelLabel.textContent='LIVE · '+selected.name;els.nowTitle.textContent=state.title||('Tuning '+selected.name);els.nowMeta.textContent=state.meta||'Preparing the live player without leaving Omni TV.';els.open.disabled=false;els.wake.disabled=true;els.wake.textContent='Tuning…';els.status.textContent='';els.frame.src=selected.url+(selected.url.includes('?')?'&':'?')+'omni=player&v='+Date.now();history.replaceState(null,'','#'+encodeURIComponent(selected.slug));clearInterval(stationPoll);let tries=0;stationPoll=setInterval(()=>{if(generation!==tuneId){clearInterval(stationPoll);return}tries++;if(ready(generation)){clearInterval(stationPoll);stationPoll=setInterval(syncSelected,2000);return}if(tries>80){clearInterval(stationPoll);els.loading.hidden=true;els.status.textContent='This station player needs repair; Open station still works.';els.wake.textContent='Player unavailable'}},150)}
  function wake(){if(!selected)return;const doc=stationDoc();if(!doc?.body)return;try{enterButton(doc)?.click()}catch(_){ }isolate(doc);els.shell.classList.add('station-ready','station-playing');overlay.hidden=true;els.wake.disabled=false;els.wake.textContent='Live';els.status.textContent=selected.name+' joined live.';syncSelected()}
  function fromHash(){const slug=decodeURIComponent(location.hash.slice(1)||'').toLowerCase();if(!slug)return false;const index=channels.findIndex(c=>c.slug.toLowerCase()===slug);if(index>=0){select(index);return true}return false}
  async function share(){const state=selected?(states.get(selected.slug)||{}):{},title=state.title||selected?.name||'Omni TV',payload={title:selected?title+' · Omni TV':'Omni TV — Live Network Surfer',text:selected?'Watching '+title+' live from '+selected.name+' inside Omni TV.':'Flip through the Infinity TV network live on one page.',url:location.href};try{if(navigator.share){await navigator.share(payload);els.status.textContent='Shared. News Phi received this completed share.'}else{await navigator.clipboard.writeText(payload.url);els.status.textContent='Omni TV link copied.'}}catch(e){if(e?.name!=='AbortError')els.status.textContent='Share did not complete.'}}

  async function start(){
    els.clock.textContent=clock();setInterval(()=>els.clock.textContent=clock(),1000);
    const cached=readCache();Object.entries(cached).forEach(([slug,state])=>{if(state&&Date.now()-(state.at||0)<CACHE_MS)states.set(slug,state)});
    channels=await getChannels();renderCards();if(!channels.length){els.status.textContent='Channel registry did not load.';return}if(!fromHash())els.nowMeta.textContent='Choose any channel below. Omni TV will open its live player here.';setInterval(refreshVisible,CACHE_MS)
  }
  els.frame.addEventListener('load',()=>{const generation=tuneId;[0,150,500,1000].forEach(ms=>setTimeout(()=>ready(generation),ms))});overlay.addEventListener('click',wake);els.prev.addEventListener('click',()=>select(selectedIndex<0?channels.length-1:selectedIndex-1));els.next.addEventListener('click',()=>select(selectedIndex<0?0:selectedIndex+1));els.wake.addEventListener('click',wake);els.open.addEventListener('click',()=>selected&&window.open(selected.url,'_blank','noopener'));els.share.addEventListener('click',share);els.search.addEventListener('input',filter);window.addEventListener('hashchange',fromHash);start();
})();
