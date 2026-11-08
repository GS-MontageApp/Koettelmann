/* Köttelmann v61: Originalkarten aus v56 + ARD-Sounds-Archiv */
(function(){
"use strict";
const ARCHIVE_KEY="koettelmann_ard_archive_v1";
const SHOW_ID="urn:ard:show:dcbb8113dbb01ef3";
const API="https://api.ardaudiothek.de/graphql";
const QUERY="query Archive($id: ID!, $first: Int!, $after: Cursor) { programSet(id: $id) { items(first: $first, after: $after, orderBy: PUBLISH_DATE_DESC, filter: { isPublished: { equalTo: true } }) { pageInfo { hasNextPage endCursor } nodes { id title publishDate duration audios { url } } } } }";
const PAGE_SIZE=100;
let episodes=[], currentPage=1, expandedId=null, requestId=new URL(location.href).searchParams.get("folge"), fetching=false;
let mini=null, lastActiveAudio=null;
function escapeHtml(input) {return String(input??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));}
function goodUrl(value) {try {const u=new URL(value);return u.protocol==="https:"?u.href:"";}catch(_){return "";}}
function normalize(item) {
  if(!item || typeof item!=="object") return null;
  const id=String(item.id||item.urn||item.episodeId||"").trim();
  const title=String(item.title||item.name||"").trim();
  if(!id || !title) return null;
  return {id,title:title.slice(0,500),publishDate:String(item.publishDate||item.date||"").slice(0,35),
    audioUrl:goodUrl(item.audioUrl||item.audio_url||item.audios?.[0]?.url||""),
    pageUrl:goodUrl(item.pageUrl||item.episodeUrl||""),
    duration:Number.isFinite(Number(item.duration))?Number(item.duration):null,
    availableTo:String(item.availableTo||"").slice(0,35)};
}
function loadSaved(){
  try {const x=JSON.parse(localStorage.getItem(ARCHIVE_KEY)||"[]");
    if(Array.isArray(x))episodes=x.map(normalize).filter(Boolean);
  }catch(e){console.warn("Archiv konnte nicht gelesen werden",e);}
  episodes.sort((a,b)=>b.publishDate.localeCompare(a.publishDate));
}
function combine(list){
  const known=new Map(episodes.map(x=>[x.id,x]));
  list.map(normalize).filter(Boolean).forEach(x=>{
    const old=known.get(x.id);
    known.set(x.id,old?{...old,...x,audioUrl:x.audioUrl||old.audioUrl,pageUrl:x.pageUrl||old.pageUrl}:x);
  });
  episodes=Array.from(known.values()).sort((a,b)=>b.publishDate.localeCompare(a.publishDate));
  try{localStorage.setItem(ARCHIVE_KEY,JSON.stringify(episodes));}
  catch(e){console.warn("Lokaler Archivspeicher voll",e);}
}
function fullDate(s) {
  const d=new Date(s);
  return Number.isNaN(d.getTime())?s:d.toLocaleDateString("de-DE",{weekday:"long",day:"2-digit",month:"2-digit",year:"numeric"});
}
function durationText(value) {
  if(value===null||!Number.isFinite(value))return "";
  const seconds=value>10000?Math.round(value/1000):Math.round(value);
  return String(Math.floor(seconds/60)).padStart(2,"0")+":"+String(seconds%60).padStart(2,"0");
}
function time(seconds){
  const s=Number.isFinite(seconds)?Math.max(0,Math.floor(seconds)):0;
  return String(Math.floor(s/60)).padStart(2,"0")+":"+String(s%60).padStart(2,"0");
}
function makeButton(title,cb,className) {
  const b=document.createElement("button");b.type="button";b.textContent=title;b.className=className;
  b.addEventListener("click",cb);return b;
}
async function shareEpisode(ep){
  const url=new URL(location.href);url.search="";url.hash="";url.searchParams.set("folge",ep.id);
  const data={title:"Autohaus Köttelmann – "+ep.title,text:"Hör dir diese Köttelmann-Folge an: "+ep.title,url:url.href};
  try{
    if(navigator.share) {await navigator.share(data);return;}
    if(navigator.clipboard?.writeText){await navigator.clipboard.writeText(url.href);return;}
  }catch(error){if(error?.name==="AbortError")return;}
  window.prompt("Link zur Folge kopieren:",url.href);
}
function attach(card,ep){
  const listened=card.querySelector("[data-completed]");
  if(listened)listened.addEventListener("click",e=>toggleCompletedEpisode(ep.audioUrl,e));
  const favorite=card.querySelector("[data-favorite]");
  if(favorite)favorite.addEventListener("click",e=>toggleFavoriteEpisode(ep.audioUrl,e));
  const play=card.querySelector("[data-play]");
  if(play)play.addEventListener("click",()=>{toggleAudio(ep.audioUrl,play);syncMini();});
  card.querySelector("[data-share]")?.addEventListener("click",e=>{e.stopPropagation();shareEpisode(ep);});
  card.dataset.episodeId=ep.id;
}
function renderCard(ep,index,pageNum,container){
  const title=ep.title;
  const formattedDate=fullDate(ep.publishDate);
  const duration=durationText(ep.duration);
  const expires=ep.availableTo?fullDate(ep.availableTo):"";
  const audioUrl=ep.audioUrl;
  const isOpen=expandedId ? expandedId===ep.id : (index===0&&pageNum===1);
  const completed=audioUrl&&isEpisodeCompleted(audioUrl);
  const isFav=audioUrl&&isEpisodeFavorite(audioUrl);
                    const card = document.createElement('div');
                    const cardBorderClass = completed ? "border-2 border-emerald-500" : "border-2 border-amber-500";
                    
                    card.className = `bg-slate-800 ${cardBorderClass} rounded-2xl p-5 shadow-sm transition hover:opacity-95 episode-card-wrapper relative overflow-hidden ${isOpen ? 'open' : ''}`;
                    card.dataset.audioUrl = audioUrl;
                    
                    card.innerHTML = `
                        <!-- Wasserzeichen-Hintergrundbild mit exakt 20% Sichtbarkeit im offenen Zustand -->
                        <div class="absolute inset-0 pointer-events-none opacity-0 transition-opacity duration-300 flex items-center justify-center overflow-hidden z-0 watermarked-bg ${isOpen ? 'opacity-20' : ''}">
                            <img src="img/splash.jpg" alt="Wasserzeichen" class="w-full h-full object-cover">
                        </div>

                        <div class="relative z-10 space-y-3">
                            <!-- Feste Kopfzeile: Titel, Status-Haken, Favoritenstern & Aufklapp-Pfeil -->
                            <div class="flex justify-between items-center cursor-pointer select-none" onclick="toggleDetails(this)">
                                <span class="font-semibold text-amber-400 text-base pr-2">${escapeHtml(title)}</span>
                                <div class="flex items-center space-x-2 flex-shrink-0" onclick="event.stopPropagation()">
                                    ${audioUrl ? `
                                    <button data-completed title="Status wechseln (gehört/ungehört)" class="status-badge text-[10px] font-medium px-2 py-0.5 rounded-full bg-emerald-950 text-emerald-400 border border-emerald-800/60 transition active:scale-95 ${completed ? '' : 'hidden'}">
                                        ✓ Gehört
                                    </button>` : ''}
                                    
                                    ${audioUrl ? `
                                    <button data-favorite title="Als Favorit markieren" class="p-1 transition active:scale-95 focus:outline-none">
                                        ${isFav ? `
                                        <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5 text-amber-400 fill-amber-400" viewBox="0 0 20 20" fill="currentColor"><path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z"/></svg>` : `
                                        <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5 text-slate-400 hover:text-amber-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z"/></svg>`}
                                    </button>` : ''}

                                    <button data-share type="button" class="p-1 text-slate-300 hover:text-amber-400 transition focus:outline-none" title="Folge teilen" aria-label="Folge teilen">
                                      <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><path d="m8.7 13.5 6.6 4M15.3 6.5l-6.6 4"/></svg>
                                    </button>
                                </div>
                            </div>

                            <!-- Ausklappbarer Detail- und Player-Bereich -->
                            <div class="episode-details-content pt-3 border-t border-slate-700/60 space-y-3 text-sm text-slate-300 ${isOpen ? '' : 'hidden'}">
                                <div class="flex justify-between">
                                    <span class="text-slate-400">Veröffentlichung:</span>
                                    <span class="font-medium">${escapeHtml(formattedDate)}</span>
                                </div>
                                <div class="flex justify-between">
                                    <span class="text-slate-400">Laufzeit:</span>
                                    <span class="font-medium">${escapeHtml(duration)}</span>
                                </div>
                                <div class="flex justify-between">
                                    <span class="text-slate-400">Verfügbarkeit:</span>
                                    <span class="font-medium text-emerald-400">${escapeHtml(expires)}</span>
                                </div>
                                ${audioUrl ? `
                                <div class="pt-2 space-y-2">
                                    <div class="space-y-1">
                                        <input type="range" value="0" max="100" class="w-full progress-bar" oninput="seekAudio(this.value)">
                                        <div class="flex justify-between text-[11px] text-slate-400 font-mono">
                                            <span class="current-time">00:00</span>
                                            <span class="duration-time">${escapeHtml(duration || '00:00')}</span>
                                        </div>
                                    </div>
                                    <div class="grid grid-cols-3 gap-2">
                                        <button onclick="skipTime(-5)" title="5 Sekunden zurück" class="py-2 px-2 bg-slate-700 hover:bg-slate-600 text-slate-200 font-semibold rounded-xl transition flex items-center justify-center space-x-1 active:scale-95 text-xs shadow-sm border border-amber-500">
                                            <span>-5s</span>
                                        </button>
                                        <button data-play title="Start / Pause" class="py-2.5 px-2 bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold rounded-xl transition flex items-center justify-center space-x-1 active:scale-95 text-xs shadow-sm play-btn">
                                            <span>Start</span>
                                        </button>
                                        <button onclick="skipTime(5)" title="5 Sekunden vor" class="py-2 px-2 bg-slate-700 hover:bg-slate-600 text-slate-200 font-semibold rounded-xl transition flex items-center justify-center space-x-1 active:scale-95 text-xs shadow-sm border border-amber-500">
                                            <span>+5s</span>
                                        </button>
                                    </div>
                                </div>` : `<div class="text-xs text-amber-500 pt-2">Kein direkter Download-Link gefunden.</div>`}
                            </div>
                        </div>
                    `;
                    container.appendChild(card);
  attach(card,ep);
}
function render(page=1,scroll=true){
  const host=document.getElementById("episode-container");
  if(!host)return;
  currentPage=Math.max(1,Math.min(page,Math.max(1,Math.ceil(episodes.length/PAGE_SIZE))));
  host.replaceChildren();
  if(!episodes.length){
    const loading=document.createElement("p");loading.className="text-center py-10 text-amber-400 text-sm";loading.textContent="Lade Folgen…";host.append(loading);
  }else{
    episodes.slice((currentPage-1)*PAGE_SIZE,currentPage*PAGE_SIZE).forEach((ep,index)=>renderCard(ep,index,currentPage,host));
  }
  renderPagination(currentPage,Math.ceil(episodes.length/PAGE_SIZE));
  if(scroll)window.scrollTo({top:0,behavior:"smooth"});
}
function page(pageNum){render(pageNum);}
function showShared(){
  if(!requestId)return false;
  const i=episodes.findIndex(ep=>ep.id===requestId);
  if(i<0)return false;
  expandedId=requestId;
  render(Math.floor(i/PAGE_SIZE)+1,false);
  requestAnimationFrame(()=>{
    const card=Array.from(document.querySelectorAll(".episode-card-wrapper")).find(c=>c.dataset.episodeId===requestId);
    card?.scrollIntoView({block:"center",behavior:"smooth"});
  });
  requestId=null;
  return true;
}
async function refresh(){
  if(fetching)return;
  fetching=true;
  let cursor=null, fetched=0;
  const knownCursors=new Set();
  const oldSnapshot=JSON.stringify(episodes);
  try{
    for(let i=0;i<100;i++){
      const res=await fetch(API,{method:"POST",headers:{"Content-Type":"application/json"},
        body:JSON.stringify({query:QUERY,variables:{id:SHOW_ID,first:PAGE_SIZE,after:cursor}})});
      if(!res.ok)throw new Error("HTTP "+res.status);
      const obj=await res.json();
      if(obj.errors?.length)throw new Error(obj.errors.map(e=>e.message).join("; "));
      const connection=obj.data?.programSet?.items;
      if(!Array.isArray(connection?.nodes))throw new Error("Unerwartetes ARD-Datenformat");
      combine(connection.nodes.map(item=>({id:item.id,title:item.title,publishDate:item.publishDate,duration:item.duration,audioUrl:item.audios?.find(x=>x.url)?.url||""})));
      fetched+=connection.nodes.length;
      if(!connection.pageInfo?.hasNextPage)break;
      const next=connection.pageInfo.endCursor;
      if(!next||knownCursors.has(next))throw new Error("Paginierung der ARD-Schnittstelle fehlgeschlagen");
      knownCursors.add(next);cursor=next;
    }
    if(JSON.stringify(episodes)!==oldSnapshot)render(currentPage,false);
    showShared();
  }catch(e){
    console.warn("Aktualisierung nicht verfügbar; lokaler Stand bleibt bestehen:",e);
    if(!episodes.length){
      const host=document.getElementById("episode-container");
      if(host)host.textContent="Das Folgenarchiv konnte nicht geladen werden. Bitte Internetverbindung prüfen.";
    }
  }finally{fetching=false;}
}
function createMini(){
  if(mini)return;
  mini=document.createElement("div");
  mini.className="hidden fixed bottom-[70px] left-1/2 -translate-x-1/2 z-40 max-w-md w-full px-3 py-2 bg-slate-800 border border-amber-500 rounded-t-xl shadow-lg";
  mini.setAttribute("aria-label","Aktueller Audioplayer");
  const row=document.createElement("div");row.className="flex items-center gap-2";
  const title=document.createElement("span");title.id="mini-title";title.className="text-xs truncate flex-1 text-amber-400 font-bold";
  const prev=makeButton("−5s",()=>skipTime(-5),"text-xs bg-slate-700 rounded px-2 py-2");
  const toggle=makeButton("Pause",()=>{
    if(!activeAudio)return;
    if(activeAudio.paused)activeAudio.play().catch(()=>{});
    else activeAudio.pause();
    syncMini();
  },"text-xs bg-amber-500 text-slate-950 font-bold rounded px-3 py-2");
  toggle.id="mini-toggle";
  const next=makeButton("+5s",()=>skipTime(5),"text-xs bg-slate-700 rounded px-2 py-2");
  row.append(title,prev,toggle,next);
  const bottom=document.createElement("div");bottom.className="flex items-center gap-2 mt-1";
  const seek=document.createElement("input");seek.type="range";seek.min="0";seek.max="100";seek.value="0";seek.id="mini-seek";seek.className="flex-1 min-w-0";
  seek.setAttribute("aria-label","Wiedergabeposition");
  seek.addEventListener("input",()=>seekAudio(seek.value));
  const progress=document.createElement("span");progress.id="mini-progress";progress.className="text-[10px] font-mono text-slate-300";
  bottom.append(seek,progress);mini.append(row,bottom);document.body.append(mini);
  // Ein Playerobjekt bleibt bei Kartenschluss und Seitenwechsel bestehen.
  setInterval(syncMini,350);
}
function syncMini(){
  if(!mini)return;
  if(!activeAudio)return;
  mini.classList.remove("hidden");
  const matching=episodes.find(e=>e.audioUrl===activeAudioUrl);
  document.getElementById("mini-title").textContent=matching?.title||"Köttelmann";
  document.getElementById("mini-toggle").textContent=activeAudio.paused?"Weiter":"Pause";
  const duration=activeAudio.duration;
  document.getElementById("mini-seek").value=Number.isFinite(duration)&&duration>0?Math.min(100,100*activeAudio.currentTime/duration):0;
  document.getElementById("mini-progress").textContent=time(activeAudio.currentTime)+" / "+time(duration);
}
function start(){
  loadSaved();
  createMini();
  if(!showShared())render(1,false);
  refresh();
}
window.KoettelmannV61={start,page,syncMini};
})();