/* Köttelmann v67: Originalkarten aus v56 + ARD-Sounds-Archiv */
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
  const audioUrl=ep.audioUrl;
  const isOpen=expandedId===ep.id;
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
                                ${audioUrl ? `
                                    <button data-play type="button" title="Folge im Player unten abspielen" class="w-full py-3 px-4 bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold rounded-xl shadow-sm active:scale-95 play-btn">
                                        ▶ Folge abspielen
                                    </button>
                                ` : `<div class="text-xs text-amber-500 pt-2">Kein direkter Audiolink gefunden.</div>`}
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
    if(diagnosticOpen)renderDiagnostics();
    restoreOldHeard();
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
  mini=document.createElement("section");
  mini.className="hidden fixed bottom-[68px] left-1/2 -translate-x-1/2 z-40 max-w-md w-full px-4 py-3 bg-slate-800 border-x border-t border-amber-500 rounded-t-2xl shadow-2xl space-y-3";
  mini.setAttribute("aria-label","Audioplayer");
  const title=document.createElement("div");
  title.id="mini-title";
  title.className="text-amber-400 font-bold text-sm text-center truncate";
  title.textContent="Köttelmann";
  const progressRow=document.createElement("div");
  progressRow.className="flex items-center gap-2";
  const elapsed=document.createElement("span");elapsed.id="mini-current";elapsed.textContent="00:00";elapsed.className="text-[11px] font-mono text-slate-300";
  const seek=document.createElement("input");
  seek.type="range";seek.min="0";seek.max="100";seek.value="0";seek.id="mini-seek";
  seek.className="flex-1 min-w-0";
  seek.setAttribute("aria-label","Wiedergabeposition");
  seek.addEventListener("input",()=>seekAudio(seek.value));
  const total=document.createElement("span");total.id="mini-duration";total.textContent="00:00";total.className="text-[11px] font-mono text-slate-300";
  progressRow.append(elapsed,seek,total);
  const controls=document.createElement("div");
  controls.className="grid grid-cols-3 gap-3";
  const prev=makeButton("−5 Sek.",()=>skipTime(-5),"min-h-[52px] text-sm font-bold bg-slate-700 border border-amber-500 rounded-xl text-slate-100 active:scale-95");
  const toggle=makeButton("Pause",()=>{
    if(!activeAudio)return;
    if(activeAudio.paused)activeAudio.play().catch(()=>{});
    else activeAudio.pause();
    syncMini();
  },"min-h-[52px] text-base bg-amber-500 text-slate-950 font-extrabold rounded-xl active:scale-95");
  toggle.id="mini-toggle";
  const next=makeButton("+5 Sek.",()=>skipTime(5),"min-h-[52px] text-sm font-bold bg-slate-700 border border-amber-500 rounded-xl text-slate-100 active:scale-95");
  controls.append(prev,toggle,next);
  mini.append(title,progressRow,controls);
  document.body.append(mini);
  // Der Player bleibt bei zugeklappter Karte und Seitenwechsel bestehen.
  setInterval(syncMini,350);
}
function syncMini(){
  if(!mini||!activeAudio)return;
  if(mini.classList.contains("hidden")){
    mini.classList.remove("hidden");
    document.querySelector("main")?.classList.add("pb-64");
  }
  const matching=episodes.find(e=>e.audioUrl===activeAudioUrl);
  document.getElementById("mini-title").textContent=matching?.title||"Köttelmann";
  document.getElementById("mini-toggle").textContent=activeAudio.paused?"Weiter":"Pause";
  const duration=activeAudio.duration;
  document.getElementById("mini-seek").value=Number.isFinite(duration)&&duration>0?Math.min(100,100*activeAudio.currentTime/duration):0;
  document.getElementById("mini-current").textContent=time(activeAudio.currentTime);
  document.getElementById("mini-duration").textContent=time(duration);
}

/* v67: Altes WDR-Hörprotokoll zu den ARD-Folgen zuordnen.
   Die Original-URLs bleiben ausnahmslos erhalten. Kein unsicherer Titel-Raten-Abgleich. */
const WDR_ARCHIVE_URL="https://www1.wdr.de/mediathek/audio/wdr4/autohaus-koettelmann/index.html";
const WDR_PROXY="https://koettelmann-proxy.m3-jost.workers.dev/?url=";
let recoveryRunning=false, wdrCheckedThisStart=false;
function normalizedAudio(url) {
  try {
    const u=new URL(url);
    return (u.hostname.toLowerCase()+u.pathname).toLowerCase().replace(/\/+/g,"/");
  } catch(_) {return "";}
}
function wdrMediaId(url) {
  // WDR-MP3s verwenden beispielsweise .../3338780_63399262.mp3.
  // Nur die eindeutig zuordenbare Medien-ID verwenden, niemals die Bitrate.
  try {
    const path=new URL(url).pathname;
    const match=path.match(/\/(\d{7,})_\d+\.mp3$/i);
    return match?match[1]:null;
  } catch(_) {return null;}
}
function normalizeName(value){
  return String(value||"").normalize("NFKD").toLowerCase()
    .replace(/[\u0300-\u036f]/g,"").replace(/[^a-z0-9]+/g," ").trim()
    .replace(/^autohaus kottelmann /,"");
}
function germanDate(value){
  const match=String(value||"").match(/(\d{2})\.(\d{2})\.(\d{4})/);
  return match?match[3]+"-"+match[2]+"-"+match[1]:"";
}
function episodeDate(value){
  const match=String(value||"").match(/^(\d{4}-\d{2}-\d{2})/);
  return match?match[1]:"";
}
function buildUniqueIndex(keyOf) {
  const index=new Map();
  episodes.forEach(ep=>{
    const key=keyOf(ep);
    if(!key)return;
    if(index.has(key))index.set(key,null); // uneindeutige Zuordnung verwerfen
    else index.set(key,ep);
  });
  return index;
}
function applyRecoveredHeard(candidates) {
  if(!candidates.length)return 0;
  const existing=getCompletedEpisodes();
  if(!Array.isArray(existing))return 0;
  const found=new Set(existing.filter(x=>typeof x==="string"));
  let added=0;
  for(const ep of candidates){
    if(!ep?.audioUrl || found.has(ep.audioUrl))continue;
    found.add(ep.audioUrl);added++;
  }
  if(added) {
    // Ursprüngliche URLs bleiben enthalten; nur eindeutig zugeordnete neue ergänzen.
    setCompletedEpisodes(Array.from(found));
    render(currentPage,false);
  }
  return added;
}
function matchOldAudioByFileId(legacy){
  const byPath=buildUniqueIndex(ep=>normalizedAudio(ep.audioUrl));
  const byWdrId=buildUniqueIndex(ep=>wdrMediaId(ep.audioUrl));
  const matched=[];
  for(const old of legacy){
    const path=normalizedAudio(old),id=wdrMediaId(old);
    const target=(path&&byPath.get(path))||(id&&byWdrId.get(id));
    if(target)matched.push(target);
  }
  return matched;
}
/* v67: Identische relative MP3-Pfade erkennen, selbst wenn der WDR sie
   ohne Hostname abgelegt hat. Niemals nur anhand eines Dateinamens raten. */
function cleanAudioPath(raw,base=WDR_ARCHIVE_URL){
  if(typeof raw!=="string"||!raw.trim())return "";
  try{
    const url=new URL(raw.trim(),base);
    if(!/^https?:$/.test(url.protocol))return "";
    // Ein Hostname ist für ältere relative MP3-Pfade nicht vorhanden.
    return decodeURI(url.pathname).replace(/\/+/g,"/").toLowerCase();
  }catch(_){return "";}
}
function oldPathVariants(value){
  if(typeof value!=="string"||!value.trim())return [];
  const raw=value.trim();
  const paths=new Set();
  const full=cleanAudioPath(raw);
  if(full)paths.add(full);
  // Bei WDR-Downloadlinks kann eine alte relative Angabe mit "./" beginnen.
  // Die ursprüngliche Angabe darf unverändert als Pfad verglichen werden.
  const direct=raw.split(/[?#]/)[0].replace(/^\.\//,"");
  if(direct && !/^[a-z][a-z0-9+.-]*:/i.test(direct)){
    paths.add(("/"+direct.replace(/^\/+/,"")).replace(/\/+/g,"/").toLowerCase());
  }
  return Array.from(paths);
}
function makeLegacyPathIndex(oldLinks){
  const byPath=new Map();
  for(const value of oldLinks){
    for(const path of oldPathVariants(value)){
      const earlier=byPath.get(path);
      if(earlier && earlier!==value)byPath.set(path,null);
      else if(!byPath.has(path))byPath.set(path,value);
    }
  }
  return byPath;
}
function titleDateKey(title,date){
  if(!date)return "";
  const normalized=normalizeName(title);
  return normalized?normalized+"|"+date:"";
}
function extractMatchingWdrRows(doc,baseUrl,legacyPaths){
  const candidates=[];
  const wdrRoot=new URL(baseUrl);
  doc.querySelectorAll(".box").forEach(box=>{
    const title=box.querySelector("h3 a")?.textContent?.trim();
    const day=germanDate(box.querySelector(".mediaDate")?.textContent||"");
    const link=box.querySelector("a.button.download")||box.querySelector('a[href*=".mp3"]');
    const raw=link?.getAttribute("href");
    if(!title||!day||!raw)return;
    const absolute=cleanAudioPath(raw,wdrRoot.href);
    const possibilities=new Set(oldPathVariants(raw));
    if(absolute)possibilities.add(absolute);
    const matching=new Set();
    for(const path of possibilities){
      const legacy=legacyPaths.get(path);
      if(legacy)matching.add(legacy);
    }
    if(matching.size!==1)return;
    const legacy=[...matching][0];
    candidates.push({legacy,title,day});
  });
  return candidates;
}
function recoverDateCandidates(rows){
  // Eindeutige Zuordnung in BEIDEN Archiven erforderlich.
  const byTitleDate=buildUniqueIndex(ep=>titleDateKey(ep.title,episodeDate(ep.publishDate)));
  const assigned=new Map();
  const ambiguous=new Set();
  for(const item of rows){
    const key=titleDateKey(item.title,item.day);
    const episode=key?byTitleDate.get(key):null;
    if(!episode?.audioUrl)continue;
    const old=assigned.get(item.legacy);
    if(old && old.id!==episode.id)ambiguous.add(item.legacy);
    else assigned.set(item.legacy,episode);
  }
  ambiguous.forEach(key=>assigned.delete(key));
  return [...assigned.values()];
}
let recoveryProgress={status:"Noch nicht gestartet",scanned:0,pathMatches:0,restored:0};
async function recoverFromWdrPages(oldLinks){
  if(wdrCheckedThisStart)return;
  wdrCheckedThisStart=true;
  if(!oldLinks.length)return;
  const byPath=makeLegacyPathIndex(oldLinks);
  if(!byPath.size)return;
  const pages=[WDR_ARCHIVE_URL],visited=new Set(),rows=[],seenMatches=new Set();
  recoveryProgress={status:"WDR-Archiv wird abgeglichen",scanned:0,pathMatches:0,restored:0};
  if(diagnosticOpen)renderDiagnostics();
  try{
    // Mit der WDR-Navigation durch alle erreichbaren Archivseiten gehen.
    for(let n=0;pages.length && n<40;n++){
      const url=pages.shift();
      if(visited.has(url))continue;
      visited.add(url);
      const response=await fetch(WDR_PROXY+encodeURIComponent(url),{cache:"no-store"});
      if(!response.ok)throw new Error("WDR-Archiv HTTP "+response.status);
      const doc=new DOMParser().parseFromString(await response.text(),"text/html");
      recoveryProgress.scanned++;
      for(const entry of extractMatchingWdrRows(doc,url,byPath)){
        const identity=entry.legacy+"|"+entry.title+"|"+entry.day;
        if(seenMatches.has(identity))continue;
        seenMatches.add(identity);rows.push(entry);
      }
      doc.querySelectorAll('a[href*="_pageaudio-"]').forEach(link=>{
        try{
          const next=new URL(link.getAttribute("href"),url);
          if(next.origin===new URL(WDR_ARCHIVE_URL).origin &&
            next.pathname.includes("/autohaus-koettelmann/") &&
            next.pathname.includes("_pageaudio-") &&
            !visited.has(next.href) && !pages.includes(next.href))pages.push(next.href);
        }catch(_){}
      });
    }
    recoveryProgress.pathMatches=new Set(rows.map(row=>row.legacy)).size;
    const candidates=recoverDateCandidates(rows);
    recoveryProgress.restored=applyRecoveredHeard(candidates);
    recoveryProgress.status="Abgleich abgeschlossen";
  }catch(error){
    recoveryProgress.pathMatches=new Set(rows.map(row=>row.legacy)).size;
    // Teilweise verifizierte Treffer dürfen dennoch wiederhergestellt werden.
    recoveryProgress.restored=applyRecoveredHeard(recoverDateCandidates(rows));
    recoveryProgress.status="WDR-Abgleich teilweise möglich: "+String(error?.message||"Netzwerkfehler").slice(0,80);
    console.warn(recoveryProgress.status);
  }
  if(diagnosticOpen)renderDiagnostics();
}
async function restoreOldHeard(){
  if(recoveryRunning||!episodes.length)return;
  recoveryRunning=true;
  try{
    const saved=getCompletedEpisodes();
    if(!Array.isArray(saved)||!saved.length)return;
    const current=new Set(episodes.map(ep=>ep.audioUrl).filter(Boolean));
    const old=saved.filter(value=>typeof value==="string"&&value&&!current.has(value));
    if(!old.length)return;
    applyRecoveredHeard(matchOldAudioByFileId(old));
    await recoverFromWdrPages(old);
  }catch(error){console.warn("Alte Hörmarkierungen konnten nicht abgeglichen werden",error);}
  finally{recoveryRunning=false;}
}

/* v67: Diagnostik ist rein lesend. Keine gespeicherte Markierung wird migriert. */
let diagnosticOpen=false;
let wdrProbeMessage="Noch nicht geprüft.";
function groupCount(map,key){map.set(key,(map.get(key)||0)+1);}
function classifySavedEntry(value){
  if(typeof value!=="string"||!value.trim())return {type:"Leer / kein Text",host:null};
  const text=value.trim();
  if(/^urn:ard:/i.test(text))return {type:"ARD-URN",host:null};
  if(/^[0-9a-f]{8}-[0-9a-f-]{20,}$/i.test(text))return {type:"UUID / Folgen-ID",host:null};
  if(/^\d+$/.test(text))return {type:"Numerische Kennung",host:null};
  let u;
  try{u=new URL(text);}catch(_){
    return {type:/\.mp3(?:\?|$)/i.test(text)?"Relativer Audio-Pfad":"Sonstige Kennung / Text",host:null};
  }
  if(!["http:","https:"].includes(u.protocol))return {type:"Anderes URL-Schema",host:null};
  const host=u.hostname.toLowerCase();
  const pathname=u.pathname.toLowerCase();
  const isAudio=/\.(mp3|m4a|aac|mp4|ogg)(?:$)/i.test(pathname)||/audio|media|stream|podcast/i.test(pathname);
  return {type:isAudio?"Audio-URL (HTTP/S)":"Web-URL (HTTP/S)",host};
}
function collectHeardDiagnostics(){
  let stored=[],storageError="";
  try {
    const raw=localStorage.getItem("koettelmann_completed_episodes");
    const parsed=raw===null?[]:JSON.parse(raw);
    if(!Array.isArray(parsed))storageError="Gespeicherte Einträge haben ein unerwartetes Format.";
    else stored=parsed;
  }catch(error){storageError="Gespeicherte Einträge konnten nicht gelesen werden.";}
  const unique=Array.from(new Set(stored.filter(x=>typeof x==="string"&&x.length>0)));
  const invalid=stored.length-unique.length-(stored.filter(x=>typeof x==="string"&&x.length>0).length-unique.length);
  const currentUrls=new Set(episodes.map(ep=>ep.audioUrl).filter(Boolean));
  const currentPaths=new Map(),currentIds=new Set(episodes.map(ep=>ep.id));
  for(const ep of episodes){
    if(!ep.audioUrl)continue;
    const path=normalizedAudio(ep.audioUrl);
    if(!path)continue;
    if(currentPaths.has(path))currentPaths.set(path,null);
    else currentPaths.set(path,ep);
  }
  const mediaIds=new Map();
  for(const ep of episodes){
    const id=wdrMediaId(ep.audioUrl);
    if(id)mediaIds.set(id,mediaIds.has(id)?null:ep);
  }
  const formats=new Map(),domains=new Map(),unmatchedDomains=new Map(),unmatchedFormats=new Map();
  let exact=0,samePath=0,mediaId=0,episodeId=0,unmatched=0,wdr=0,httpUrls=0,nonUrls=0;
  const unmatchedValueLengths={short:0,medium:0,long:0};
  for(const value of unique){
    const info=classifySavedEntry(value);
    groupCount(formats,info.type);
    if(info.host){
      httpUrls++;
      groupCount(domains,info.host);
      if(info.host.includes("wdr"))wdr++;
    } else nonUrls++;
    let matched=false;
    if(currentUrls.has(value)){exact++;matched=true;}
    else if(currentIds.has(value)){episodeId++;matched=true;}
    else{
      const path=normalizedAudio(value);
      if(path&&currentPaths.get(path)){samePath++;matched=true;}
      else{
        const id=wdrMediaId(value);
        if(id&&mediaIds.get(id)){mediaId++;matched=true;}
      }
    }
    if(!matched){
      unmatched++;
      groupCount(unmatchedFormats,info.type);
      if(info.host)groupCount(unmatchedDomains,info.host);
      if(value.length<40)unmatchedValueLengths.short++;
      else if(value.length<150)unmatchedValueLengths.medium++;
      else unmatchedValueLengths.long++;
    }
  }
  const sortCount=m=>Array.from(m).sort((a,b)=>b[1]-a[1]||a[0].localeCompare(b[0]));
  return {total:stored.length,unique:unique.length,invalid,exact,samePath,mediaId,episodeId,
    unmatched,wdr,httpUrls,nonUrls,episodeCount:episodes.length,storageError,
    formats:sortCount(formats),domains:sortCount(domains),unmatchedFormats:sortCount(unmatchedFormats),
    unmatchedDomains:sortCount(unmatchedDomains),unmatchedValueLengths};
}
function addDiagnosticRow(parent,label,value){
  const row=document.createElement("div");
  row.className="flex items-start justify-between gap-3 text-sm py-1";
  const left=document.createElement("span");left.textContent=label;left.className="text-slate-400";
  const right=document.createElement("span");right.textContent=String(value);right.className="font-semibold text-slate-100 text-right";
  row.append(left,right);parent.append(row);
}
function diagnosticSummary(result){
  const asList=(items)=>items.length?items.map(([name,count])=>name+": "+count).join("; "):"keine";
  return [
    "Köttelmann v67 – Hörstatus-Diagnose",
    "Folgen im Archiv: "+result.episodeCount,
    "Gespeicherte Gehört-Einträge: "+result.total,
    "Verschiedene Text-Einträge: "+result.unique,
    "Exakte Audio-URL-Treffer: "+result.exact,
    "Identischer URL-Pfad: "+result.samePath,
    "WDR-Medien-ID-Treffer: "+result.mediaId,
    "Folgen-ID-Treffer: "+result.episodeId,
    "Noch nicht zugeordnet: "+result.unmatched,
    "Ungültige Einträge: "+result.invalid,
    "Internet-URLs: "+result.httpUrls,
    "Andere Kennungen: "+result.nonUrls,
    "Formate insgesamt: "+asList(result.formats),
    "Formate nicht zugeordnet: "+asList(result.unmatchedFormats),
    "Hosts insgesamt: "+asList(result.domains),
    "Hosts nicht zugeordnet: "+asList(result.unmatchedDomains),
    "Längen nicht zugeordneter Werte (<40 / 40–149 / >=150 Zeichen): "+Object.values(result.unmatchedValueLengths).join(" / "),
    "Altabgleich: "+recoveryProgress.status,
    "WDR-Seiten geprüft: "+recoveryProgress.scanned,
    "Originalpfade im WDR gefunden: "+recoveryProgress.pathMatches,
    "Zusätzlich wiederhergestellt: "+recoveryProgress.restored,
    "WDR-Archivtest: "+wdrProbeMessage,
    result.storageError?"Speicherfehler: "+result.storageError:""
  ].filter(Boolean).join("\n");
}
async function probeWdrArchive(button){
  button.disabled=true;button.textContent="WDR-Archiv wird geprüft …";
  try {
    const response=await fetch(WDR_PROXY+encodeURIComponent(WDR_ARCHIVE_URL),{cache:"no-store"});
    if(!response.ok)throw new Error("HTTP "+response.status);
    const doc=new DOMParser().parseFromString(await response.text(),"text/html");
    const boxes=doc.querySelectorAll(".box").length;
    const named=Array.from(doc.querySelectorAll(".box")).filter(x=>x.querySelector("h3 a")).length;
    wdrProbeMessage=named>0?"WDR liefert "+named+" Folgenkarten auf der ersten Seite.":
      "WDR ist erreichbar, liefert aber keine erkennbaren Folgenkarten.";
  }catch(error){
    wdrProbeMessage="Nicht erreichbar ("+String(error?.message||"Netzwerkfehler").slice(0,90)+").";
  }finally{button.disabled=false;button.textContent="WDR-Archiv testen";renderDiagnostics();}
}
function renderDiagnostics(){
  const panel=document.getElementById("heard-diagnostic-panel");
  const trigger=document.getElementById("heard-diagnostic-toggle");
  if(!panel||!trigger)return;
  panel.classList.toggle("hidden",!diagnosticOpen);
  trigger.setAttribute("aria-expanded",String(diagnosticOpen));
  if(!diagnosticOpen)return;
  panel.replaceChildren();
  const result=collectHeardDiagnostics();
  const heading=document.createElement("h2");heading.textContent="Hörstatus-Diagnose";heading.className="font-bold text-amber-400 text-base";
  const hint=document.createElement("p");hint.className="text-xs text-slate-400";
  hint.textContent="Diagnose zeigt den Abgleich. Alte Einträge bleiben erhalten; eindeutig erkannte Folgen werden als gehört ergänzt.";
  panel.append(heading,hint);
  addDiagnosticRow(panel,"Gespeicherte „Gehört“-Einträge",result.total);
  addDiagnosticRow(panel,"Einmalige Werte",result.unique);
  addDiagnosticRow(panel,"Exakte Audio-URL-Treffer",result.exact);
  addDiagnosticRow(panel,"Gleicher Host und Dateipfad",result.samePath);
  addDiagnosticRow(panel,"WDR-Medienkennungen",result.mediaId);
  addDiagnosticRow(panel,"Folgenkennungen",result.episodeId);
  addDiagnosticRow(panel,"Noch nicht zugeordnet",result.unmatched);
  addDiagnosticRow(panel,"Folgen im lokalen Archiv",result.episodeCount);
  const addGroups=(title,pairs)=>{
    const heading=document.createElement("h3");
    heading.textContent=title;heading.className="text-amber-400 font-semibold text-sm pt-2";
    panel.append(heading);
    if(!pairs.length)addDiagnosticRow(panel,"Keine Einträge","0");
    pairs.forEach(([name,count])=>addDiagnosticRow(panel,name,count));
  };
  addGroups("Formate der gespeicherten Einträge",result.formats);
  addGroups("Formate der nicht zugeordneten Einträge",result.unmatchedFormats);
  addGroups("Internet-Domains (alle)",result.domains);
  addGroups("Internet-Domains (nicht zugeordnet)",result.unmatchedDomains);
  addDiagnosticRow(panel,"Andere Kennungen ohne Internet-URL",result.nonUrls);
  if(result.invalid)addDiagnosticRow(panel,"Ungültige Einträge",result.invalid);
  if(result.storageError){
    const error=document.createElement("p");error.textContent=result.storageError;error.className="text-rose-300 text-xs";panel.append(error);
  }
  addDiagnosticRow(panel,"Altabgleich",recoveryProgress.status);
  addDiagnosticRow(panel,"WDR-Seiten geprüft",recoveryProgress.scanned);
  addDiagnosticRow(panel,"Originalpfade im WDR gefunden",recoveryProgress.pathMatches);
  addDiagnosticRow(panel,"In diesem Abgleich wiederhergestellt",recoveryProgress.restored);
  const wdr=document.createElement("p");wdr.className="text-xs text-slate-300";
  wdr.textContent="WDR-Test: "+wdrProbeMessage;panel.append(wdr);
  const controls=document.createElement("div");controls.className="grid grid-cols-2 gap-2 pt-2";
  const probe=makeButton("WDR-Archiv testen",()=>probeWdrArchive(probe),
    "py-3 px-2 bg-slate-700 text-slate-100 border border-amber-500 rounded-xl text-xs font-semibold");
  const copy=makeButton("Diagnose kopieren",async()=>{
    const summary=diagnosticSummary(collectHeardDiagnostics());
    try{
      if(navigator.clipboard?.writeText){
        await navigator.clipboard.writeText(summary);copy.textContent="Kopiert ✓";return;
      }
    }catch(_){}
    window.prompt("Diagnose kopieren:",summary);
  },"py-3 px-2 bg-amber-500 text-slate-950 rounded-xl text-xs font-bold");
  controls.append(probe,copy);panel.append(controls);
  const privacy=document.createElement("p");privacy.className="text-xs text-slate-500";
  privacy.textContent="Beim Kopieren werden nur Formatarten, Anzahlen und Domainnamen übernommen – keine vollständigen Links oder Kennungen.";
  panel.append(privacy);
}
function initDiagnostics(){
  const toggle=document.getElementById("heard-diagnostic-toggle");
  if(!toggle)return;
  toggle.addEventListener("click",()=>{diagnosticOpen=!diagnosticOpen;renderDiagnostics();});
}

function start(){
  loadSaved();
  createMini();
  if(!showShared())render(1,false);
  initDiagnostics();
  restoreOldHeard();
  refresh();
}
window.KoettelmannV67={start,page,syncMini};
})();