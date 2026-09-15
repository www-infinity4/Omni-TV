(function(root){
  'use strict';

  const VERSION='20260915-playback4';
  const seed=Array.isArray(root.__INFINITY_MOVIE_SEED_CATALOG)?root.__INFINITY_MOVIE_SEED_CATALOG.map(item=>({...item})):[];
  const catalog=root.HERMIT_CATALOG;
  const profile=root.INFINITY_MOVIE_SOURCE||{};
  const engine=root.HermitEngine;
  if(!Array.isArray(catalog)||!engine)return;

  function clean(value){return String(value||'').toLowerCase().replace(/\b(full|free|hd|movie|film|watch|english|official|feature)\b/g,' ').replace(/[^a-z0-9]+/g,' ').replace(/\s+/g,' ').trim()}
  function playable(item){const runtime=Number(item&&item.runtimeSeconds)||0;return !!(item&&item.videoId&&item.cleared!==false&&runtime>=3600&&runtime<=7200)}
  function channelId(){return String(profile.channelId||'MOVIE').toUpperCase()}
  function seedBelongsHere(item){
    if(!item)return false;
    if(item.networkChannel&&String(item.networkChannel).toUpperCase()===channelId())return true;
    const label=`${item.source||''} ${item.collection||''}`.toLowerCase();
    const names=String(profile.sourceName||'').toLowerCase().split('+').map(value=>value.trim()).filter(value=>value.length>3);
    return names.some(name=>label.includes(name));
  }
  function restoreCatalog(){
    const merged=[],ids=new Set(),titles=new Set();
    const add=item=>{
      if(!item)return;
      const id=String(item.videoId||item.id||'').trim();
      const title=clean(item.originalTitle||item.title||id);
      const key=id?`id:${id}`:`title:${title}`;
      if(!key||key==='title:'||ids.has(key)||titles.has(title))return;
      ids.add(key);if(title)titles.add(title);merged.push(item);
    };
    seed.forEach(add);
    catalog.forEach(add);
    catalog.splice(0,catalog.length,...merged);
    return catalog;
  }
  function verifiedPool(){
    const out=[],ids=new Set(),titles=new Set();
    const candidates=[...catalog,...seed.filter(seedBelongsHere)];
    for(const item of candidates){
      if(!playable(item))continue;
      const id=String(item.videoId),title=clean(item.originalTitle||item.title||id);
      if(ids.has(id)||titles.has(title))continue;
      ids.add(id);titles.add(title);out.push(item);
    }
    return out;
  }
  function effectiveStatus(pool){
    const base=root.INFINITY_MOVIE_SOURCE_STATUS||{};
    const minimum=Math.max(1,Number(base.minimum||profile.minimumReadyCount||84));
    const target=Math.max(minimum,Number(base.target||profile.targetCount||96));
    return {...base,version:VERSION,channelId:base.channelId||profile.channelId||'MOVIE',count:pool.length,minimum,target,ready:pool.length>=minimum,sourceName:base.sourceName||profile.sourceName||'YouTube',playableNow:pool.length>0,curatedCount:seed.length,catalogCount:catalog.length};
  }
  function prettyChannel(status){return String(status.channelId||'Movie').replace(/-/g,' ').replace(/\b\w/g,m=>m.toUpperCase())}
  function render(status){
    root.INFINITY_MOVIE_SOURCE_STATUS=status;
    const button=document.getElementById('enterButton');if(!button)return;
    button.disabled=false;
    button.removeAttribute('aria-busy');
    const strong=button.querySelector('span')||button,small=button.querySelector('small');
    if(strong&&status.playableNow&&/^Building\b/i.test(strong.textContent||''))strong.textContent=`Enter ${prettyChannel(status)}`;
    if(small){
      const value=status.ready?'Curated lineup preserved · verified source additions ready':`${status.count}/${status.minimum} verified additions · curated channel catalog preserved while verification continues`;
      if(small.textContent!==value)small.textContent=value;
    }
  }
  function restoreSchedule(){
    if(typeof engine.__infinityPlaybackOriginalCreateDaySchedule==='function'){
      engine.createDaySchedule=engine.__infinityPlaybackOriginalCreateDaySchedule;
    }
    engine.__infinitySourceGate=false;
    engine.__infinityPlaybackGuard=false;
  }
  function refresh(){
    restoreCatalog();
    const pool=verifiedPool();
    const status=effectiveStatus(pool);
    restoreSchedule();
    render(status);
    root.dispatchEvent(new CustomEvent('infinity:movie-playback-guard',{detail:status}));
    return status;
  }

  if(!engine.__infinityPlaybackOriginalCreateDaySchedule&&typeof engine.createDaySchedule==='function'){
    engine.__infinityPlaybackOriginalCreateDaySchedule=engine.__infinitySourceOriginalCreateDaySchedule||engine.createDaySchedule;
  }
  refresh();
  ['infinity:movie-catalog-cache','infinity:movie-catalog-progress','infinity:movie-catalog-ready','infinity:movie-catalog-error'].forEach(name=>root.addEventListener(name,()=>setTimeout(refresh,0)));
  root.InfinityMoviePlaybackGuard={VERSION,refresh,restoreCatalog};
})(window);