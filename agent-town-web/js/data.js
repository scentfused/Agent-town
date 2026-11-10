/* Agent Town (web edition) - the team's activity log and the shared image library. */
(function (g) {
  "use strict";
  const AT = (g.AT = g.AT || {});

  /* ---------- activity log: lets the team manager write reports about recent work ---------- */
  const R = {};
  const MAX_REPORTS = 200;
  R.add = function (agentId, task, result) {
    const list = AT.store.get("reports", []);
    list.push({ ts: AT.now(), agent: agentId, task: String(task || "").slice(0, 600), result: String(result || "").slice(0, 3000) });
    AT.store.set("reports", list.slice(-MAX_REPORTS));
  };
  R.recentText = function (maxChars) {
    const limit = maxChars || 24000, cutoff = AT.now() - 7 * 86400;
    const mgr = AT.agents && AT.agents.manager();
    const items = AT.store.get("reports", []).filter((e) => e.ts >= cutoff && !(mgr && e.agent === mgr.id)).reverse();
    const blocks = []; let used = 0;
    for (const e of items) {
      const a = AT.agents && AT.agents.get(e.agent);
      const when = new Date(e.ts * 1000).toLocaleString([], { dateStyle: "medium", timeStyle: "short" });
      const b = `[${when}] ${a ? a.name : e.agent}\nTask: ${e.task.slice(0, 300)}\nResult: ${e.result.slice(0, 1500)}\n`;
      if (used + b.length > limit) { blocks.push("(Older reports omitted to keep this short.)"); break; }
      blocks.push(b); used += b.length;
    }
    return "--- Team activity log (last 7 days, newest first) ---\n" + (blocks.length ? blocks.join("\n") : "(No team work has been logged yet.)") + "\n--- end of team activity log ---";
  };
  AT.reports = R;

  /* ---------- weekly and monthly task boards (shown on the office wall) ---------- */
  const B = {};
  B.MAX = 30;
  const clean = (list) => (Array.isArray(list) ? list : []).slice(0, B.MAX).map((it) => ({
    id: String((it && it.id) || AT.uid(8)).slice(0, 24),
    text: String((it && it.text) || "").trim().slice(0, 120),
    agent: String((it && it.agent) || "").slice(0, 40),
    done: !!(it && it.done),
  })).filter((it) => it.text);
  B.get = () => { const b = AT.store.get("boards") || {}; return { week: clean(b.week), month: clean(b.month) }; };
  B.save = (b) => { const v = { week: clean(b && b.week), month: clean(b && b.month) }; AT.store.set("boards", v); return v; };
  AT.boards = B;

  /* ---------- shared image library (made by designer agents, visible to the whole team as text) ---------- */
  const I = {};
  const MAX_IMAGES = 40;
  I.list = () => AT.store.get("images", []);
  I.dataUrl = (id) => AT.store.get("img:" + id, null);
  I.cap = () => { const c = parseInt(AT.providers.settings().imageDailyCap, 10); return Number.isFinite(c) && c >= 0 ? c : 10; };
  I.madeToday = function () {
    const d = new Date(); d.setHours(0, 0, 0, 0);
    return I.list().filter((x) => x.ts >= d.getTime() / 1000).length;
  };
  I.create = async function (prompt, aspect, byId) {
    if (I.madeToday() >= I.cap()) throw new AT.providers.ProviderError("cap", `Daily image limit reached (${I.cap()}). You can raise it in Settings, then Connections.`);
    const r = await AT.providers.generateImage(prompt, aspect);
    const id = AT.uid(12);
    AT.store.set("img:" + id, `data:${r.mime};base64,${r.b64}`);
    const list = I.list();
    list.push({ id, ts: AT.now(), prompt, aspect, by: byId });
    while (list.length > MAX_IMAGES) { const old = list.shift(); AT.store.del("img:" + old.id); }
    AT.store.set("images", list);
    return { id, prompt, aspect };
  };
  I.libraryText = function (limit) {
    const items = I.list().slice(-(limit || 12)).reverse();
    if (!items.length) return "";
    return "--- Shared design images made by the team (descriptions only) ---\n" + items.map((i) => {
      const a = AT.agents && AT.agents.get(i.by);
      return `- ${new Date(i.ts * 1000).toLocaleDateString()} by ${a ? a.name : "the designer"} (${i.aspect}): ${i.prompt.slice(0, 200)}`;
    }).join("\n");
  };
  AT.images = I;
})(typeof window !== "undefined" ? window : globalThis);
