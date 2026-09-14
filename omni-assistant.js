(function(){
  "use strict";

  const GPT_ENDPOINT="https://infinity-rogers.marvaseater.workers.dev/v1/chat";
  const INFINITY_PHI="https://www-infinity4.github.io/C13b0/phi";
  const OMNI_PHI="https://www-infinity4.github.io/Omni-Phi/overview/";
  const CODE_PHI="https://www-infinity4.github.io/C13b0/phi/code/";
  const CREATE_PHI="https://www-infinity4.github.io/C13b0/phi/create/";
  const MEMORY_KEY="omniTV:gptConversation:v1";

  function installUI(){
    const tools=document.querySelector(".omni-tools");
    const form=tools?.querySelector("form.omni-web-search");
    const input=form?.querySelector("input[type='search'],input[name='q'],textarea");
    const submit=form?.querySelector("button[type='submit'],button:not([type])");
    if(!tools||!form||!input||!submit)return null;
    if(document.getElementById("omniIntentModes"))return {
      form:document.getElementById("omniIntentForm"),
      input:document.getElementById("omniIntentInput"),
      submit:document.getElementById("omniIntentGo"),
      panel:document.getElementById("omniChatPanel"),
      transcript:document.getElementById("omniChatTranscript"),
      status:document.getElementById("omniAssistantStatus"),
      clear:document.getElementById("omniChatClear")
    };

    const style=document.createElement("style");
    style.id="omni-assistant-style";
    style.textContent=`
      .omni-tools{grid-template-columns:1fr!important;gap:12px!important}
      .omni-mode-row{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:9px}
      .omni-mode-button{min-height:62px;border-radius:20px;border:1px solid rgba(127,157,255,.82);color:#fff;background:linear-gradient(120deg,rgba(15,64,135,.96),rgba(30,21,99,.96) 55%,rgba(101,21,131,.96));box-shadow:0 0 10px rgba(116,199,255,.5),inset 0 1px 0 rgba(255,255,255,.2);display:flex;align-items:center;justify-content:center;gap:8px;padding:8px;cursor:pointer;font:800 14px/1.1 system-ui}
      .omni-mode-button strong{font-size:1.35rem;font-weight:500}.omni-mode-button small{display:block;margin-top:3px;font-size:.64rem;letter-spacing:.12em;text-transform:uppercase;opacity:.8}
      .omni-mode-button.active{outline:2px solid #fff;outline-offset:2px;background:linear-gradient(120deg,#0566c4,#27278f 55%,#9218ae);box-shadow:0 0 14px rgba(121,211,255,.9),0 0 28px rgba(128,67,255,.5),inset 0 1px 0 rgba(255,255,255,.28)}
      .omni-mode-button[data-omni-intent='code'].active{background:linear-gradient(120deg,#067a41,#16904d,#1fb169)}
      .omni-mode-button[data-omni-intent='create'].active{background:linear-gradient(120deg,#0d5fb8,#2879d7,#6a4de8)}
      .omni-mode-button[data-omni-intent='gpt'].active{background:linear-gradient(120deg,#6c24b4,#9b35d5,#d851f0)}
      .omni-web-search{display:flex!important;gap:8px!important}.omni-web-search input{min-width:0!important;flex:1!important;min-height:52px!important;border-radius:16px!important;font-size:15px!important}.omni-web-search button{min-width:82px!important;min-height:52px!important;border-radius:16px!important;background:linear-gradient(135deg,#7c3aed,#2563eb)!important}
      .omni-assistant-status{min-height:18px;color:#93c5fd;font:750 12px/1.3 system-ui;letter-spacing:.02em}
      .omni-chat-panel{border:1px solid rgba(146,172,255,.24);border-radius:18px;background:#07101c;overflow:hidden}.omni-chat-panel[hidden]{display:none!important}.omni-chat-head{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:10px 12px;border-bottom:1px solid rgba(255,255,255,.08);color:#dbeafe}.omni-chat-head strong{font:900 13px system-ui}.omni-chat-head button{border:1px solid rgba(255,255,255,.15);border-radius:999px;background:#111827;color:#fff;padding:7px 10px;font:800 11px system-ui}.omni-chat-transcript{max-height:360px;overflow:auto;padding:12px;display:grid;gap:9px}.omni-chat-message{max-width:88%;padding:10px 12px;border-radius:14px;color:#eef4ff;background:#101827;white-space:pre-wrap;overflow-wrap:anywhere}.omni-chat-message.user{justify-self:end;background:#312e81}.omni-chat-message.assistant{justify-self:start;background:#10233a}.omni-chat-message strong{display:block;margin-bottom:4px;color:#a5d8ff;font:900 11px system-ui;text-transform:uppercase;letter-spacing:.08em}.omni-chat-message div{font:650 14px/1.48 system-ui}
      @media(max-width:620px){.omni-mode-row{grid-template-columns:repeat(2,minmax(0,1fr))}.omni-mode-button{min-height:58px}.omni-web-search{display:grid!important;grid-template-columns:1fr auto}.omni-chat-transcript{max-height:300px}}
    `;
    document.head.appendChild(style);

    const modes=document.createElement("div");
    modes.className="omni-mode-row";
    modes.id="omniIntentModes";
    modes.setAttribute("role","group");
    modes.setAttribute("aria-label","Omni TV task modes");
    modes.innerHTML=`
      <button class="omni-mode-button" type="button" data-omni-intent="search" aria-pressed="false"><strong>⌕</strong><span>Search<small>Omni Phi</small></span></button>
      <button class="omni-mode-button" type="button" data-omni-intent="code" aria-pressed="false"><strong>&lt;/&gt;</strong><span>Code<small>Build</small></span></button>
      <button class="omni-mode-button" type="button" data-omni-intent="create" aria-pressed="false"><strong>✧</strong><span>Create<small>Make</small></span></button>
      <button class="omni-mode-button" type="button" data-omni-intent="gpt" aria-pressed="false"><strong>GPT</strong><span>GPT<small>Talk</small></span></button>`;

    form.id="omniIntentForm";
    input.id="omniIntentInput";
    input.removeAttribute("required");
    input.setAttribute("autocomplete","off");
    submit.id="omniIntentGo";
    form.removeAttribute("action");
    form.removeAttribute("method");

    const status=document.createElement("div");
    status.className="omni-assistant-status";
    status.id="omniAssistantStatus";
    status.setAttribute("aria-live","polite");

    const panel=document.createElement("section");
    panel.className="omni-chat-panel";
    panel.id="omniChatPanel";
    panel.hidden=true;
    panel.innerHTML=`<div class="omni-chat-head"><strong>GPT in Omni TV</strong><button id="omniChatClear" type="button">Clear chat</button></div><div class="omni-chat-transcript" id="omniChatTranscript" aria-live="polite"></div>`;

    form.before(modes);
    form.after(status,panel);
    return {form,input,submit,panel,transcript:panel.querySelector("#omniChatTranscript"),status,clear:panel.querySelector("#omniChatClear")};
  }

  const ui=installUI();
  if(!ui)return;
  const {form,input,submit,panel,transcript,status,clear}=ui;
  const buttons=[...document.querySelectorAll("[data-omni-intent]")];

  const active=new Set();
  let conversation=[];
  try{
    const stored=JSON.parse(localStorage.getItem(MEMORY_KEY)||"[]");
    if(Array.isArray(stored))conversation=stored.slice(-12);
  }catch(_){conversation=[];}

  function save(){try{localStorage.setItem(MEMORY_KEY,JSON.stringify(conversation.slice(-12)));}catch(_){}}
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
      input.placeholder="Research with Omni Phi, then build or code…";submit.textContent="Build";
    }else if(active.has("create")&&active.has("search")){
      input.placeholder="Research with Omni Phi, then create…";submit.textContent="Create";
    }else if(active.has("code")){
      input.placeholder="Describe the website, app, or code you need…";submit.textContent="Code";
    }else if(active.has("create")){
      input.placeholder="Describe the invoice, spreadsheet, document, or item to create…";submit.textContent="Create";
    }else if(active.has("search")){
      input.placeholder="Search deeper with Omni Phi…";submit.textContent="Search";
    }else{
      input.placeholder="Search the web with Infinity Phi";submit.textContent="Search";
    }
    const selected=[...active].map(v=>v.toUpperCase()).join(" + ");
    status.textContent=selected?`${selected} · ${researchEngine()}`:"Default · Infinity Phi search";
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
  function renderHistory(){transcript.innerHTML="";conversation.forEach(message=>addMessage(message.role,message.content));}

  function routeNonGPT(query){
    const engine=researchEngine();
    const params=new URLSearchParams({q:query,run:"1",research:engine,source:"omni-tv"});
    if(active.has("code")){
      if(active.has("create"))params.set("also_create","1");
      location.href=`${CODE_PHI}?${params}`;return;
    }
    if(active.has("create")){location.href=`${CREATE_PHI}?${params}`;return;}
    if(active.has("search")){
      location.href=`${OMNI_PHI}?${new URLSearchParams({q:query,mode:"search",source:"omni-tv"})}`;return;
    }
    location.href=`${INFINITY_PHI}?${new URLSearchParams({q:query,run:"1",source:"omni-tv"})}`;
  }

  async function askGPT(query){
    conversation=[...conversation,{role:"user",content:query}].slice(-12);
    addMessage("user",query);save();input.value="";input.focus();submit.disabled=true;submit.textContent="…";
    status.textContent=`GPT thinking · ${researchEngine()} available`;
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
            verified_context:"The user is interacting from Omni TV. Search means use Omni Phi research context. Code means help build software or a website. Create means help produce documents, invoices, spreadsheets, media, or other requested artifacts. The current channel and program are supplied as playback context. Do not claim a repository or page was changed unless an actual tool or verified system performed that change."
          }
        })
      });
      const payload=await response.json().catch(()=>({}));
      if(!response.ok)throw new Error(payload.message||payload.error||`GPT request failed (${response.status})`);
      const text=String(payload.output_text||payload.output||"").trim();
      if(!text)throw new Error("GPT returned an empty response");
      conversation=[...conversation,{role:"assistant",content:text}].slice(-12);save();addMessage("assistant",text);
      status.textContent=`GPT ready · ${researchEngine()}`;
    }catch(error){
      addMessage("assistant",`I couldn't reach the GPT gateway from Omni TV. ${error&&error.message?error.message:"Please try again."}`);
      status.textContent="GPT gateway unavailable · search tools still work";
    }finally{submit.disabled=false;updateUI();}
  }

  buttons.forEach(button=>button.addEventListener("click",()=>{
    const mode=escMode(button.dataset.omniIntent);if(!mode)return;
    if(active.has(mode))active.delete(mode);else active.add(mode);
    updateUI();input.focus();
  }));
  form.addEventListener("submit",event=>{
    event.preventDefault();const query=input.value.trim();if(!query){input.focus();return;}
    if(active.has("gpt"))void askGPT(query);else routeNonGPT(query);
  });
  input.addEventListener("keydown",event=>{
    if(event.key==="Enter"&&!event.shiftKey&&!event.isComposing){event.preventDefault();form.requestSubmit();}
  });
  clear?.addEventListener("click",()=>{conversation=[];save();renderHistory();status.textContent="GPT conversation cleared";});

  renderHistory();updateUI();
})();
