/* Autohaus Köttelmann v59 – Episodenarchiv und Player */
(() => {
"use strict";
const STORAGE = "koettelmann_ard_archive_v1";
const SHOW = "urn:ard:show:dcbb8113dbb01ef3";
const API = "https://api.ardaudiothek.de/graphql";
const PAGE_SIZE = 100;
const QUERY = "query Archive($id: ID!, $first: Int!, $after: Cursor) { programSet(id: $id) { items(first: $first, after: $after, orderBy: PUBLISH_DATE_DESC, filter: { isPublished: { equalTo: true } }) { pageInfo { hasNextPage endCursor } nodes { id title publishDate duration audios { url } } } } }";
let episodes = [], currentPage = 1, openEpisode = null, loading = false;
let activeEpisode = null, player = null, cardProgress = null, playerBar = null, completedOnEnd = false;
let requestedId = new URL(location.href).searchParams.get("folge");
const byId = new Map();
const $ = id => document.getElementById(id);
function element(tag, text, classes) {
  const node = document.createElement(tag);
  if (text !== undefined && text !== null) node.textContent = String(text);
  if (classes) node.className = classes;
  return node;
}
function button(label, cb, classes) {
  const b = element("button", label, classes || "px-3 py-2 bg-slate-700 rounded-xl");
  b.type = "button";
  b.addEventListener("click", cb);
  return b;
}
function validUrl(input) {
  try { const u = new URL(input); return u.protocol === "https:" ? u.href : ""; }
  catch (_) { return ""; }
}
function normalize(e) {
  if (!e || typeof e !== "object") return null;
  const id = String(e.id || e.urn || e.episodeId || "").trim();
  const title = String(e.title || e.name || "").trim();
  if (!id || !title) return null;
  const audioUrl = validUrl(e.audioUrl || e.audio_url || e.audios?.[0]?.url || "");
  const pageUrl = validUrl(e.pageUrl || e.url || e.episodeUrl || "");
  return {
    id, title: title.slice(0,500),
    publishDate: String(e.publishDate || e.date || "").slice(0,35),
    duration: Number.isFinite(Number(e.duration)) ? Number(e.duration) : null,
    audioUrl,
    pageUrl,
    availableTo: String(e.availableTo || "").slice(0,35)
  };
}
function compare(a,b) { return b.publishDate.localeCompare(a.publishDate) || a.title.localeCompare(b.title); }
function store() {
  try { localStorage.setItem(STORAGE, JSON.stringify(episodes)); }
  catch (e) { console.warn("Köttelmann-Archiv konnte nicht gespeichert werden", e); }
}
function loadStored() {
  try {
    const raw = JSON.parse(localStorage.getItem(STORAGE) || "[]");
    if (Array.isArray(raw)) episodes = raw.map(normalize).filter(Boolean).sort(compare);
  } catch (e) { console.warn("Archiv-Lesefehler", e); }
  rebuildMap();
}
function rebuildMap() { byId.clear(); episodes.forEach(e => byId.set(e.id,e)); }
function merge(list) {
  const records = new Map(episodes.map(e => [e.id,e]));
  list.map(normalize).filter(Boolean).forEach(e => {
    const previous = records.get(e.id);
    records.set(e.id, previous ? { ...previous, ...e, audioUrl:e.audioUrl || previous.audioUrl, pageUrl:e.pageUrl || previous.pageUrl } : e);
  });
  episodes = [...records.values()].sort(compare);
  rebuildMap();
  store();
}
function date(value) {
  if (!value) return "Datum unbekannt";
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? value : d.toLocaleDateString("de-DE", {day:"2-digit",month:"2-digit",year:"numeric"});
}
function time(t) {
  if (!Number.isFinite(t)) return "00:00";
  const s = Math.max(0,Math.floor(t));
  return String(Math.floor(s/60)).padStart(2,"0")+":"+String(s%60).padStart(2,"0");
}
function localArray(key) {
  try { const data=JSON.parse(localStorage.getItem(key) || "[]"); return Array.isArray(data) ? data : []; }
  catch (_) { return []; }
}
const COMPLETED = "koettelmann_completed_episodes";
const FAVORITES = "koettelmann_favorite_episodes";
function identifier(ep) { return ep.audioUrl || ep.id; }
function includes(key, ep) {
  const values=localArray(key);
  return values.includes(ep.id) || (ep.audioUrl && values.includes(ep.audioUrl));
}
function setFlag(key, ep, flag) {
  const keys = new Set(localArray(key));
  keys.delete(ep.id);
  if(ep.audioUrl) keys.delete(ep.audioUrl);
  if(flag) keys.add(identifier(ep));
  localStorage.setItem(key,JSON.stringify([...keys]));
}
function note(msg, error=false) {
  const status = $("episode-message");
  if(status) { status.textContent=msg; status.className="text-xs px-1 "+(error?"text-rose-300":"text-slate-400"); }
}
function resetCardState() {
  document.querySelectorAll(".archive-episode").forEach(card => {
    const ep=byId.get(card.dataset.episode);
    if(!ep) return;
    const heard=includes(COMPLETED,ep), favorite=includes(FAVORITES,ep);
    card.classList.toggle("border-emerald-500",heard);
    card.classList.toggle("border-amber-500",!heard);
    const heardBtn=card.querySelector(".heard-btn");
    if(heardBtn) {
      heardBtn.textContent=heard?"✓ Gehört":"○ Ungehört";
      heardBtn.className="heard-btn px-3 py-2 text-xs rounded-lg border "+(heard?"bg-emerald-950 text-emerald-300 border-emerald-600":"bg-slate-700 text-slate-200 border-slate-600");
    }
    const fav=card.querySelector(".fav-btn");
    if(fav) fav.textContent=favorite?"★ Favorit":"☆ Favorit";
  });
}
function updateNowPlaying() {
  const title=$("mini-title"), play=$("mini-toggle"), pos=$("mini-position"), seek=$("mini-seek");
  if (!title || !play || !pos || !seek) return;
  title.textContent=activeEpisode ? activeEpisode.title : "Keine Folge ausgewählt";
  play.textContent=player && !player.paused ? "Pause" : "Weiter";
  const duration=player && Number.isFinite(player.duration) ? player.duration : 0;
  const elapsed=player ? player.currentTime : 0;
  pos.textContent=time(elapsed)+" / "+time(duration);
  seek.value=duration ? Math.min(100,elapsed/duration*100) : 0;
  seek.disabled=!duration;
  document.querySelectorAll(".play-episode").forEach(b => {
    b.textContent=activeEpisode && b.dataset.id===activeEpisode.id && player && !player.paused ? "Pause" : "Start / Weiter";
  });
}
function showMini() {
  if(playerBar) playerBar.classList.remove("hidden");
  updateNowPlaying();
}
function playEpisode(ep) {
  if(!ep.audioUrl) { note("Zu dieser Folge wurde kein direkter Audiolink gefunden.",true); return; }
  if(activeEpisode?.id === ep.id && player) {
    if(player.paused) {
      player.play().then(updateNowPlaying).catch(()=>note("Audio konnte nicht gestartet werden.",true));
    } else player.pause();
    updateNowPlaying(); return;
  }
  if(player) { player.pause(); player.src=""; }
  activeEpisode=ep;
  player=new Audio();
  player.preload="metadata";
  player.src=ep.audioUrl;
  player.addEventListener("timeupdate", () => {
    if(player && Number.isFinite(player.duration) && player.duration-player.currentTime <= 20 && player.duration>0 && !completedOnEnd) {
      completedOnEnd=true; setFlag(COMPLETED,ep,true); resetCardState();
    }
    updateNowPlaying();
  });
  player.addEventListener("play",updateNowPlaying);
  player.addEventListener("pause",updateNowPlaying);
  player.addEventListener("loadedmetadata",updateNowPlaying);
  player.addEventListener("ended",()=>{
    setFlag(COMPLETED,ep,true); resetCardState(); updateNowPlaying();
  });
  player.addEventListener("error",()=>note("Die Audiodatei ist derzeit nicht abspielbar.",true));
  completedOnEnd=false;
  showMini();
  player.play().then(updateNowPlaying).catch(()=>note("Audio konnte nicht gestartet werden. Eventuell ist die Datei nicht mehr verfügbar.",true));
}
function skip(seconds) {
  if(player && Number.isFinite(player.duration))
    player.currentTime=Math.max(0,Math.min(player.duration,player.currentTime+seconds));
}
function createMini() {
  if(playerBar) return;
  const bar=element("section",null,"hidden fixed bottom-[70px] left-1/2 -translate-x-1/2 w-full max-w-md z-40 bg-slate-950 border border-amber-500 rounded-t-xl p-3 shadow-2xl space-y-2");
  bar.setAttribute("aria-label","Laufende Wiedergabe");
  const top=element("div",null,"flex gap-2 items-center");
  const title=element("span","Keine Folge ausgewählt","flex-1 min-w-0 truncate font-semibold text-amber-400 text-sm");
  title.id="mini-title";
  top.append(title,button("−5s",()=>skip(-5),"px-2 py-1 text-xs bg-slate-700 rounded-lg"));
  const toggle=button("Pause",()=>{if(activeEpisode) playEpisode(activeEpisode);},"px-3 py-1 text-xs bg-amber-500 text-slate-900 font-bold rounded-lg");
  toggle.id="mini-toggle";
  top.append(toggle,button("+5s",()=>skip(5),"px-2 py-1 text-xs bg-slate-700 rounded-lg"));
  const bottom=element("div",null,"flex items-center gap-2");
  const seek=element("input");seek.type="range";seek.min="0";seek.max="100";seek.value="0";seek.id="mini-seek";seek.className="flex-1 min-w-0";
  seek.setAttribute("aria-label","Wiedergabeposition");
  seek.addEventListener("input",()=>{
    if(player && Number.isFinite(player.duration)) player.currentTime=player.duration*Number(seek.value)/100;
  });
  const pos=element("span","00:00 / 00:00","text-[10px] text-slate-300 font-mono");
  pos.id="mini-position";
  bottom.append(seek,pos);
  bar.append(top,bottom);
  document.body.append(bar);
  playerBar=bar;
}
async function share(ep) {
  const url=new URL(location.href);
  url.search="";
  url.hash="";
  url.searchParams.set("folge",ep.id);
  const info={title:"Autohaus Köttelmann – "+ep.title,text:"Hör dir diese Köttelmann-Folge an: "+ep.title,url:url.href};
  try {
    if(navigator.share) { await navigator.share(info); return; }
    if(navigator.clipboard?.writeText) { await navigator.clipboard.writeText(url.href); note("Folgenlink in die Zwischenablage kopiert."); return; }
  } catch(e) { if(e.name==="AbortError") return; }
  window.prompt("Folgenlink kopieren:",url.href);
}
function openCard(ep) {
  if(openEpisode===ep.id) { openEpisode=null; }
  else openEpisode=ep.id;
  document.querySelectorAll(".archive-episode").forEach(card=>{
    const visible=card.dataset.episode===openEpisode;
    const details=card.querySelector(".episode-body");
    if(details) details.classList.toggle("hidden",!visible);
    card.setAttribute("aria-expanded",String(visible));
  });
  // Absichtlich keine Audio-Pause beim Schließen.
}
function renderCard(ep) {
  const card=element("article",null,"archive-episode bg-slate-800 border-2 rounded-2xl p-4 shadow-sm space-y-3");
  card.dataset.episode=ep.id;
  const head=button(ep.title,()=>openCard(ep),"w-full text-left text-amber-400 font-semibold leading-snug py-1");
  head.setAttribute("aria-label",ep.title+" – Details auf- oder zuklappen");
  card.append(head);
  const actionRow=element("div",null,"flex flex-wrap items-center gap-2");
  const heard=button("",()=>{
    if(includes(COMPLETED,ep) && !confirm("Möchtest du diese Folge wirklich wieder auf „Ungehört“ setzen?")) return;
    setFlag(COMPLETED,ep,!includes(COMPLETED,ep));
    resetCardState();
  });heard.className+=" heard-btn";
  const fav=button("",()=>{
    setFlag(FAVORITES,ep,!includes(FAVORITES,ep));resetCardState();
  },"fav-btn text-xs px-3 py-2 rounded-lg bg-slate-700 border border-slate-600");
  const shareBtn=button("Teilen",()=>share(ep),"px-3 py-2 text-xs rounded-lg bg-slate-700 border border-slate-600");
  shareBtn.setAttribute("aria-label","Folge teilen: "+ep.title);
  actionRow.append(heard,fav,shareBtn);card.append(actionRow);
  const body=element("div",null,"episode-body pt-2 border-t border-slate-600 space-y-3");
  body.classList.toggle("hidden",openEpisode!==ep.id);
  body.append(element("p","Veröffentlichung: "+date(ep.publishDate),"text-xs text-slate-300"));
  if(ep.duration!==null) body.append(element("p","Laufzeit: "+time(ep.duration>10000?ep.duration/1000:ep.duration),"text-xs text-slate-300"));
  const controls=element("div",null,"flex gap-2 items-center");
  controls.append(button("−5s",()=>skip(-5),"px-4 py-3 bg-slate-700 border border-amber-500 rounded-xl"));
  const play=button("Start / Weiter",()=>playEpisode(ep),"play-episode flex-1 py-3 bg-amber-500 text-slate-950 font-bold rounded-xl");
  play.dataset.id=ep.id;
  controls.append(play,button("+5s",()=>skip(5),"px-4 py-3 bg-slate-700 border border-amber-500 rounded-xl"));
  body.append(controls);
  if(!ep.audioUrl) body.append(element("p","Kein direkt abspielbarer Audiolink vorhanden.","text-xs text-amber-300"));
  if(ep.pageUrl) {
    const a=element("a","Folgenseite öffnen","inline-block text-xs underline text-amber-400");
    a.href=ep.pageUrl; a.rel="noopener noreferrer"; a.target="_blank";body.append(a);
  }
  card.append(body);
  return card;
}
function renderPager(total) {
  const nav=$("pagination-container"); if(!nav)return;
  nav.replaceChildren();
  if(total<=1) return;
  const first=button("‹",()=>render(currentPage-1),"px-3 py-3 bg-slate-700 border border-amber-500 rounded-xl");
  first.disabled=currentPage<=1;
  nav.append(first);
  const numbers=element("div",null,"flex flex-wrap gap-1 justify-center flex-1");
  const maxVisible=7;
  let start=Math.max(1,currentPage-Math.floor(maxVisible/2));
  let end=Math.min(total,start+maxVisible-1);
  start=Math.max(1,end-maxVisible+1);
  for(let page=start;page<=end;page++) {
    const b=button(String(page),()=>render(page),"min-w-9 py-3 px-2 text-sm rounded-lg border border-amber-500 "+(page===currentPage?"bg-amber-500 text-slate-950 font-bold":"bg-slate-700 text-white"));
    b.setAttribute("aria-label","Seite "+page+" von "+total);
    if(page===currentPage) b.setAttribute("aria-current","page");
    numbers.append(b);
  }
  nav.append(numbers);
  const next=button("›",()=>render(currentPage+1),"px-3 py-3 bg-slate-700 border border-amber-500 rounded-xl");
  next.disabled=currentPage>=total;
  nav.append(next);
}
function render(page=1, scroll=true) {
  const container=$("episode-container");
  if(!container) return;
  const total=Math.max(1,Math.ceil(episodes.length/PAGE_SIZE));
  currentPage=Math.max(1,Math.min(total,page));
  container.replaceChildren();
  const count=element("p",episodes.length+" Folgen · 100 pro Seite","text-xs text-slate-300");
  container.append(count);
  const message=element("p","","text-xs px-1 text-slate-400");
  message.id="episode-message";
  container.append(message);
  if(!episodes.length) {
    container.append(element("p","Das Archiv wird geladen. Bitte Internetverbindung prüfen.","text-sm text-amber-400 py-10 text-center"));
  } else {
    const pageItems=episodes.slice((currentPage-1)*PAGE_SIZE,currentPage*PAGE_SIZE);
    if(openEpisode && !pageItems.some(e=>e.id===openEpisode)) openEpisode=null;
    pageItems.forEach(ep=>container.append(renderCard(ep)));
    resetCardState();
    updateNowPlaying();
  }
  renderPager(total);
  if(scroll) window.scrollTo({top:0,behavior:"smooth"});
}
function focusRequested() {
  if(!requestedId || !byId.has(requestedId)) return false;
  const index=episodes.findIndex(e=>e.id===requestedId);
  if(index===-1)return false;
  openEpisode=requestedId;
  render(Math.floor(index/PAGE_SIZE)+1,false);
  requestAnimationFrame(()=>{
    const card=[...document.querySelectorAll(".archive-episode")].find(c=>c.dataset.episode===requestedId);
    if(card) card.scrollIntoView({behavior:"smooth",block:"center"});
  });
  requestedId=null;
  return true;
}
async function refresh() {
  if(loading) return;
  loading=true;let cursor=null, fetched=0;
  const seen=new Set(); let completed=false;
  try {
    for(let page=0;page<100;page++){
      if(!episodes.length) note("Lade ARD-Sounds-Archiv …");
      const response=await fetch(API,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({query:QUERY,variables:{id:SHOW,first:PAGE_SIZE,after:cursor}})});
      if(!response.ok) throw new Error("HTTP "+response.status);
      const data=await response.json();
      if(data.errors?.length) throw new Error(data.errors.map(e=>e.message).join("; "));
      const items=data.data?.programSet?.items;
      if(!items || !Array.isArray(items.nodes)) throw new Error("Unerwartetes ARD-Datenformat");
      const parsed=items.nodes.map(n=>({id:n.id,title:n.title,publishDate:n.publishDate,duration:n.duration,audioUrl:n.audios?.find(a=>a.url)?.url || ""}));
      merge(parsed);fetched+=items.nodes.length;
      const next=items.pageInfo?.endCursor;
      if(!items.pageInfo?.hasNextPage) { completed=true;break; }
      if(!next || seen.has(next)) throw new Error("ARD-Seitenzählung unvollständig");
      seen.add(next);cursor=next;
    }
    render(currentPage,false);
    if(!focusRequested()) note(completed?"Archiv aktualisiert: "+episodes.length+" Folgen.":"Archiv teilweise aktualisiert.");
  } catch(e) {
    console.warn("ARD-Archivaktualisierung:",e);
    if(!episodes.length) {
      note("ARD Sounds ist gerade nicht erreichbar. Bitte später erneut öffnen. "+e.message,true);
      if(typeof window.fetchAndParseLiveWDR==="function") window.fetchAndParseLiveWDR();
    } else {
      note("Gespeichertes Archiv verfügbar; Online-Aktualisierung derzeit nicht möglich.",true);
    }
    focusRequested();
  } finally { loading=false; }
}
function start() {
  loadStored();
  createMini();
  if(!focusRequested()) render(1,false);
  refresh();
}
window.KoettelmannArchiveApp={start};
})();