/* Agent Town (web edition) - screens the original office page did not have:
 * the first-run wizard, the agent editor, AI connections, company notes,
 * backup, and the little warning banners. */
(function (g) {
  "use strict";
  const doc = g.document;
  const UI = (g.AT_UI = { tabs: {} });

  const esc = (t) => String(t == null ? "" : t).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const $ = (root, sel) => root.querySelector(sel);
  const $$ = (root, sel) => Array.from(root.querySelectorAll(sel));

  async function api(method, url, body) {
    const res = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: body ? JSON.stringify(body) : undefined });
    let data = null; try { data = await res.json(); } catch (e) { /* empty */ }
    if (!res.ok || (data && data.error)) throw new Error((data && data.error) || "Something went wrong (" + res.status + ").");
    return data;
  }
  async function reloadPage() { try { await AT.store.flush(); } catch (e) { /* carry on */ } g.location.reload(); }
  UI.reload = reloadPage;

  /* ---------- logo: shrink to a sensible size before storing ---------- */
  function readLogo(file) {
    return new Promise((resolve, reject) => {
      if (!file) return reject(new Error("No file chosen."));
      if (!/^image\/(png|jpe?g|webp|svg\+xml)$/.test(file.type)) return reject(new Error("Please choose a PNG, JPG, WEBP or SVG image."));
      if (file.size > 8 * 1024 * 1024) return reject(new Error("That image is over 8 MB. Please choose a smaller one."));
      const fr = new FileReader();
      fr.onerror = () => reject(new Error("Could not read that file."));
      fr.onload = () => {
        if (file.type === "image/svg+xml") return resolve(fr.result);
        const img = new Image();
        img.onerror = () => reject(new Error("That doesn't look like a valid image."));
        img.onload = () => {
          const k = Math.min(1, 512 / Math.max(img.width, img.height));
          const c = doc.createElement("canvas"); c.width = Math.max(1, Math.round(img.width * k)); c.height = Math.max(1, Math.round(img.height * k));
          c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
          resolve(c.toDataURL("image/png"));
        };
        img.src = fr.result;
      };
      fr.readAsDataURL(file);
    });
  }

  function el(html) { const d = doc.createElement("div"); d.innerHTML = html.trim(); return d.firstElementChild; }

  /* ---------- provider cards (shared by the wizard and the dashboard tab) ---------- */
  function providerCard(id, info, onChange) {
    const connected = info.status === "ok" && info.hasKey;
    const card = el(`<div class="pv-card ${connected ? "ok" : ""}" data-p="${id}">
      <div class="pv-head"><b>${esc(info.label)}</b><span class="pv-tag ${info.free ? "free" : "paid"}">${info.free ? "Free tier" : "Paid (pay per use)"}</span></div>
      <p class="pv-blurb">${esc(info.blurb)}</p>
      <div class="pv-state"></div>
      <label class="pv-lab">API key <a href="${esc(info.keyUrl)}" target="_blank" rel="noopener noreferrer">Get a key</a></label>
      <div class="pv-row"><input type="password" class="pv-key" autocomplete="off" spellcheck="false" placeholder="${info.hasKey ? "Saved on this computer " + esc(info.keyHint) + " (paste a new one to replace)" : "Paste your key here"}">
      <button type="button" class="at-btn pv-test">${connected ? "Re-test" : "Test &amp; connect"}</button></div>
      <div class="pv-msg" role="status"></div>
      ${info.hasKey ? `<button type="button" class="at-link pv-forget">Remove this key from this browser</button>` : ""}
    </div>`);
    const state = $(card, ".pv-state"), msg = $(card, ".pv-msg");
    if (connected) state.innerHTML = `<span class="pv-dot ok"></span> Connected${info.model ? " &middot; " + esc(info.model) : ""}`;
    else if (info.status === "error") { state.innerHTML = `<span class="pv-dot bad"></span> Not working`; msg.textContent = info.error || ""; msg.className = "pv-msg bad"; }
    $(card, ".pv-test").onclick = async (ev) => {
      const btn = ev.currentTarget, key = $(card, ".pv-key").value.trim();
      if (!key && !info.hasKey) { msg.textContent = "Paste your API key first."; msg.className = "pv-msg bad"; return; }
      btn.disabled = true; msg.className = "pv-msg"; msg.textContent = "Checking with " + info.short + "...";
      try {
        const r = await api("POST", "/api/providers/" + id + "/test", key ? { key } : {});
        msg.textContent = r.message || (r.ok ? "Connected." : "That didn't work."); msg.className = "pv-msg " + (r.ok ? "good" : "bad");
        if (onChange) onChange(r.settings);
      } catch (e) { msg.textContent = e.message; msg.className = "pv-msg bad"; }
      btn.disabled = false;
    };
    const f = $(card, ".pv-forget");
    if (f) f.onclick = async () => { try { const s = await api("POST", "/api/providers/" + id + "/forget"); if (onChange) onChange(s); } catch (e) { msg.textContent = e.message; } };
    return card;
  }
  const PRIVACY = `<p class="at-note"><b>Your key stays on this computer.</b> It is stored in this browser only and is sent only to the AI company you choose (Google, OpenAI or Anthropic). Agent Town has no server and never sees it.</p>
    <p class="at-note">Why a key and not my Claude or ChatGPT login? A website can't borrow a Claude.ai or ChatGPT subscription. Those companies sell API access separately, and Gemini's free tier is the easiest way to start at no cost.</p>`;

  /* ---------- office plans: small map + picker ---------- */
  const FSZ = { sofa: [3, 1, "#5b6fb5"], table: [2, 1, "#a4714a"], shelf: [3, 1, "#7a5230"], counter: [2, 1, "#4a5266"], cooler: [1, 1, "#9bd6f5"], showcase: [2, 1, "#8fd0e6"] };
  function miniMap(P) {
    const S = 12, c = doc.createElement("canvas"); c.width = 14 * S; c.height = 11 * S; c.className = "mini-map";
    const x = c.getContext("2d");
    x.fillStyle = "#cdb08a"; x.fillRect(0, 0, c.width, c.height);
    x.fillStyle = "#e0b15a"; x.fillRect(2 * S, 2 * S, 3 * S, S);                      // your desk
    Object.keys(P.furniture).forEach((k) => { const f = FSZ[k], p = P.furniture[k]; x.fillStyle = f[2]; x.fillRect(p.x * S, p.y * S, f[0] * S, f[1] * S); });
    x.fillStyle = "#3b8a4a"; P.plants.forEach((p) => { x.beginPath(); x.arc(p[0] * S + S / 2, p[1] * S + S / 2, S / 2 - 1, 0, 7); x.fill(); });
    P.slots.forEach((s, i) => { x.fillStyle = i === 0 ? "#f0c24b" : "#7c5334"; x.fillRect(s[0] * S, s[1] * S, 2 * S, S); x.fillStyle = "#2a2348"; x.fillRect((s[0] - 1) * S + 2, s[1] * S + 2, S - 4, S - 4); });
    x.strokeStyle = "rgba(0,0,0,.25)"; x.strokeRect(0.5, 0.5, c.width - 1, c.height - 1);
    return c;
  }
  UI.planPicker = function (presets, current, onPick) {
    const wrap = el(`<div class="plan-grid"></div>`);
    Object.keys(presets).forEach((k) => {
      const P = presets[k];
      const b = el(`<button type="button" class="plan ${k === current ? "on" : ""}" data-k="${k}"><span class="plan-map"></span><b>${esc(P.label)}</b><small>${esc(P.desc)}</small><small class="plan-n">Up to ${P.slots.length} desks in the plan</small></button>`);
      $(b, ".plan-map").appendChild(miniMap(P));
      b.onclick = () => onPick(k);
      wrap.appendChild(b);
    });
    return wrap;
  };

  /* ---------- the wizard ---------- */
  UI.runWizard = function () {
    return new Promise(() => {
      const st = { step: 0, name: "", logo: null, about: "", plan: "classic", picks: {}, custom: [] };
      let presets = {};
      let templates = [], max = 10, settings = null;
      const root = el(`<div id="wiz" role="dialog" aria-modal="true" aria-label="Set up Agent Town"><div class="wiz-card"></div></div>`);
      doc.body.appendChild(root);
      const card = $(root, ".wiz-card");
      const STEPS = ["Welcome", "Your company", "Your office", "Connect your AI", "Your team"];

      const head = () => `<div class="wiz-steps">${STEPS.map((s, i) => `<span class="${i === st.step ? "on" : i < st.step ? "done" : ""}">${i + 1}</span>`).join("")}</div>`;
      const nav = (back, nextLabel, nextOff) => `<div class="wiz-nav">${back ? `<button class="at-btn ghost" data-a="back">Back</button>` : "<span></span>"}<button class="at-btn primary" data-a="next" ${nextOff ? "disabled" : ""}>${nextLabel}</button></div>`;

      async function refreshSettings() { settings = await api("GET", "/api/settings"); }

      function show() {
        if (st.step === 0) {
          card.innerHTML = head() + `<h1>Welcome to Agent Town</h1>
            <p class="lead">Build a small AI office for your business. You create the agents (marketing, sales, finance, whatever you need), give them tasks, and they deliver drafts for you to approve.</p>
            <ul class="wiz-list"><li>Takes about 3 minutes.</li><li>Works in any modern browser, nothing to install.</li><li>You use your <b>own</b> AI account, so you stay in control of cost and privacy.</li></ul>
            <p class="at-note">Everything you create is saved in this browser. You can back it up to a file any time.</p>` + nav(false, "Get started");
        } else if (st.step === 1) {
          card.innerHTML = head() + `<h1>Your company</h1><p class="lead">This names your office and helps your agents write in your voice.</p>
            <label class="f-lab">Company or brand name</label><input class="at-in" id="w-name" maxlength="60" placeholder="e.g. Sunrise Bakery" value="${esc(st.name)}">
            <label class="f-lab">Logo <span class="opt">(optional)</span></label>
            <div class="logo-row"><div class="logo-box" id="w-logo">${st.logo ? `<img alt="logo" src="${esc(st.logo)}">` : "No logo"}</div>
              <div><input type="file" id="w-file" accept="image/png,image/jpeg,image/webp,image/svg+xml"><div class="at-note" id="w-logo-msg"></div></div></div>
            <label class="f-lab">What does your company do? <span class="opt">(optional, you can add more later)</span></label>
            <textarea class="at-in" id="w-about" rows="5" maxlength="12000" placeholder="Products, prices, customers, tone of voice, targets... The more you write, the better your agents answer.">${esc(st.about)}</textarea>` + nav(true, "Continue", !st.name.trim());
          const name = $(card, "#w-name"), next = $(card, '[data-a="next"]');
          name.oninput = () => { st.name = name.value; next.disabled = !name.value.trim(); };
          $(card, "#w-about").oninput = (e) => { st.about = e.target.value; };
          $(card, "#w-file").onchange = async (e) => {
            const m = $(card, "#w-logo-msg"); m.textContent = "";
            try { st.logo = await readLogo(e.target.files[0]); $(card, "#w-logo").innerHTML = `<img alt="logo" src="${esc(st.logo)}">`; } catch (err) { m.textContent = err.message; }
          };
        } else if (st.step === 2) {
          card.innerHTML = head() + `<h1>Choose your office</h1><p class="lead">Pick a starting plan. You can move every desk and piece of furniture later in the Dashboard.</p><div class="plan-slot"></div>` + nav(true, "Continue");
          $(card, ".plan-slot").appendChild(UI.planPicker(presets, st.plan, (k) => { st.plan = k; show(); }));
        } else if (st.step === 3) {
          const cs = settings ? settings.connected || [] : [];
          card.innerHTML = head() + `<h1>Connect your AI</h1><p class="lead">Agents need an AI to think with. Connect at least one. <b>Google Gemini has a free tier</b>, so it is the easiest place to start.</p>
            <div class="pv-list"></div>${PRIVACY}` + nav(true, cs.length ? "Continue" : "Skip for now");
          const list = $(card, ".pv-list");
          Object.keys(settings.providers).forEach((id) => list.appendChild(providerCard(id, settings.providers[id], async (s) => { settings = s; await refreshSettings(); show(); })));
        } else if (st.step === 4) {
          const total = Object.values(st.picks).filter((p) => p.on).length + st.custom.length;
          card.innerHTML = head() + `<h1>Build your team</h1><p class="lead">Pick the roles you want. You can rename them, change them or add more later (up to ${max}).</p>
            <div class="tpl-list">${templates.map((t) => { const p = st.picks[t.key]; return `<label class="tpl ${p.on ? "on" : ""}"><input type="checkbox" data-k="${t.key}" ${p.on ? "checked" : ""}>
              <span class="tpl-dot" style="background:${esc(t.color)}"></span><span class="tpl-body"><b>${esc(t.label)}</b><small>${esc((t.skills || [])[0] || "")}</small></span>
              <input class="at-in tpl-name" data-n="${t.key}" maxlength="30" value="${esc(p.name)}" aria-label="Name for ${esc(t.label)}"></label>`; }).join("")}</div>
            <div class="cust"><b>Something else?</b> <button class="at-link" data-a="custom">+ Add a custom agent</button></div>
            ${st.custom.map((c, i) => `<div class="tpl on"><span class="tpl-dot" style="background:${esc(c.color)}"></span><span class="tpl-body"><b>${esc(c.name)}</b><small>${esc(c.designation)}</small></span><button class="at-link" data-rm="${i}">Remove</button></div>`).join("")}
            <div class="at-note" id="w-err"></div><div class="at-note">${total} agent${total === 1 ? "" : "s"} selected.</div>` + nav(true, "Create my office", total < 1 || total > max);
          $$(card, ".tpl input[type=checkbox]").forEach((c) => { c.onchange = () => { st.picks[c.dataset.k].on = c.checked; show(); }; });
          $$(card, ".tpl-name").forEach((n) => { n.oninput = () => { st.picks[n.dataset.n].name = n.value; }; n.onclick = (e) => e.stopPropagation(); });
          $$(card, "[data-rm]").forEach((b) => { b.onclick = () => { st.custom.splice(+b.dataset.rm, 1); show(); }; });
          const cb = $(card, '[data-a="custom"]');
          if (cb) cb.onclick = () => UI.agentForm(null, (data) => { st.custom.push(data); show(); }, { local: true });
        }
      }

      card.addEventListener("click", async (e) => {
        const b = e.target.closest("[data-a]"); if (!b || b.disabled) return;
        const a = b.dataset.a;
        if (a === "back") { st.step--; show(); }
        else if (a === "next") {
          if (st.step === 1 && !st.name.trim()) return;
          if (st.step < 4) { st.step++; if (st.step === 3) { try { await refreshSettings(); } catch (err) { /* shown by cards */ } } show(); return; }
          b.disabled = true; b.textContent = "Setting up...";
          try {
            const brand = { brand_name: st.name.trim() }; if (st.logo) brand.logo = st.logo;
            await api("POST", "/api/office/branding", brand);
            await api("POST", "/api/office/preset", { key: st.plan });
            if (st.about.trim()) await api("POST", "/api/settings", { about: st.about.trim() });
            for (const t of templates) { const p = st.picks[t.key]; if (p.on) await api("POST", "/api/team", Object.assign({}, t, { name: p.name.trim() || t.name, template: t.key })); }
            for (const c of st.custom) await api("POST", "/api/team", c);
            await api("POST", "/api/state/complete-setup");
            await reloadPage();
          } catch (err) { $(card, "#w-err").textContent = err.message; b.disabled = false; b.textContent = "Create my office"; }
        }
      });

      (async () => {
        try {
          const t = await api("GET", "/api/templates"); templates = t.templates; max = t.max;
          templates.forEach((x, i) => { st.picks[x.key] = { on: i < 5, name: x.name }; });
          await refreshSettings();
          presets = (await api("GET", "/api/office")).presets;
        } catch (e) { card.innerHTML = `<h1>Something went wrong</h1><p>${esc(e.message)}</p>`; return; }
        show();
      })();
    });
  };

  /* ---------- agent editor / creator ---------- */
  UI.agentForm = function (id, onDone, opts) {
    opts = opts || {};
    const team = g.TEAM || { agents: {}, order: [] };
    const cur = id ? team.agents[id] : null;
    const a = cur || { name: "", designation: "", department: "", color: "#58a6ff", gender: "female", instructions: "", skills: [], search: false, design: false, manager: false, provider: "default" };
    const conn = (g.APPSTATE && g.APPSTATE.connected) || [];
    const prov = g.AT.providers.PROVIDERS;
    const ov = el(`<div class="at-modal"><div class="at-modal-card" role="dialog" aria-modal="true">
      <h2>${cur ? "Edit " + esc(cur.name) : "Add an agent"}</h2>
      <div class="two"><div><label class="f-lab">Name</label><input class="at-in" id="e-name" maxlength="30" value="${esc(a.name)}"></div>
      <div><label class="f-lab">Job title</label><input class="at-in" id="e-title" maxlength="60" value="${esc(a.designation)}" placeholder="e.g. Customer Support"></div></div>
      <div class="two"><div><label class="f-lab">Department</label><input class="at-in" id="e-dep" maxlength="40" value="${esc(a.department)}"></div>
      <div><label class="f-lab">Look</label><div class="two-in"><select class="at-in" id="e-gender"><option value="female" ${a.gender !== "male" ? "selected" : ""}>Female</option><option value="male" ${a.gender === "male" ? "selected" : ""}>Male</option></select><input type="color" id="e-color" value="${esc(a.color)}"></div></div></div>
      <label class="f-lab">What should this agent do? <span class="opt">(their instructions)</span></label>
      <textarea class="at-in" id="e-ins" rows="6" maxlength="3000" placeholder="Describe the job in a few sentences: what they help with, how they should write, what they must never do.">${esc(a.instructions)}</textarea>
      <label class="f-lab">Which AI should this agent use?</label>
      <select class="at-in" id="e-prov"><option value="default" ${a.provider === "default" || !a.provider ? "selected" : ""}>Default (whichever is connected)</option>${Object.keys(prov).map((p) => `<option value="${p}" ${a.provider === p ? "selected" : ""}>${esc(prov[p].label)}${conn.includes(p) ? "" : " (not connected)"}</option>`).join("")}</select>
      <div class="chk"><label><input type="checkbox" id="e-search" ${a.search ? "checked" : ""}> Can search the web</label>
      <label><input type="checkbox" id="e-design" ${a.design ? "checked" : ""}> Can create images <span class="opt">(Gemini only)</span></label>
      <label><input type="checkbox" id="e-mgr" ${a.manager ? "checked" : ""}> Team manager <span class="opt">(plans work and assigns it to others; only one)</span></label></div>
      <div class="at-note bad" id="e-err"></div>
      <div class="wiz-nav">${cur ? `<button class="at-btn danger" id="e-del">Delete agent</button>` : "<span></span>"}<span><button class="at-btn ghost" id="e-cancel">Cancel</button> <button class="at-btn primary" id="e-save">${cur ? "Save" : "Add agent"}</button></span></div>
    </div></div>`);
    doc.body.appendChild(ov);
    const close = () => ov.remove();
    $(ov, "#e-cancel").onclick = close;
    ov.addEventListener("mousedown", (e) => { if (e.target === ov) close(); });
    const read = () => ({
      name: $(ov, "#e-name").value.trim(), designation: $(ov, "#e-title").value.trim(), department: $(ov, "#e-dep").value.trim(),
      gender: $(ov, "#e-gender").value, color: $(ov, "#e-color").value, instructions: $(ov, "#e-ins").value.trim(), provider: $(ov, "#e-prov").value,
      search: $(ov, "#e-search").checked, design: $(ov, "#e-design").checked, manager: $(ov, "#e-mgr").checked, skills: a.skills || [],
    });
    $(ov, "#e-save").onclick = async (ev) => {
      const data = read(), err = $(ov, "#e-err"); err.textContent = "";
      if (!data.name) { err.textContent = "Give the agent a name."; return; }
      if (!data.designation) { err.textContent = "Give the agent a job title."; return; }
      if (data.instructions.length < 10) { err.textContent = "Describe what this agent should do (a sentence or two is enough)."; return; }
      if (opts.local) { close(); onDone(data); return; }
      ev.currentTarget.disabled = true;
      try {
        await api("POST", cur ? "/api/team/" + encodeURIComponent(id) : "/api/team", data);
        close(); await reloadPage();
      } catch (e) { err.textContent = e.message; ev.currentTarget.disabled = false; }
    };
    const del = $(ov, "#e-del");
    if (del) del.onclick = async () => {
      if (!g.confirm("Delete " + cur.name + "? Their chat is removed too. This can't be undone.")) return;
      try { await api("DELETE", "/api/team/" + encodeURIComponent(id)); close(); await reloadPage(); } catch (e) { $(ov, "#e-err").textContent = e.message; }
    };
    $(ov, "#e-name").focus();
  };
  UI.editAgent = (id) => UI.agentForm(id);

  UI.teamToolbar = function () {
    const grid = doc.getElementById("hr-grid"); if (!grid) return;
    let bar = doc.getElementById("hr-toolbar");
    const n = ((g.TEAM && g.TEAM.order) || []).length, max = (g.TEAM && g.TEAM.max) || 10;
    if (!bar) {
      bar = el(`<div id="hr-toolbar" class="hr-toolbar"><span class="cnt"></span><button class="at-btn primary" id="hr-add">+ Add agent</button></div>`);
      grid.parentNode.insertBefore(bar, grid);
      $(bar, "#hr-add").onclick = () => UI.agentForm(null);
    }
    $(bar, ".cnt").textContent = n + " of " + max + " agents";
    $(bar, "#hr-add").disabled = n >= max;
  };

  /* ---------- dashboard tabs ---------- */
  UI.tabs.layout = async function (panel) {
    if (panel.querySelector("#plan-bar")) return;
    let office; try { office = await api("GET", "/api/office"); } catch (e) { return; }
    const bar = el(`<div id="plan-bar" class="plan-bar"><h3>Office plans</h3><p class="at-note">Pick a ready-made plan to rearrange the whole office, then fine-tune it below. Choosing a plan resets your furniture and desks.</p></div>`);
    bar.appendChild(UI.planPicker(office.presets, office.layout_preset, async (k) => {
      if (k === office.layout_preset && !g.confirm("Reset the office to this plan again?")) return;
      if (k !== office.layout_preset && !g.confirm("Switch to the " + office.presets[k].label + " plan? Your current furniture and desk positions will be replaced.")) return;
      try { await api("POST", "/api/office/preset", { key: k }); await reloadPage(); } catch (e) { g.alert(e.message); }
    }));
    panel.insertBefore(bar, panel.firstChild);
  };

  /* ---------- look & furniture ---------- */
  function refreshScene() { try { if (g.sims && g.sims.resize) g.sims.resize(); } catch (e) { /* scene not ready */ } }
  UI.tabs.style = async function (panel) {
    let office; try { office = await api("GET", "/api/office"); } catch (e) { panel.textContent = e.message; return; }
    g.OFFICE = office;
    const groups = [["Room", ["floor", "wall"]], ["Workspace", ["desk", "chair_color", "chair_shape"]], ["Lounge", ["sofa", "table", "rug"]], ["Decoration", ["plant"]]];
    panel.innerHTML = `<div class="pane sty"><div class="sty-prev"><canvas width="640" height="476" aria-label="Preview of your office"></canvas><div class="at-note">Live preview. Changes apply right away.</div></div><div class="sty-body"></div></div>`;
    const body = $(panel, ".sty-body"), cv = $(panel, "canvas");
    function preview() {
      try {
        if (typeof SimsDraw === "undefined" || !g.sims) return;
        const k = cv.width / SimsDraw.WORLD_W, bg = doc.createElement("canvas"); bg.width = cv.width; bg.height = cv.height;
        const bx = bg.getContext("2d"); bx.setTransform(k, 0, 0, k, 0, 0); SimsDraw.renderBackground(bx);
        SimsDraw.drawFrame(cv.getContext("2d"), g.sims.sim.S, 0, null, bg, { k, ox: 0, oy: (cv.height - SimsDraw.WORLD_H * k) / 2, dpr: 1 });
      } catch (e) { cv.style.display = "none"; }
    }
    async function save(patch) {
      try { office = await api("POST", "/api/office/style", patch); g.OFFICE = office; refreshScene(); draw(); } catch (e) { g.alert(e.message); }
    }
    function draw() {
      const st = office.style, so = office.style_options;
      body.innerHTML = "";
      if (office.wall_texture || office.floor_texture) body.appendChild(el(`<p class="at-note">You uploaded a ${office.floor_texture ? "floor" : ""}${office.floor_texture && office.wall_texture ? " and " : ""}${office.wall_texture ? "wall" : ""} picture in <b>Branding &amp; interior</b>. It is shown instead of the choices below until you remove it there.</p>`));
      groups.forEach(([title, keys]) => {
        const sec = el(`<section class="sty-sec"><h3>${title}</h3></section>`);
        keys.forEach((k) => {
          const row = el(`<div class="sty-row"><div class="sty-lab">${esc(so[k].label)}</div><div class="chips"></div></div>`), chips = $(row, ".chips");
          so[k].items.forEach((it) => {
            const b = el(`<button type="button" class="chip ${st[k] === it.key ? "on" : ""}" data-k="${k}" data-v="${it.key}"><i style="background:${esc(it.swatch)}"></i>${esc(it.label)}</button>`);
            b.onclick = () => save({ [k]: it.key });
            chips.appendChild(b);
          });
          sec.appendChild(row);
          if (k === "wall" && st.wall === "custom") {
            const cr = el(`<div class="sty-row"><div class="sty-lab">Wall colour</div><input type="color" id="s-wallc" value="${esc(st.wall_color)}"></div>`);
            $(cr, "input").onchange = (e) => save({ wall_color: e.target.value });
            sec.appendChild(cr);
          }
        });
        if (title === "Decoration") {
          const dr = el(`<div class="sty-row"><div class="sty-lab">On the walls</div><div class="decor"></div></div>`);
          Object.keys(office.decor_options).forEach((k) => {
            const l = el(`<label class="decor-i"><input type="checkbox" ${st.decor[k] ? "checked" : ""}> ${esc(office.decor_options[k])}</label>`);
            $(l, "input").onchange = (e) => save({ decor: { [k]: e.target.checked } });
            $(dr, ".decor").appendChild(l);
          });
          sec.appendChild(dr);
          const mr = el(`<div class="sty-row"><div class="sty-lab">Poster motto</div><input class="at-in" maxlength="80" value="${esc(st.motto)}" placeholder="e.g. Make today count"></div>`);
          $(mr, "input").onchange = (e) => save({ motto: e.target.value });
          sec.appendChild(mr);
        }
        body.appendChild(sec);
      });
      preview();
    }
    draw();
  };

  /* ---------- weekly and monthly task boards ---------- */
  UI.tabs.boards = async function (panel) {
    let data; try { data = await api("GET", "/api/boards"); } catch (e) { panel.textContent = e.message; return; }
    const ids = (g.TEAM && g.TEAM.order) || [], nameOf = (id) => (g.TEAM && g.TEAM.agents[id] && g.TEAM.agents[id].name) || id;
    const titles = { week: "This week", month: "This month" };
    let timer = null;
    function persist() {
      clearTimeout(timer);
      timer = setTimeout(async () => {
        try { data = await api("POST", "/api/boards", data); g.BOARDS = data; refreshScene(); } catch (e) { /* shown on next action */ }
      }, 250);
    }
    const agentOpts = (sel) => `<option value="">Anyone</option>` + ids.map((id) => `<option value="${esc(id)}" ${sel === id ? "selected" : ""}>${esc(nameOf(id))}</option>`).join("");
    function draw() {
      panel.innerHTML = `<div class="pane"><p class="at-note">Plan the week and the month here. These lists also appear on the wall of your office. Tick things off as they are done, and press <b>Send</b> to hand a task straight to its agent.</p><div class="bd-cols"></div></div>`;
      const cols = $(panel, ".bd-cols");
      ["week", "month"].forEach((key) => {
        const col = el(`<div class="bd-col"><h3>${titles[key]}</h3>
          <div class="bd-add"><input class="at-in" maxlength="120" placeholder="Add a task..."><select class="at-in">${agentOpts("")}</select><button class="at-btn primary">Add</button></div><div class="bd-list"></div>
          <div class="bd-foot"><span class="at-note">${data[key].length} of 30</span><button class="at-link">Clear finished</button></div></div>`);
        const input = $(col, ".bd-add input"), sel = $(col, ".bd-add select");
        const add = () => {
          const t = input.value.trim(); if (!t) return;
          if (data[key].length >= 30) { g.alert("That board is full (30 tasks). Clear some finished ones first."); return; }
          data[key].push({ id: AT.uid(8), text: t, agent: sel.value, done: false }); persist(); draw();
        };
        $(col, ".bd-add button").onclick = add; input.onkeydown = (e) => { if (e.key === "Enter") add(); };
        const list = $(col, ".bd-list");
        data[key].forEach((it, i) => {
          const row = el(`<div class="bd-row ${it.done ? "done" : ""}"><input type="checkbox" ${it.done ? "checked" : ""} aria-label="Done"><input class="at-in bd-t" maxlength="120" value="${esc(it.text)}"><select class="at-in bd-a">${agentOpts(it.agent)}</select>
            <button class="at-btn small bd-send" title="Give this task to the agent" ${it.agent ? "" : "disabled"}>Send</button><button class="x-btn" aria-label="Delete">&times;</button></div>`);
          $(row, "input[type=checkbox]").onchange = (e) => { it.done = e.target.checked; persist(); draw(); };
          $(row, ".bd-t").onchange = (e) => { const v = e.target.value.trim(); if (v) it.text = v; persist(); };
          $(row, ".bd-a").onchange = (e) => { it.agent = e.target.value; persist(); draw(); };
          $(row, ".x-btn").onclick = () => { data[key].splice(i, 1); persist(); draw(); };
          $(row, ".bd-send").onclick = async (e) => {
            const b = e.currentTarget; b.disabled = true; b.textContent = "...";
            try { await api("POST", "/api/chats/" + encodeURIComponent("agent-" + it.agent) + "/message", { text: it.text }); b.textContent = "Sent"; } catch (err) { b.textContent = "Send"; b.disabled = false; g.alert(err.message); }
          };
          list.appendChild(row);
        });
        $(col, ".bd-foot .at-link").onclick = () => { data[key] = data[key].filter((x) => !x.done); persist(); draw(); };
        cols.appendChild(col);
      });
    }
    draw();
  };

  UI.tabs.connections = async function (panel) {
    panel.innerHTML = `<div class="pane"><h3>AI connections</h3><p class="at-note">Agents think with the AI accounts you connect here. Connect more than one if you like, and choose a default.</p><div class="pv-list"></div><div class="def-row"></div>${PRIVACY}</div>`;
    const list = $(panel, ".pv-list"), def = $(panel, ".def-row");
    async function draw() {
      const s = await api("GET", "/api/settings"); list.innerHTML = "";
      Object.keys(s.providers).forEach((id) => list.appendChild(providerCard(id, s.providers[id], async () => { g.APPSTATE = await api("GET", "/api/state"); draw(); })));
      const cs = s.connected || [];
      def.innerHTML = cs.length > 1 ? `<label class="f-lab">Default AI for agents</label><select class="at-in" id="def-sel">${cs.map((p) => `<option value="${p}" ${s.defaultProvider === p ? "selected" : ""}>${esc(s.providers[p].label)}</option>`).join("")}</select>` : "";
      const sel = $(def, "#def-sel"); if (sel) sel.onchange = () => api("POST", "/api/settings", { defaultProvider: sel.value });
    }
    draw().catch((e) => { panel.textContent = e.message; });
  };

  UI.tabs.company = async function (panel) {
    const s = await api("GET", "/api/settings");
    panel.innerHTML = `<div class="pane"><h3>Company notes</h3><p class="at-note">Everything here is given to every agent as background. Add products, prices, customers, goals, tone of voice. Agents treat it as true, so keep it accurate.</p>
      <textarea class="at-in" id="c-about" rows="14" maxlength="12000">${esc(s.about || "")}</textarea><div class="pane-row"><span class="at-note" id="c-msg"></span><button class="at-btn primary" id="c-save">Save notes</button></div>
      <h3 style="margin-top:22px">Images</h3><label class="f-lab">Most images an agent can create per day</label><input class="at-in" type="number" min="0" max="200" id="c-cap" value="${esc(s.imageDailyCap)}" style="max-width:120px"><div class="at-note">${esc(s.imagesToday)} made today. Image creation needs a Gemini key and may use paid quota.</div></div>`;
    $(panel, "#c-save").onclick = async () => {
      const m = $(panel, "#c-msg");
      try { await api("POST", "/api/settings", { about: $(panel, "#c-about").value, imageDailyCap: $(panel, "#c-cap").value }); m.textContent = "Saved."; } catch (e) { m.textContent = e.message; }
    };
  };

  UI.tabs.data = function (panel) {
    panel.innerHTML = `<div class="pane"><h3>Backup &amp; data</h3>
      <p class="at-note">Your agents, chats, images and settings live only in this browser on this computer. Clearing your browser data would erase them, so save a backup now and then. API keys are <b>not</b> included in backups.</p>
      <div class="pane-row left"><button class="at-btn" id="d-export">Download backup</button><button class="at-btn" id="d-import">Restore from backup...</button><input type="file" id="d-file" accept=".json,application/json" hidden></div>
      <div class="at-note" id="d-msg"></div>
      <h3 style="margin-top:22px">Start over</h3><p class="at-note">Erase everything in this browser (agents, chats, notes and your saved keys) and run the setup again.</p>
      <button class="at-btn danger" id="d-reset">Erase everything</button></div>`;
    const msg = $(panel, "#d-msg");
    $(panel, "#d-export").onclick = async () => {
      try {
        const d = await api("GET", "/api/data/export");
        const blob = new Blob([JSON.stringify(d)], { type: "application/json" }), a = doc.createElement("a");
        a.href = URL.createObjectURL(blob); a.download = "agent-town-backup-" + new Date().toISOString().slice(0, 10) + ".json";
        doc.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 4000);
        msg.textContent = "Backup downloaded.";
      } catch (e) { msg.textContent = e.message; }
    };
    $(panel, "#d-import").onclick = () => $(panel, "#d-file").click();
    $(panel, "#d-file").onchange = async (e) => {
      const f = e.target.files[0]; if (!f) return;
      if (!g.confirm("Restoring replaces everything currently in this browser (your keys stay). Continue?")) return;
      try { await api("POST", "/api/data/import", JSON.parse(await f.text())); await reloadPage(); } catch (err) { msg.textContent = err instanceof SyntaxError ? "That file isn't a valid backup." : err.message; }
    };
    $(panel, "#d-reset").onclick = async () => {
      if (!g.confirm("Erase ALL Agent Town data in this browser, including your saved keys? This can't be undone.")) return;
      try { await api("POST", "/api/data/reset"); await reloadPage(); } catch (e) { msg.textContent = e.message; }
    };
  };

  /* ---------- banners after start-up ---------- */
  UI.afterBoot = function (state) {
    const box = doc.getElementById("banners"); if (!box) return;
    const add = (html, cls, act) => { const b = el(`<div class="banner ${cls || ""}"><span>${html}</span>${act ? `<button class="at-btn small">${act.label}</button>` : ""}<button class="x" aria-label="Dismiss">&times;</button></div>`); $(b, ".x").onclick = () => b.remove(); if (act) $(b, ".at-btn").onclick = act.fn; box.appendChild(b); };
    if (state.otherTab) {
      doc.body.appendChild(el(`<div class="at-modal block"><div class="at-modal-card"><h2>Agent Town is already open</h2><p>It is open in another tab or window. Using two at once could lose your data, so this one is paused. Close the other tab, then reload this one.</p><button class="at-btn primary" onclick="location.reload()">Reload</button></div></div>`));
      return;
    }
    if (!(state.connected || []).length) add("No AI is connected yet, so agents can't answer. Gemini has a free tier.", "warn", { label: "Connect an AI", fn: () => g.openDashboard("connections") });
    if (state.persistent === false) add("Your browser isn't allowing Agent Town to save data, so everything will be lost when you close this tab. Try a normal (not private) window.", "bad");
  };
})(window);
