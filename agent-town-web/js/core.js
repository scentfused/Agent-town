/* Agent Town (web edition) - core helpers: namespace, events, and local storage.
 *
 * Everything the user creates (company, agents, chats, API keys) is saved in
 * THEIR OWN browser (IndexedDB). Nothing is sent to any Agent Town server;
 * there isn't one. Prompts go straight from the browser to the AI provider
 * the user connected.
 */
(function (g) {
  "use strict";
  const AT = (g.AT = g.AT || {});

  /* ---------- small utilities ---------- */
  AT.uid = (n) => {
    const len = n || 12;
    let out = "";
    try {
      const a = new Uint8Array(len); (g.crypto || {}).getRandomValues(a);
      a.forEach((b) => { out += (b % 16).toString(16); });
    } catch (e) { for (let i = 0; i < len; i++) out += Math.floor(Math.random() * 16).toString(16); }
    return out;
  };
  AT.sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  AT.clone = (o) => JSON.parse(JSON.stringify(o));
  AT.now = () => Date.now() / 1000;
  AT.slug = (s) => String(s || "").toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 24) || "agent";
  AT.hash = (s) => { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; };

  /* ---------- event bus (replaces the old websocket) ---------- */
  const subs = [];
  AT.bus = {
    on(fn) { subs.push(fn); return () => { const i = subs.indexOf(fn); if (i >= 0) subs.splice(i, 1); }; },
    emit(msg) { subs.slice().forEach((fn) => { try { fn(msg); } catch (e) { console.error("event handler failed", e); } }); },
  };

  /* ---------- storage: IndexedDB, with a memory fallback ---------- */
  const DB_NAME = "agent-town", STORE = "kv";
  const mem = {};
  const dirty = new Set();
  let idb = null, flushTimer = null, flushing = Promise.resolve();
  const state = { persistent: false, error: "" };

  function openDb() {
    return new Promise((resolve, reject) => {
      if (typeof indexedDB === "undefined") return reject(new Error("IndexedDB is not available"));
      let r;
      try { r = indexedDB.open(DB_NAME, 1); } catch (e) { return reject(e); }
      r.onupgradeneeded = () => { r.result.createObjectStore(STORE); };
      r.onsuccess = () => resolve(r.result);
      r.onerror = () => reject(r.error || new Error("could not open the browser database"));
      r.onblocked = () => reject(new Error("the browser database is blocked by another tab"));
    });
  }

  async function load() {
    try {
      idb = await openDb();
      await new Promise((resolve, reject) => {
        const rq = idb.transaction(STORE, "readonly").objectStore(STORE).openCursor();
        rq.onsuccess = () => { const c = rq.result; if (c) { mem[c.key] = c.value; c.continue(); } else resolve(); };
        rq.onerror = () => reject(rq.error);
      });
      state.persistent = true;
    } catch (e) {
      state.persistent = false; state.error = String((e && e.message) || e);
    }
  }

  function doFlush() {
    const keys = Array.from(dirty); dirty.clear();
    if (!keys.length || !idb) return Promise.resolve();
    return new Promise((resolve) => {
      try {
        const tx = idb.transaction(STORE, "readwrite"), os = tx.objectStore(STORE);
        keys.forEach((k) => { if (mem[k] === undefined) os.delete(k); else os.put(mem[k], k); });
        tx.oncomplete = () => resolve();
        tx.onerror = tx.onabort = () => { state.error = "Saving to the browser failed: " + ((tx.error && tx.error.message) || "unknown error"); resolve(); };
      } catch (e) { state.error = String(e); resolve(); }
    });
  }
  function schedule() {
    if (flushTimer) return;
    flushTimer = setTimeout(() => { flushTimer = null; flushing = flushing.then(doFlush); }, 150);
  }

  AT.store = {
    state,
    load,
    get(key, def) { return mem[key] === undefined ? def : mem[key]; },
    set(key, value) { mem[key] = value; dirty.add(key); schedule(); return value; },
    del(key) { delete mem[key]; dirty.add(key); schedule(); },
    keys(prefix) { return Object.keys(mem).filter((k) => !prefix || k.startsWith(prefix)); },
    /** Wait until everything is written. Call before reloading the page. */
    async flush() {
      if (flushTimer) { clearTimeout(flushTimer); flushTimer = null; }
      flushing = flushing.then(doFlush);
      await flushing;
    },
    /** Everything, for backups. */
    dump() { return AT.clone(mem); },
    async wipe() { Object.keys(mem).forEach((k) => { delete mem[k]; dirty.add(k); }); await AT.store.flush(); },
  };

  if (typeof g.addEventListener === "function") {
    g.addEventListener("pagehide", () => { AT.store.flush(); });
    g.addEventListener("visibilitychange", () => { if (g.document && g.document.hidden) AT.store.flush(); });
  }
})(typeof window !== "undefined" ? window : globalThis);
