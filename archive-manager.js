/* Köttelmann: Archiv-/Import-/Exportmenü mit sichtbarem Button */
(function () {
  "use strict";
  const KEY = "koettelmann_ard_archive_v1";
  const SHOW = "urn:ard:show:dcbb8113dbb01ef3";
  const API = "https://api.ardaudiothek.de/graphql";
  const LIMIT = 100;
  let archive = [];
  let currentPage = 1;
  let inArchive = false;
  let busy = false;
  let lastTap = 0;
  let taps = 0;

  function safeUrl(value) {
    if (typeof value !== "string") return "";
    try {
      const u = new URL(value);
      return u.protocol === "https:" ? u.href : "";
    } catch (_) { return ""; }
  }
  function normalize(raw) {
    if (!raw || typeof raw !== "object") return null;
    const id = String(raw.id || raw.urn || raw.episodeId || "").trim();
    const title = String(raw.title || raw.name || "").trim();
    const pageUrl = safeUrl(raw.pageUrl || raw.url || raw.episodeUrl || "");
    const audioUrl = safeUrl(raw.audioUrl || raw.audio_url || (raw.audios && raw.audios[0] && raw.audios[0].url) || "");
    if (!id && !pageUrl) return null;
    if (!title) return null;
    return {
      id: id || pageUrl,
      title: title.slice(0, 500),
      publishDate: String(raw.publishDate || raw.date || "").slice(0, 32),
      duration: Number.isFinite(Number(raw.duration)) ? Number(raw.duration) : null,
      pageUrl: pageUrl || (id.startsWith("urn:") ? "https://www.ardsounds.de/episode/" + encodeURIComponent(id) + "/" : ""),
      audioUrl,
      availableTo: String(raw.availableTo || "").slice(0, 32)
    };
  }
  function merge(items) {
    const byId = new Map();
    archive.forEach(item => byId.set(item.id, item));
    items.map(normalize).filter(Boolean).forEach(item => {
      byId.set(item.id, Object.assign({}, byId.get(item.id) || {}, item));
    });
    archive = Array.from(byId.values()).sort((a, b) => b.publishDate.localeCompare(a.publishDate) || a.title.localeCompare(b.title));
    try { localStorage.setItem(KEY, JSON.stringify(archive)); }
    catch (e) { throw new Error("Speicher voll: Bitte zuerst eine JSON-Sicherung exportieren."); }
  }
  function load() {
    try {
      const value = JSON.parse(localStorage.getItem(KEY) || "[]");
      archive = (Array.isArray(value) ? value : []).map(normalize).filter(Boolean);
    } catch (_) { archive = []; }
  }
  function el(name, text, cls) {
    const node = document.createElement(name);
    if (text !== undefined && text !== null) node.textContent = text;
    if (cls) node.className = cls;
    return node;
  }
  function button(text, action, css) {
    const b = el("button", text, css || "px-4 py-3 rounded-xl bg-slate-700 text-white border border-slate-500");
    b.type = "button";
    b.addEventListener("click", action);
    return b;
  }
  function updateStatus(message) {
    const s = document.getElementById("archive-status");
    if (s) s.textContent = message;
  }
  function openMenu() {
    let shade = document.getElementById("archive-menu");
    if (shade) { shade.classList.remove("hidden"); return; }
    shade = el("div", null, "fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4");
    shade.id = "archive-menu";
    shade.setAttribute("role", "dialog");
    shade.setAttribute("aria-modal", "true");
    shade.setAttribute("aria-label", "Archivverwaltung");
    const panel = el("div", null, "bg-slate-800 border border-amber-500 rounded-2xl p-5 w-full max-w-md space-y-3 text-slate-100 shadow-2xl");
    panel.append(el("h2", "Köttelmann – Archivverwaltung", "text-xl font-bold text-amber-400"));
    panel.append(el("p", "ARD Sounds: Folgen sammeln, sichern und wiederherstellen. Die Suche benötigt Internet.", "text-sm text-slate-300"));
    panel.append(button("Alle Folgen suchen / aktualisieren", collect, "w-full px-4 py-3 rounded-xl bg-amber-500 text-slate-900 font-bold"));
    panel.append(button("Archiv anzeigen (100 pro Seite)", () => { closeMenu(); renderArchive(1); }, "w-full px-4 py-3 rounded-xl bg-slate-700 border border-amber-500"));
    panel.append(button("JSON exportieren", exportJson, "w-full px-4 py-3 rounded-xl bg-slate-700"));
    const importButton = button("JSON importieren", () => fileInput.click(), "w-full px-4 py-3 rounded-xl bg-slate-700");
    const fileInput = el("input");
    fileInput.type = "file";
    fileInput.accept = ".json,application/json";
    fileInput.className = "hidden";
    fileInput.addEventListener("change", () => importJson(fileInput));
    panel.append(importButton, fileInput);
    const status = el("p", "", "text-xs text-slate-300 whitespace-pre-wrap");
    status.id = "archive-status";
    status.setAttribute("aria-live", "polite");
    panel.append(status);
    panel.append(button("Schließen", closeMenu, "w-full px-4 py-2 rounded-xl bg-slate-900 border border-slate-600"));
    shade.append(panel);
    shade.addEventListener("click", ev => { if (ev.target === shade) closeMenu(); });
    document.body.append(shade);
    updateStatus(archive.length + " Folgen lokal gespeichert.");
  }
  function closeMenu() {
    const m = document.getElementById("archive-menu");
    if (m) m.classList.add("hidden");
  }
  function exportJson() {
    const payload = {
      format: "koettelmann-archive", version: 1,
      source: "https://www.ardsounds.de/sendung/wdr-4-autohaus-koettelmann/" + SHOW + "/",
      exportedAt: new Date().toISOString(), count: archive.length, episodes: archive
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], {type: "application/json"});
    const url = URL.createObjectURL(blob);
    const a = el("a");
    a.href = url;
    a.download = "koettelmann-folgen-" + new Date().toISOString().slice(0, 10) + ".json";
    document.body.append(a);
    a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
    updateStatus(archive.length + " Folgen exportiert.");
  }
  async function importJson(input) {
    const file = input.files && input.files[0];
    if (!file) return;
    try {
      if (file.size > 10 * 1024 * 1024) throw new Error("JSON-Datei zu groß (max. 10 MB).");
      const data = JSON.parse(await file.text());
      const episodes = Array.isArray(data) ? data : data.episodes;
      if (!Array.isArray(episodes)) throw new Error("Ungültiges Format: Array 'episodes' fehlt.");
      if (episodes.length > 10000) throw new Error("Zu viele Einträge (max. 10.000).");
      const before = archive.length;
      merge(episodes);
      updateStatus("Import abgeschlossen: " + archive.length + " Folgen (" + (archive.length - before) + " neue).");
      if (inArchive) renderArchive(currentPage);
    } catch (error) { updateStatus("Import fehlgeschlagen: " + error.message); }
    input.value = "";
  }
  async function collect() {
    if (busy) return;
    busy = true;
    let cursor = null;
    let fetched = 0;
    let batchCount = 0;
    const query = "query Archive($id: ID!, $first: Int!, $after: Cursor) { programSet(id: $id) { items(first: $first, after: $after, orderBy: PUBLISH_DATE_DESC, filter: { isPublished: { equalTo: true } }) { pageInfo { hasNextPage endCursor } nodes { id title publishDate duration audios { url } } } } }";
    try {
      const seen = new Set();
      for (let page = 0; page < 100; page++) {
        updateStatus("Lese ARD Sounds … " + fetched + " Folgen gefunden.");
        const res = await fetch(API, {
          method: "POST", headers: {"Content-Type": "application/json"},
          body: JSON.stringify({query, variables: {id: SHOW, first: LIMIT, after: cursor}})
        });
        if (!res.ok) throw new Error("ARD-API antwortet mit HTTP " + res.status + ".");
        const data = await res.json();
        if (data.errors && data.errors.length) throw new Error(data.errors.map(x => x.message).join("; "));
        const connection = data.data && data.data.programSet && data.data.programSet.items;
        if (!connection || !Array.isArray(connection.nodes)) throw new Error("ARD-Schnittstelle lieferte kein erwartetes Episodenformat.");
        const items = connection.nodes.map(n => ({
          id: n.id, title: n.title, publishDate: n.publishDate, duration: n.duration,
          audioUrl: (n.audios || []).map(a => a.url).find(Boolean) || ""
        }));
        merge(items);
        fetched += items.length;
        batchCount++;
        const next = connection.pageInfo && connection.pageInfo.endCursor;
        if (!connection.pageInfo || !connection.pageInfo.hasNextPage) break;
        if (!next || seen.has(next)) throw new Error("Paginierung ohne neuen Cursor abgebrochen.");
        seen.add(next);
        cursor = next;
        if (page === 99) throw new Error("Sicherheitslimit von 100 API-Seiten erreicht.");
      }
      updateStatus("Fertig: " + fetched + " Einträge aus " + batchCount + " API-Seiten gelesen; " + archive.length + " Folgen lokal vorhanden. Jetzt JSON exportieren.");
      if (inArchive) renderArchive(1);
    } catch (error) {
      updateStatus("Suche unterbrochen nach " + fetched + " Einträgen. Bereits gefundene Folgen bleiben gespeichert. " + error.message + " (Bei CORS/API-Problemen muss die Datenanbindung angepasst werden.)");
    } finally { busy = false; }
  }
  function renderArchive(page) {
    inArchive = true;
    const container = document.getElementById("episode-container");
    const nav = document.getElementById("pagination-container");
    if (!container || !nav) return;
    if (typeof activeAudio !== "undefined" && activeAudio) { activeAudio.pause(); activeAudio = null; }
    const max = Math.max(1, Math.ceil(archive.length / LIMIT));
    currentPage = Math.min(max, Math.max(1, page));
    container.replaceChildren();
    const top = el("div", null, "flex justify-between items-center gap-2");
    top.append(el("h2", "ARD-Archiv (" + archive.length + " Folgen)", "text-amber-400 font-bold"));
    top.append(button("Live-Ansicht", () => location.reload(), "text-xs px-3 py-2 bg-slate-700 rounded-lg"));
    container.append(top);
    archive.slice((currentPage - 1) * LIMIT, currentPage * LIMIT).forEach(item => {
      const card = el("article", null, "bg-slate-800 border-2 border-amber-500 rounded-2xl p-4 space-y-2");
      card.append(el("h3", item.title, "font-semibold text-amber-400"));
      if (item.publishDate) card.append(el("p", new Date(item.publishDate).toLocaleDateString("de-DE"), "text-xs text-slate-300"));
      const controls = el("div", null, "flex flex-wrap gap-2 items-center");
      if (item.audioUrl) {
        const audio = el("audio");
        audio.controls = true;
        audio.preload = "none";
        audio.src = item.audioUrl;
        audio.className = "w-full";
        controls.append(audio);
      } else {
        controls.append(el("span", "Keine Audio-URL vorhanden", "text-xs text-amber-300"));
      }
      if (item.pageUrl) {
        const a = el("a", "Bei ARD Sounds öffnen", "text-xs underline text-amber-400");
        a.href = item.pageUrl; a.target = "_blank"; a.rel = "noopener noreferrer";
        controls.append(a);
      }
      const favKey = item.audioUrl || item.id;
      const fav = button("☆ Favorit", () => {
        const list = getFavoriteEpisodes();
        const ix = list.indexOf(favKey);
        if (ix >= 0) list.splice(ix, 1); else list.push(favKey);
        localStorage.setItem(STORAGE_KEY_FAVORITES, JSON.stringify(list));
        fav.textContent = list.includes(favKey) ? "★ Favorit" : "☆ Favorit";
      }, "text-xs px-3 py-2 rounded-lg bg-slate-700");
      fav.textContent = getFavoriteEpisodes().includes(favKey) ? "★ Favorit" : "☆ Favorit";
      controls.append(fav);
      const heard = button("Gehört", () => {
        const list = getCompletedEpisodes();
        const ix = list.indexOf(favKey);
        if (ix >= 0) list.splice(ix, 1); else list.push(favKey);
        setCompletedEpisodes(list);
        heard.textContent = list.includes(favKey) ? "✓ Gehört" : "○ Ungehört";
      }, "text-xs px-3 py-2 rounded-lg bg-slate-700");
      heard.textContent = getCompletedEpisodes().includes(favKey) ? "✓ Gehört" : "○ Ungehört";
      controls.append(heard);
      card.append(controls);
      container.append(card);
    });
    if (!archive.length) container.append(el("p", "Noch keine Folgen gespeichert. Öffne das Menü mit fünf schnellen Tipps auf das Headerbild und starte die Suche.", "text-sm text-slate-300"));
    nav.replaceChildren();
    nav.append(button("←", () => renderArchive(currentPage - 1), "p-3 rounded-xl bg-slate-700"));
    nav.lastChild.disabled = currentPage <= 1;
    nav.append(el("span", "Seite " + currentPage + " / " + max, "text-sm font-medium"));
    nav.append(button("→", () => renderArchive(currentPage + 1), "p-3 rounded-xl bg-slate-700"));
    nav.lastChild.disabled = currentPage >= max;
    window.scrollTo({top: 0, behavior: "smooth"});
  }

  function init() {
    load();
    const openButton = document.getElementById("open-archive-manager");
    if (openButton) openButton.addEventListener("click", openMenu);
    const image = document.querySelector("header img");
    if (!image) return;
    image.style.cursor = "pointer";
    image.addEventListener("click", () => {
      const now = Date.now();
      taps = now - lastTap < 650 ? taps + 1 : 1;
      lastTap = now;
      if (taps >= 5) { taps = 0; openMenu(); }
    });
    document.addEventListener("keydown", e => { if (e.key === "Escape") closeMenu(); });
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();
