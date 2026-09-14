(function(){
  'use strict';

  function stabilizeSelector(){
    const sort=document.getElementById('sortMode');
    if(!sort)return;
    const unstable=sort.querySelector('option[value="top"]');
    if(unstable)unstable.remove();
    if(sort.value!=='network')sort.value='network';
  }

  // This script loads before app-stable.js. Force a deterministic network order
  // before the Omni selector starts so tuning a destination cannot reshuffle CH+/CH-.
  stabilizeSelector();
  window.addEventListener('pageshow',()=>{
    const sort=document.getElementById('sortMode');
    if(!sort)return;
    const changed=sort.value!=='network';
    stabilizeSelector();
    if(changed)sort.dispatchEvent(new Event('change',{bubbles:true}));
  });

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
