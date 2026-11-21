/* Mahzen — Wi‑Fi ile internetsiz eşitleme (lan.js çekirdeğine bağlantı).
   Kayıtlar ana şifreden türeyen anahtarla (KEY, AES‑GCM) şifrelenerek gönderilir; iki cihazda aynı ana şifre olmalı.
   Saklama: people / titles / accounts / files (IndexedDB) + silinenler (tombs). Dosya içerikleri ayrı ayrı, yalnızca eksik tarafa gider. */
(function () {
  "use strict";
  if (!window.LanCore) return;
  const AND = window.Android && typeof window.Android.lanHttp === "function" ? window.Android : null;
  const DESK = typeof window.mahzenLanHttp === "function";
  const seq = { n: 0 }, cbs = {};
  window.__lanCb = (id, json) => { const f = cbs[id]; delete cbs[id]; if (f) f(json); };
  const parse = s => { try { return typeof s === "string" ? JSON.parse(s) : s; } catch (_) { return s; } };
  const cap = s => s.charAt(0).toUpperCase() + s.slice(1);
  function call(fn, ...a) {
    return new Promise(res => {
      const id = "l" + (++seq.n); cbs[id] = s => res(parse(s));
      if (DESK) window["mahzen" + cap(fn)](id, ...a); else AND[fn](id, ...a);
    });
  }
  const NAT = {};
  if (DESK) {
    ["lanServe", "lanStop", "lanResetKey", "lanHttp", "lanFind"].forEach(f => { NAT[f] = () => {}; });
    NAT.lanInfo = () => window.mahzenLanInfo();
    NAT.lanReply = (rid, json) => window.mahzenLanReply(rid, json);
  } else if (AND) {
    NAT.lanHttp = () => {}; NAT.lanFind = () => {};
  }
  const STORE_ARR = () => ({ people, titles, accounts, files });
  const stampOf = d => Number(d && (d.updated || d.created)) || 1;
  let tombCache = [];

  async function exportState() {
    const docs = {}, dels = {};
    const arrs = STORE_ARR();
    for (const s of SYNCED) for (const r of arrs[s]) { const m = Object.assign({}, r); delete m.blob; docs[s + "_" + r.id] = m; }
    tombCache = await getAll("tombs");
    for (const tb of tombCache) dels[tb.id] = tb.at;
    return { docs, dels };
  }

  async function applyState(merged) {
    const arrs = STORE_ARR();
    applyingRemote = true;
    try {
      for (const [key, rec0] of Object.entries(merged.docs)) {
        const i = key.indexOf("_"), s = key.slice(0, i), id = key.slice(i + 1), arr = arrs[s];
        if (!arr) continue;
        const local = arr.find(r => r.id === id);
        const lm = local ? Object.assign({}, local) : null; if (lm) delete lm.blob;
        if (lm && LanCore.canon(lm) === LanCore.canon(rec0)) continue;
        const rec = Object.assign({}, rec0);
        if (s === "files" && local && local.blob) rec.blob = local.blob;
        if (s === "accounts") await storeAccount(rec); else await putIn(s, rec);
        if (tombCache.some(tb => tb.id === key)) await delIn("tombs", key);
        if (local) arr[arr.indexOf(local)] = rec; else arr.push(rec);
        if (s === "files" && typeof thumbUrls !== "undefined" && thumbUrls.has(id)) { URL.revokeObjectURL(thumbUrls.get(id)); thumbUrls.delete(id); }
      }
      for (const s of SYNCED) {
        const arr = arrs[s];
        for (const r of arr.slice()) {
          const key = s + "_" + r.id;
          if (merged.docs[key]) continue;
          await delIn(s, r.id);
          await putIn("tombs", { id: key, s, rid: r.id, at: merged.dels[key] || Date.now() });
          arr.splice(arr.indexOf(r), 1);
        }
      }
      for (const [key, at] of Object.entries(merged.dels)) {
        if (merged.docs[key] || tombCache.some(tb => tb.id === key)) continue;
        const s = key.slice(0, key.indexOf("_"));
        await putIn("tombs", { id: key, s, rid: key.slice(s.length + 1), at });
      }
      if (merged.conflicts.length) {
        const b = (await getOne("meta", "lanBackup")) || { id: "lanBackup", list: [] };
        merged.conflicts.forEach(d => b.list.unshift({ at: Date.now(), d }));
        b.list = b.list.slice(0, 200);
        await putIn("meta", b);
      }
    } finally { applyingRemote = false; }
    try { renderAll(); setHeader(); } catch (_) { /* ekran henüz hazır değil */ }
    scheduleSync();
  }

  const fileRec = id => files.find(f => f.id === id);
  async function blobToB64(blob) { return b64(new Uint8Array(await blob.arrayBuffer())); }

  LanCore.init({
    app: "mahzen",
    native: NAT,
    call,
    lang: () => (typeof lang === "string" ? lang : "tr"),
    isDesktop: () => DESK,
    account: () => (master && master.salt) || "",
    ready: () => (KEY ? "" : "e_master"),
    device: () => ({ id: "", name: DESK ? "Mahzen PC" : "Mahzen Telefon" }),
    busy: () => !!syncBusy,
    exportState,
    applyState,
    stamp: stampOf,
    seal: async str => encBytes(te.encode(str)),
    unseal: async str => td.decode(await decBytes(str)),
    blobIds: st => Object.keys(st.docs).filter(k => k.startsWith("files_")).map(k => k.slice(6)),
    hasBlob: id => { const f = fileRec(id); return !!(f && f.blob); },
    getBlob: async id => { const f = fileRec(id); return f && f.blob ? (f.blob.type || "") + "|" + await blobToB64(f.blob) : ""; },
    putBlob: async (id, data) => {
      const f = fileRec(id); if (!f || f.blob || !data) return;
      const i = data.indexOf("|"), type = data.slice(0, i), bytes = unb64(data.slice(i + 1));
      f.blob = new Blob([bytes], { type: type || f.type || "" });
      applyingRemote = true; try { await putIn("files", f); } finally { applyingRemote = false; }
    },
    photosChanged: () => { try { renderAll(); } catch (_) { /* */ } },
    loadMeta: () => { try { return JSON.parse(localStorage.getItem("mahzenWifi") || "{}"); } catch (_) { return {}; } },
    saveMeta: m => { try { localStorage.setItem("mahzenWifi", JSON.stringify(m)); } catch (_) { /* */ } },
    refresh: () => { try { renderAll(); setHeader(); } catch (_) { /* */ } }
  });

  const TT = { tr: "📶 Wi‑Fi ile eşitleme (internetsiz)", en: "📶 Wi‑Fi sync (no internet)", ar: "📶 المزامنة عبر Wi‑Fi (بدون إنترنت)" };
  function addUi() {
    const sb = document.getElementById("syncBtn");
    if (sb && !document.getElementById("wifiBtn")) {
      const b = document.createElement("button");
      b.id = "wifiBtn"; b.textContent = TT[lang] || TT.tr;
      b.onclick = () => { document.getElementById("menu").classList.remove("on"); LanCore.open(); };
      sb.insertAdjacentElement("afterend", b);
    }
    const hs = document.getElementById("hdrSync");
    if (hs && !document.getElementById("hdrWifi")) {
      const h = document.createElement("button");
      h.id = "hdrWifi"; h.className = hs.className.replace(/\b(hidden|busy|ok|err)\b/g, "").trim();
      h.title = TT[lang] || TT.tr; h.textContent = "📶"; h.style.fontSize = "16px";
      h.onclick = e => { e.stopPropagation(); LanCore.open(); };
      hs.insertAdjacentElement("afterend", h);
    }
    const w = document.getElementById("wifiBtn"); if (w) w.textContent = TT[lang] || TT.tr;
  }
  addUi();
  document.addEventListener("click", () => setTimeout(addUi, 0), true);
  // kilit açıldıktan sonra, aynı ağdaysa sessizce dener
  const auto = () => { if (KEY) LanCore.autoTry(); };
  setInterval(() => { if (!document.hidden) auto(); }, 120000);
  setTimeout(auto, 6000);
  document.addEventListener("visibilitychange", () => { if (!document.hidden) setTimeout(auto, 2000); });
})();
