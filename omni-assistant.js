(function(){
  "use strict";

  const GPT_ENDPOINT="https://infinity-rogers.marvaseater.workers.dev/v1/chat";
  const INFINITY_PHI="https://www-infinity4.github.io/C13b0/phi";
  const OMNI_PHI="https://www-infinity4.github.io/Omni-Phi/overview/";
  const CODE_PHI="https://www-infinity4.github.io/C13b0/phi/code/";
  const CREATE_PHI="https://www-infinity4.github.io/C13b0/phi/create/";
  const MEMORY_KEY="omniTV:gptConversation:v1";

  const form=document.getElementById("omniIntentForm");
  const input=document.getElementById("omniIntentInput");
  const submit=document.getElementById("omniIntentGo");
  const panel=document.getElementById("omniChatPanel");
  const transcript=document.getElementById("omniChatTranscript");
  const status=document.getElementById("omniAssistantStatus");
  const clear=document.getElementById("omniChatClear");
  const buttons=[...document.querySelectorAll("[data-omni-intent]")];
  if(!form||!input||!submit||!panel||!transcript||!buttons.length)return;

  const active=new Set();
  let conversation=[];
  try{
    const stored=JSON.parse(localStorage.getItem(MEMORY_KEY)||"[]");
    if(Array.isArray(stored))conversation=stored.slice(-12);
  }catch(_){conversation=[];}

  function save(){
    try{localStorage.setItem(MEMORY_KEY,JSON.stringify(conversation.slice(-12)));}catch(_){}
  }

  function escMode(value){return String(value||"").toLowerCase().replace(/[^a-z]/g,"");}

  function researchEngine(){return active.has("search")?"Omni Phi":"Infinity Phi";}

  function taskLabel(){
    const tasks=[];
    if(active.has("code"))tasks.push("code/build");
    if(active.has("create"))tasks.push("create/document");
    return tasks.join(" + ");
  }

  function updateUI(){
    buttons.forEach(button=>{
      const mode=escMode(button.dataset.omniIntent);
      const pressed=active.has(mode);
      button.classList.toggle("active",pressed);
      button.setAttribute("aria-pressed",pressed?"true":"false");
    });

    const gpt=active.has("gpt");
    panel.hidden=!gpt;
    form.classList.toggle("gpt-active",gpt);

    if(gpt){
      const task=taskLabel();
      input.placeholder=task?`Ask GPT to ${task} using ${researchEngine()}…`:`Message GPT with ${researchEngine()} available…`;
      submit.textContent="GPT";
      submit.setAttribute("aria-label","Send message to GPT");
    }else if(active.has("code")&&active.has("search")){
      input.placeholder="Research with Omni Phi, then build or code…";
      submit.textContent="Build";
    }else if(active.has("create")&&active.has("search")){
      input.placeholder="Research with Omni Phi, then create…";
      submit.textContent="Create";
    }else if(active.has("code")){
      input.placeholder="Describe the website, app, or code you need…";
      submit.textContent="Code";
    }else if(active.has("create")){
      input.placeholder="Describe the invoice, spreadsheet, document, or item to create…";
      submit.textContent="Create";
    }else if(active.has("search")){
      input.placeholder="Search deeper with Omni Phi…";
      submit.textContent="Search";
    }else{
      input.placeholder="Search the web with Infinity Phi";
      submit.textContent="Search";
    }

    if(status){
      const selected=[...active].map(v=>v.toUpperCase()).join(" + ");
      status.textContent=selected?`${selected} · ${researchEngine()}`:`Default · Infinity Phi search`;
    }
  }

  function addMessage(role,text){
    const item=document.createElement("article");
    item.className=`omni-chat-message ${role}`;
    const who=document.createElement("strong");
    who.textContent=role==="user"?"You":"GPT";
    const body=document.createElement("div");
    body.textContent=String(text||"");
    item.append(who,body);
    transcript.appendChild(item);
    transcript.scrollTop=transcript.scrollHeight;
  }

  function renderHistory(){
    transcript.innerHTML="";
    conversation.forEach(message=>addMessage(message.role,message.content));
  }

  function routeNonGPT(query){
    const engine=researchEngine();
    const params=new URLSearchParams({q:query,run:"1",research:engine});
    if(active.has("code")){
      if(active.has("create"))params.set("also_create","1");
      location.href=`${CODE_PHI}?${params}`;
      return;
    }
    if(active.has("create")){
      location.href=`${CREATE_PHI}?${params}`;
      return;
    }
    if(active.has("search")){
      location.href=`${OMNI_PHI}?${new URLSearchParams({q:query,mode:"search",source:"omni-tv"})}`;
      return;
    }
    location.href=`${INFINITY_PHI}?${new URLSearchParams({q:query,run:"1",source:"omni-tv"})}`;
  }

  async function askGPT(query){
    const userMessage={role:"user",content:query};
    conversation=[...conversation,userMessage].slice(-12);
    addMessage("user",query);
    save();
    input.value="";
    input.focus();
    submit.disabled=true;
    submit.textContent="…";
    if(status)status.textContent=`GPT thinking · ${researchEngine()} available`;

    try{
      const response=await fetch(GPT_ENDPOINT,{
        method:"POST",
        headers:{"Content-Type":"application/json","Accept":"application/json"},
        body:JSON.stringify({
          assistant:"gpt",
          input:query,
          context:{
            application:"Omni TV",
            conversation:conversation.slice(0,-1),
            active_modes:[...active],
            research_engine:researchEngine(),
            task_intent:taskLabel()||"general assistance",
            playback:{
              channel:document.getElementById("channelLabel")?.textContent||"",
              title:document.getElementById("nowTitle")?.textContent||"",
              meta:document.getElementById("nowMeta")?.textContent||""
            },
            verified_context:"The user is interacting from Omni TV. Search means use Omni Phi research context. Code means help build software or a website. Create means help produce documents, invoices, spreadsheets, media, or other requested artifacts. Do not claim a repository or page was changed unless an actual tool or verified system performed that change."
          }
        })
      });
      const payload=await response.json().catch(()=>({}));
      if(!response.ok)throw new Error(payload.message||payload.error||`GPT request failed (${response.status})`);
      const text=String(payload.output_text||payload.output||"").trim();
      if(!text)throw new Error("GPT returned an empty response");
      conversation=[...conversation,{role:"assistant",content:text}].slice(-12);
      save();
      addMessage("assistant",text);
      if(status)status.textContent=`GPT ready · ${researchEngine()}`;
    }catch(error){
      addMessage("assistant",`I couldn't reach the GPT gateway from Omni TV. ${error&&error.message?error.message:"Please try again."}`);
      if(status)status.textContent="GPT gateway unavailable · search tools still work";
    }finally{
      submit.disabled=false;
      updateUI();
    }
  }

  buttons.forEach(button=>button.addEventListener("click",()=>{
    const mode=escMode(button.dataset.omniIntent);
    if(!mode)return;
    if(active.has(mode))active.delete(mode);else active.add(mode);
    updateUI();
    input.focus();
  }));

  form.addEventListener("submit",event=>{
    event.preventDefault();
    const query=input.value.trim();
    if(!query){input.focus();return;}
    if(active.has("gpt"))void askGPT(query);else routeNonGPT(query);
  });

  input.addEventListener("keydown",event=>{
    if(event.key==="Enter"&&!event.shiftKey&&!event.isComposing){
      event.preventDefault();
      form.requestSubmit();
    }
  });

  clear?.addEventListener("click",()=>{
    conversation=[];
    save();
    renderHistory();
    if(status)status.textContent="GPT conversation cleared";
  });

  renderHistory();
  updateUI();
})();
