/* Agent Town (web edition) - the in-browser "server".
 *
 * The page talks to /api/... exactly as it would with a real server, but this
 * file answers those calls locally using the user's browser storage. That is
 * why there is nothing to host except static files.
 */
(function (g) {
  "use strict";
  const AT = (g.AT = g.AT || {});
  const API = { routes: [] };

  const J = (obj, status) => ({ status: status || 200, body: obj });
  const err = (message, status) => J({ error: message }, status || 400);
  const add = (method, pattern, fn) => API.routes.push({ method, re: new RegExp("^" + pattern + "$"), fn });
  const needsFlush = (method, path) => method !== "GET" && !/^\/api\/chats(\/|$)/.test(path);

  /* ----- state / setup ----- */
  add("GET", "/api/state", () => J({
    setupDone: !!AT.providers.settings().setupDone,
    persistent: AT.store.state.persistent, storageError: AT.store.state.error,
    otherTab: !!AT.otherTab, agentCount: AT.agents.list().length,
    connected: AT.providers.connected(), hasManager: !!AT.agents.manager(),
  }));
  add("POST", "/api/state/complete-setup", () => {
    const s = AT.providers.settings(); s.setupDone = true; AT.providers.save(); return J({ ok: true });
  });

  /* ----- office ----- */
  add("GET", "/api/office", () => J(AT.office.view()));
  add("POST", "/api/office/branding", (b) => J(AT.office.saveBranding(b || {})));
  add("POST", "/api/office/layout", (b) => J(AT.office.saveLayout(b || {})));
  add("POST", "/api/office/style", (b) => J(AT.office.saveStyle(b || {})));
  add("GET", "/api/boards", () => J(AT.boards.get()));
  add("POST", "/api/boards", (b) => J(AT.boards.save(b || {})));
  add("POST", "/api/office/preset", (b) => {
    const r = AT.office.applyPreset(b && b.key);
    return r.error ? err(r.error) : J(AT.office.view());
  });

  /* ----- team ----- */
  add("GET", "/api/team", () => J(AT.agents.teamView()));
  add("GET", "/api/templates", () => J({ templates: AT.agents.TEMPLATES, max: AT.agents.MAX_AGENTS }));
  add("POST", "/api/team", (b) => {
    const r = AT.agents.create(b || {});
    if (r.error) return err(r.error);
    AT.chats.ensure([r.agent.id]);
    return J({ agent_id: r.agent.id, profile: AT.agents.teamView().agents[r.agent.id] });
  });
  add("POST", "/api/team/([^/]+)", (b, m) => {
    const r = AT.agents.update(decodeURIComponent(m[1]), b || {});
    if (r.error) return err(r.error, 404);
    return J({ agent_id: r.agent.id, profile: AT.agents.teamView().agents[r.agent.id] });
  });
  add("DELETE", "/api/team/([^/]+)", (b, m) => {
    const r = AT.agents.remove(decodeURIComponent(m[1]));
    return r.error ? err(r.error, 404) : J({ ok: true });
  });

  /* ----- settings and AI connections ----- */
  function settingsView() {
    const s = AT.providers.settings(), st = AT.providers.publicStatus();
    return Object.assign({
      about: s.about, imageDailyCap: AT.images.cap(), imagesToday: AT.images.madeToday(),
    }, st);
  }
  add("GET", "/api/settings", () => J(settingsView()));
  add("POST", "/api/settings", (b) => {
    b = b || {}; const s = AT.providers.settings();
    if (typeof b.about === "string") s.about = b.about.slice(0, 12000);
    if (b.defaultProvider !== undefined) s.defaultProvider = AT.providers.PROVIDERS[b.defaultProvider] ? b.defaultProvider : s.defaultProvider;
    if (b.imageDailyCap !== undefined) { const n = parseInt(b.imageDailyCap, 10); if (Number.isFinite(n) && n >= 0 && n <= 200) s.imageDailyCap = n; }
    AT.providers.save();
    return J(settingsView());
  });
  add("POST", "/api/providers/([a-z]+)/test", async (b, m) => {
    const id = m[1];
    if (!AT.providers.PROVIDERS[id]) return err("Unknown provider.", 404);
    const key = b && typeof b.key === "string" && b.key.trim() ? b.key.trim() : undefined;
    const r = await AT.providers.test(id, key);
    return J(Object.assign({}, r, { settings: settingsView() }));
  });
  add("POST", "/api/providers/([a-z]+)/forget", (b, m) => {
    const id = m[1], s = AT.providers.settings();
    if (!s.providers[id]) return err("Unknown provider.", 404);
    s.providers[id] = AT.providers.defaultSettings().providers[id];
    if (s.defaultProvider === id) s.defaultProvider = AT.providers.connected()[0] || null;
    AT.providers.save();
    return J(settingsView());
  });

  /* ----- images ----- */
  add("GET", "/api/images/([a-f0-9]+)", (b, m) => {
    const d = AT.images.dataUrl(m[1]);
    return d ? J({ data_url: d }) : err("Image not found.", 404);
  });

  /* ----- chats ----- */
  add("GET", "/api/chats", () => J({ chats: AT.chats.list(AT.agents.order()), busy: Array.from(AT.runtime.groupBusy) }));
  add("POST", "/api/chats", (b) => {
    const ids = [];
    ((b && b.agents) || []).forEach((a) => { if (AT.agents.get(a) && !ids.includes(a)) ids.push(a); });
    if (ids.length < 2) return err("Pick at least two agents for a group.");
    const chat = AT.chats.createGroup(ids, b.title || "");
    AT.bus.emit({ type: "chat_created", chat });
    return J({ chat });
  });
  add("DELETE", "/api/chats/([^/]+)", (b, m) => {
    const id = decodeURIComponent(m[1]);
    if (!AT.chats.deleteGroup(id)) return err("Only group chats can be deleted.", 404);
    AT.bus.emit({ type: "chat_deleted", chat_id: id });
    return J({ ok: true });
  });
  add("POST", "/api/chats/([^/]+)/message", (b, m) => {
    const r = AT.runtime.dispatch(decodeURIComponent(m[1]), b && b.text);
    return r.error ? err(r.error) : J(r);
  });
  add("POST", "/api/chats/([^/]+)/plan/([^/]+)", (b, m) => {
    const r = AT.runtime.planAction(decodeURIComponent(m[1]), decodeURIComponent(m[2]), b && b.action);
    return r.error ? err(r.error) : J(r);
  });

  /* ----- backup / restore / reset ----- */
  add("GET", "/api/data/export", () => {
    const d = AT.store.dump();
    if (d.settings && d.settings.providers) Object.keys(d.settings.providers).forEach((k) => { d.settings.providers[k].key = ""; d.settings.providers[k].status = "none"; });
    delete d.pending;
    return J({ app: "agent-town-web", version: 1, exported: new Date().toISOString(), data: d });
  });
  add("POST", "/api/data/import", async (b) => {
    if (!b || b.app !== "agent-town-web" || !b.data || typeof b.data !== "object") return err("That file isn't an Agent Town backup.");
    const keep = AT.clone(AT.providers.settings().providers);
    await AT.store.wipe();
    Object.entries(b.data).forEach(([k, v]) => { AT.store.set(k, v); });
    const s = AT.providers.settings();
    Object.keys(keep).forEach((k) => { s.providers[k] = keep[k]; });          // your keys on this computer stay as they were
    AT.providers.save();
    return J({ ok: true });
  });
  add("POST", "/api/data/reset", async () => { await AT.store.wipe(); return J({ ok: true }); });

  /* ----- dispatcher ----- */
  API.handle = async function (method, path, body) {
    if (AT.otherTab && method !== "GET") return err("Agent Town is already open in another tab. Close one of them to avoid losing data.", 423);
    for (const r of API.routes) {
      if (r.method !== method) continue;
      const m = r.re.exec(path);
      if (!m) continue;
      try {
        const out = await r.fn(body, m);
        if (needsFlush(method, path)) await AT.store.flush();
        return out;
      } catch (e) { console.error("api error", path, e); return err("Something went wrong: " + ((e && e.message) || e), 500); }
    }
    return err("Not found: " + path, 404);
  };

  /* ----- make fetch("/api/...") talk to the local API ----- */
  const realFetch = g.fetch ? g.fetch.bind(g) : null;
  AT.providers._fetch = (...a) => realFetch(...a);     // calls to the AI providers still go out over the network
  if (realFetch) {
    g.fetch = async function (input, init) {
      let url = typeof input === "string" ? input : (input && input.url) || String(input);
      let u = null;
      try { u = new URL(url, g.location && g.location.href); } catch (e) { /* fall through */ }
      const local = u && g.location && u.origin === g.location.origin && u.pathname.indexOf("/api/") === 0;
      if (!local) return realFetch(input, init);
      const method = ((init && init.method) || (typeof input !== "string" && input.method) || "GET").toUpperCase();
      let body = null;
      if (init && typeof init.body === "string") { try { body = JSON.parse(init.body); } catch (e) { body = null; } }
      await AT.ready;
      const r = await API.handle(method, u.pathname, body);
      return new Response(JSON.stringify(r.body), { status: r.status, headers: { "Content-Type": "application/json" } });
    };
  }

  /* ----- start-up ----- */
  AT.api = API;
  AT.ready = (async function () {
    await AT.store.load();
    try {
      if (g.navigator && g.navigator.locks) {
        await new Promise((resolve) => {
          g.navigator.locks.request("agent-town-main", { ifAvailable: true }, (lock) => {
            if (!lock) { AT.otherTab = true; resolve(); return; }
            resolve();
            return new Promise(() => {});                   // hold the lock for as long as this tab lives
          });
        });
      }
    } catch (e) { /* locks unsupported: carry on */ }
    if (AT.otherTab) return;                                // another tab owns the data: stay read-only, write nothing
    AT.providers.settings(); AT.office.load();
    AT.office.syncDesks();
    AT.chats.ensure(AT.agents.order());
    AT.runtime.recoverInterrupted();
    await AT.store.flush();
  })();
})(typeof window !== "undefined" ? window : globalThis);
