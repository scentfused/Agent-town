// Logic tests: runs the app's JavaScript in Node with a fake AI provider.
//   node tests/logic.test.js
"use strict";
const vm = require("vm"), fs = require("fs"), path = require("path"), assert = require("assert");
const { webcrypto } = require("crypto");

const ctx = vm.createContext({ console, setTimeout, clearTimeout, Promise, URL, Date, JSON, Math, crypto: webcrypto, Uint8Array, AbortController });
for (const f of ["core", "providers", "agents", "office", "chats", "data", "runtime", "local-api"]) {
  vm.runInContext(fs.readFileSync(path.join(__dirname, "..", "js", f + ".js"), "utf8"), ctx, { filename: f + ".js" });
}
const AT = ctx.AT;
AT.providers.retryDelays = [5, 5];

let passed = 0, failed = 0;
async function test(name, fn) {
  try { await fn(); passed++; console.log("ok   " + name); } catch (e) { failed++; console.log("FAIL " + name + "\n     " + (e && e.stack || e)); }
}
// objects made inside the sandbox have a different prototype, so compare them as JSON
const same = (a, b, msg) => assert.strictEqual(JSON.stringify(a), JSON.stringify(b), msg);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/* ---------- a fake network for the three providers ---------- */
let calls = [];
let script = {};     // url-substring -> handler(body, headers) => {status, json}
function resp(status, json) { const text = JSON.stringify(json); return { ok: status >= 200 && status < 300, status, text: async () => text }; }
AT.providers._fetch = async (url, init) => {
  const body = init && init.body ? JSON.parse(init.body) : null;
  calls.push({ url, body, headers: init && init.headers });
  for (const [k, h] of Object.entries(script)) if (url.includes(k)) { const r = await h(body, init.headers, url); return resp(r.status, r.json); }
  return resp(404, { error: { message: "no handler for " + url } });
};
const gemOk = (text) => ({ status: 200, json: { candidates: [{ content: { parts: [{ text }] } }] } });
function gemini() {
  script = {
    "/models?": () => ({ status: 200, json: { models: [
      { name: "models/gemini-2.5-flash", supportedGenerationMethods: ["generateContent"] },
      { name: "models/gemini-2.5-pro", supportedGenerationMethods: ["generateContent"] },
      { name: "models/gemini-2.5-flash-image", supportedGenerationMethods: ["generateContent"] },
      { name: "models/text-embedding-004", supportedGenerationMethods: ["embedContent"] },
    ] } }),
    ":generateContent": (b) => gemOk("Hello from Gemini"),
  };
  calls = [];
}

(async () => {
  await AT.ready;

  await test("model pickers choose sensible models", () => {
    const P = AT.providers;
    assert.strictEqual(P.pickGeminiModel(["gemini-2.5-pro", "gemini-2.5-flash", "gemini-2.5-flash-lite", "gemini-2.0-flash", "gemini-2.5-flash-image"]), "gemini-2.5-flash");
    assert.strictEqual(P.pickGeminiModel(["gemini-3-flash-preview", "gemini-2.5-flash"]), "gemini-3-flash-preview");
    assert.strictEqual(P.pickGeminiImageModel(["gemini-2.5-flash", "gemini-2.5-flash-image", "imagen-4"]), "gemini-2.5-flash-image");
    assert.strictEqual(P.pickOpenAIModel(["gpt-4o", "gpt-4.1", "gpt-4.1-mini", "gpt-4o-mini", "whisper-1", "gpt-4o-audio-preview"]), "gpt-4.1-mini");
    assert.strictEqual(P.pickOpenAIModel(["gpt-5-mini", "gpt-4.1-mini", "gpt-5"]), "gpt-5-mini");
    assert.strictEqual(P.pickAnthropicModel(["claude-opus-4-1", "claude-sonnet-4-5", "claude-haiku-4-5"]), "claude-sonnet-4-5");
  });

  await test("Gemini: key test lists models, picks one, and connects", async () => {
    gemini();
    const r = await AT.providers.test("gemini", "AIza-test-key-1234");
    assert.ok(r.ok, r.message);
    const s = AT.providers.settings().providers.gemini;
    assert.strictEqual(s.model, "gemini-2.5-flash"); assert.strictEqual(s.imageModel, "gemini-2.5-flash-image"); assert.strictEqual(s.status, "ok");
    assert.strictEqual(AT.providers.settings().defaultProvider, "gemini");
    assert.ok(calls.every((c) => c.headers["x-goog-api-key"] === "AIza-test-key-1234"), "key sent as header");
    const pub = JSON.stringify(AT.providers.publicStatus());
    assert.ok(!pub.includes("AIza-test-key"), "public status must not contain the key");
    assert.ok(pub.includes("1234"));
  });

  await test("errors are explained in plain language", async () => {
    script = { "/models?": () => ({ status: 400, json: { error: { message: "API key not valid. Please pass a valid API key.", status: "INVALID_ARGUMENT" } } }) };
    let r = await AT.providers.test("gemini", "bad");
    assert.ok(!r.ok && /did not accept the API key/.test(r.message), r.message);
    script = { "/models?": () => ({ status: 200, json: { models: [{ name: "models/gemini-2.5-flash", supportedGenerationMethods: ["generateContent"] }] } }),
               ":generateContent": () => ({ status: 429, json: { error: { message: "Quota exceeded for metric per day", status: "RESOURCE_EXHAUSTED" } } }) };
    r = await AT.providers.test("gemini", "k");
    assert.ok(!r.ok && /no quota or credit/.test(r.message), r.message);
    let n = 0;
    script = { ":generateContent": () => (++n < 3 ? { status: 429, json: { error: { message: "rate limit reached" } } } : gemOk("recovered")) };
    const g = await AT.providers.generate("gemini", { system: "s", prompt: "p" });
    assert.strictEqual(g.text, "recovered"); assert.strictEqual(n, 3);
    gemini(); await AT.providers.test("gemini", "AIza-test-key-1234");
  });

  await test("OpenAI and Claude requests are shaped correctly", async () => {
    script = {
      "api.openai.com/v1/models": () => ({ status: 200, json: { data: [{ id: "gpt-4.1-mini" }, { id: "gpt-4o" }] } }),
      "api.openai.com/v1/responses": (b) => ({ status: 200, json: { output: [{ type: "message", content: [{ type: "output_text", text: "OK from OpenAI" }] }] } }),
      "api.anthropic.com/v1/models": () => ({ status: 200, json: { data: [{ id: "claude-sonnet-4-5" }] } }),
      "api.anthropic.com/v1/messages": (b) => ({ status: 200, json: { content: [{ type: "text", text: "OK from Claude" }] } }),
    };
    calls = [];
    assert.ok((await AT.providers.test("openai", "sk-test")).ok);
    assert.ok((await AT.providers.test("anthropic", "sk-ant-test")).ok);
    const o = await AT.providers.generate("openai", { system: "SYS", prompt: "PROMPT", search: true });
    assert.strictEqual(o.text, "OK from OpenAI");
    const oc = calls.filter((c) => c.url.endsWith("/responses")).pop();
    assert.strictEqual(oc.body.instructions, "SYS"); assert.strictEqual(oc.body.input, "PROMPT"); same(oc.body.tools, [{ type: "web_search" }]);
    assert.strictEqual(oc.headers.Authorization, "Bearer sk-test");
    const c = await AT.providers.generate("anthropic", { system: "SYS", prompt: "PROMPT" });
    assert.strictEqual(c.text, "OK from Claude");
    const cc = calls.filter((x) => x.url.endsWith("/messages")).pop();
    assert.strictEqual(cc.headers["x-api-key"], "sk-ant-test"); assert.strictEqual(cc.headers["anthropic-dangerous-direct-browser-access"], "true");
    assert.strictEqual(cc.body.system, "SYS");
    // a search tool the account can't use must not break the answer
    let n = 0;
    script = { "api.openai.com/v1/responses": (b) => (b.tools && ++n ? { status: 400, json: { error: { message: "tool not supported" } } } : { status: 200, json: { output_text: "no-tools answer" } }) };
    assert.strictEqual((await AT.providers.generate("openai", { system: "s", prompt: "p", search: true })).text, "no-tools answer");
  });

  await test("Gemini search adds sources; blocked answers are explained", async () => {
    script = { ":generateContent": (b) => {
      assert.ok(b.tools.some((t) => t.google_search) && b.tools.some((t) => t.url_context));
      return { status: 200, json: { candidates: [{ content: { parts: [{ text: "Answer" }] }, groundingMetadata: { groundingChunks: [{ web: { uri: "https://a.com", title: "A" } }, { web: { uri: "https://a.com", title: "A" } }] } }] } };
    } };
    const r = await AT.providers.generate("gemini", { system: "s", prompt: "p", search: true, urls: true });
    assert.ok(/Sources \(Google Search\)/.test(r.text) && r.text.split("https://a.com").length === 2);
    script = { ":generateContent": () => ({ status: 200, json: { promptFeedback: { blockReason: "SAFETY" } } }) };
    await assert.rejects(() => AT.providers.generate("gemini", { system: "s", prompt: "p" }), /blocked by its safety filters/);
  });

  /* ---------- the team ---------- */
  await test("agents: validation, ids, one manager, limit of 10, desks never overlap", () => {
    const A = AT.agents;
    assert.ok(A.create({ name: "", designation: "x", instructions: "something long enough" }).error);
    assert.ok(A.create({ name: "Alex", designation: "", instructions: "something long enough" }).error);
    assert.ok(A.create({ name: "Alex", designation: "Boss", instructions: "short" }).error);
    const t = A.TEMPLATES;
    let first = A.create(t[0]); assert.ok(first.agent.manager); same(AT.office.load().layout.desks[first.agent.id], { x: 8, y: 3 });
    for (let i = 1; i < t.length; i++) assert.ok(A.create(t[i]).agent, t[i].key);
    assert.strictEqual(A.create({ name: "Alex", designation: "Helper", instructions: "do helpful things" }).agent.id, "alex-2");
    assert.ok(A.list().length === 10 && A.create({ name: "Eleven", designation: "x", instructions: "something long enough" }).error);
    const desks = AT.office.load().layout.desks;
    assert.strictEqual(Object.keys(desks).length, 10);
    const seen = new Set();
    for (const [id, p] of Object.entries(desks)) for (const c of [[p.x, p.y], [p.x + 1, p.y], [p.x - 1, p.y]]) { const k = c.join(","); assert.ok(!seen.has(k), "overlap at " + k); seen.add(k); }
    const L = AT.office.load().layout;
    Object.values(L.furniture).forEach((f, i) => assert.ok(f)); // furniture present
    assert.strictEqual(A.teamView().manager, first.agent.id); assert.strictEqual(A.teamView().order[0], first.agent.id);
    // new manager replaces old one
    const pr = A.get("priya"); A.update("priya", { manager: true });
    assert.strictEqual(A.list().filter((a) => a.manager).length, 1); assert.ok(A.get("priya").manager && A.get("priya").look.tie);
    A.update("priya", { manager: false }); A.update("alex", { manager: true });
    assert.strictEqual(AT.agents.manager().id, "alex");
  });

  await test("office: layout save rejects overlaps; removing an agent frees the desk and chat", () => {
    const O = AT.office, before = JSON.stringify(O.load().layout.desks);
    const maya = O.load().layout.desks.maya, sara = O.load().layout.desks.sara;
    O.saveLayout({ desks: { maya: { x: sara.x, y: sara.y } } });
    same(O.load().layout.desks.maya, maya, "overlapping move ignored");
    O.saveLayout({ furniture: { sofa: { x: 99, y: 0 } } });
    assert.notStrictEqual(O.load().layout.furniture.sofa.x, 99);
    AT.chats.createGroup(["maya", "sara"], "g1"); AT.chats.createGroup(["maya", "sara", "zara"], "g2");
    assert.ok(AT.chats.get("agent-maya"));
    AT.agents.remove("maya");
    assert.ok(!AT.chats.get("agent-maya") && !O.load().layout.desks.maya);
    const groups = AT.chats.list(AT.agents.order()).filter((c) => c.type === "group");
    same(groups.map((g) => g.title), ["g2"]);
    assert.strictEqual(AT.agents.create({ name: "Maya", designation: "Marketing", instructions: "marketing things" }).agent.id, "maya");
  });

  await test("branding: size/type checks; blank name ignored", () => {
    const O = AT.office;
    O.saveBranding({ brand_name: "  Acme Co  " }); assert.strictEqual(O.load().brand_name, "Acme Co");
    O.saveBranding({ brand_name: "   " }); assert.strictEqual(O.load().brand_name, "Acme Co");
    O.saveBranding({ logo: "data:text/html;base64,AAAA" }); assert.strictEqual(O.load().logo, null);
    O.saveBranding({ logo: "data:image/png;base64,iVBORw0KGgo=" }); assert.ok(O.load().logo);
    O.saveBranding({ logo: "" }); assert.strictEqual(O.load().logo, null);
    O.saveBranding({ font_key: "nope" }); assert.strictEqual(O.load().font_key, "georgia");
  });

  await test("prompts contain the right pieces", () => {
    AT.providers.settings().about = "We sell candles. Free shipping over $50.";
    const mgr = AT.agents.manager(), writer = AT.agents.get("leo"), designer = AT.agents.get("zara");
    const ms = AT.agents.buildSystem(mgr);
    assert.ok(/Acme Co/.test(ms) && /We sell candles/.test(ms) && /"assignments"/.test(ms) && /- zara:/.test(ms) && !/- alex:/.test(ms));
    const ws = AT.agents.buildSystem(writer);
    assert.ok(!/assignments/.test(ws) && !/"images"/.test(ws) && /DRAFT/.test(ws) && /Alex/.test(ws));
    assert.ok(/"images"/.test(AT.agents.buildSystem(designer)));
    assert.ok(/Team activity log/.test(AT.agents.buildPrompt(mgr, "report")) && !/Team activity log/.test(AT.agents.buildPrompt(writer, "x")));
  });

  await test("plan and image blocks are parsed safely", () => {
    const A = AT.agents;
    const t = 'Plan.\n```json\n{"assignments":[{"agent":"zara","task":"Banner"},{"agent":"ghost","task":"x"},{"agent":"alex","task":"self"},{"agent":"leo","task":""}]}\n```';
    const r = A.extractPlan(t, "alex"); assert.strictEqual(r.text, "Plan."); same(r.plan, [{ agent: "zara", task: "Banner" }]);
    same(A.extractPlan("no block", "alex"), { text: "no block", plan: [] });
    same(A.extractPlan("```json\n{not json}\n```", "alex").plan, []);
    const i = A.extractImages('Ideas\n```json\n{"images":[{"prompt":"a","aspect":"4:5"},{"prompt":"b","aspect":"zz"},{"prompt":""},{"prompt":"c"},{"prompt":"d"}]}\n```');
    assert.strictEqual(i.text, "Ideas"); same(i.requests.map((x) => x.aspect), ["4:5", "1:1", "1:1"]);
  });

  /* ---------- running tasks ---------- */
  function collect() { const ev = []; const off = AT.bus.on((m) => ev.push(m)); return { ev, off }; }
  const waitFor = async (fn, ms) => { const end = Date.now() + (ms || 3000); while (Date.now() < end) { if (fn()) return; await sleep(10); } throw new Error("timed out"); };

  await test("a task in an agent's chat: saved, answered, logged, events sent", async () => {
    gemini(); script[":generateContent"] = (b) => gemOk("Draft: three caption ideas.");
    const { ev, off } = collect();
    const r = AT.runtime.dispatch("agent-leo", "Write captions"); assert.ok(!r.error, r.error);
    await waitFor(() => ev.some((e) => e.type === "result")); off();
    const msgs = AT.chats.get("agent-leo").messages;
    same(msgs.map((m) => [m.role, m.kind, m.text]), [["user", "text", "Write captions"], ["agent", "text", "Draft: three caption ideas."]]);
    same(ev.map((e) => e.type).filter((t) => ["task_started", "result"].includes(t)), ["task_started", "result"]);
    assert.ok(AT.store.get("reports").some((x) => x.agent === "leo"));
    const sent = calls.filter((c) => c.url.includes(":generateContent")).pop().body;
    assert.ok(/Writing|Content Writer/.test(sent.systemInstruction.parts[0].text) && sent.contents[0].parts[0].text.startsWith("Write captions"));
    same(AT.store.get("pending"), {});
  });

  await test("follow-up messages include the earlier conversation", async () => {
    const { ev, off } = collect(); AT.runtime.dispatch("agent-leo", "Make it shorter");
    await waitFor(() => ev.some((e) => e.type === "result")); off();
    const p = calls.filter((c) => c.url.includes(":generateContent")).pop().body.contents[0].parts[0].text;
    assert.ok(/Conversation so far/.test(p) && /Owner: Write captions/.test(p) && /Leo: Draft: three caption ideas/.test(p) && /Owner's new message:\nMake it shorter/.test(p));
  });

  await test("manager plan: card is saved, approval starts every task in the right chats", async () => {
    gemini();
    script[":generateContent"] = (b) => /Alex/.test(b.systemInstruction.parts[0].text) && /YOU ARE THE TEAM MANAGER/.test(b.systemInstruction.parts[0].text) && !/Banner task/.test(b.contents[0].parts[0].text)
      ? gemOk('Here is the plan.\n```json\n{"assignments":[{"agent":"zara","task":"Banner task"},{"agent":"leo","task":"Blog task"}]}\n```') : gemOk("done: " + (/Banner task/.test(b.contents[0].parts[0].text) ? "Banner task" : /Blog task/.test(b.contents[0].parts[0].text) ? "Blog task" : "?"));
    const { ev, off } = collect();
    AT.runtime.dispatch("agent-alex", "Plan our launch");
    await waitFor(() => ev.some((e) => e.type === "plan"));
    const plan = AT.chats.get("agent-alex").messages.find((m) => m.kind === "plan");
    assert.strictEqual(plan.status, "pending"); assert.strictEqual(plan.assignments.length, 2);
    assert.ok(!AT.chats.get("agent-alex").messages.some((m) => /```/.test(m.text)));
    const res = AT.runtime.planAction("agent-alex", plan.id, "approve"); assert.strictEqual(res.task_ids.length, 2);
    await waitFor(() => ev.filter((e) => e.type === "result").length >= 3); off();
    assert.ok(AT.chats.get("agent-zara").messages.some((m) => m.from_plan && m.text === "Banner task"));
    assert.ok(AT.chats.get("agent-leo").messages.some((m) => m.role === "agent" && /Blog task/.test(m.text)));
    assert.strictEqual(AT.chats.get("agent-alex").messages.find((m) => m.id === plan.id).status, "approved");
    assert.ok(AT.runtime.planAction("agent-alex", plan.id, "approve").error);
  });

  await test("designer: images are made, saved and described to the team", async () => {
    gemini();
    script[":generateContent"] = (b) => (b.generationConfig && b.generationConfig.responseModalities
      ? { status: 200, json: { candidates: [{ content: { parts: [{ inlineData: { mimeType: "image/png", data: "QUJD" } }] } }] } }
      : gemOk('Two concepts.\n```json\n{"images":[{"prompt":"Soft pastel banner","aspect":"16:9"}]}\n```'));
    const { ev, off } = collect(); AT.runtime.dispatch("agent-zara", "Make an example banner");
    await waitFor(() => ev.some((e) => e.type === "result") && AT.chats.get("agent-zara").messages.some((m) => m.kind === "image")); off();
    const im = AT.chats.get("agent-zara").messages.find((m) => m.kind === "image");
    assert.ok(im.image_id && AT.images.dataUrl(im.image_id) === "data:image/png;base64,QUJD");
    assert.ok(/Soft pastel banner/.test(AT.images.libraryText()));
    const reqBody = calls.filter((c) => c.body.generationConfig).pop().body;
    assert.strictEqual(reqBody.generationConfig.imageConfig.aspectRatio, "16:9");
    AT.providers.settings().imageDailyCap = 1; AT.providers.save();
    await assert.rejects(() => AT.images.create("another", "1:1", "zara"), /Daily image limit/);
    AT.providers.settings().imageDailyCap = 10;
  });

  await test("group chat: agents answer in turn, each seeing the earlier replies", async () => {
    gemini(); const seen = [];
    script[":generateContent"] = (b) => { const t = b.contents[0].parts[0].text; seen.push(t); return gemOk("reply" + seen.length); };
    const g = AT.chats.createGroup(["leo", "sam"], "Launch");
    const { ev, off } = collect(); const r = AT.runtime.dispatch(g.id, "Ideas for the launch?");
    assert.ok(!r.error); assert.ok(AT.runtime.dispatch(g.id, "again").error, "busy guard");
    await waitFor(() => ev.some((e) => e.type === "group_idle")); off();
    assert.strictEqual(seen.length, 2); assert.ok(/You go first/.test(seen[0]) && /\[Leo\]: reply1/.test(seen[1]));
    same(AT.chats.get(g.id).messages.map((m) => m.agent_id || "you"), ["you", "leo", "sam"]);
  });

  await test("failures are shown in the chat in plain words; no provider is handled", async () => {
    gemini(); script[":generateContent"] = () => ({ status: 401, json: { error: { message: "API key not valid" } } });
    const { ev, off } = collect(); AT.runtime.dispatch("agent-sam", "hello");
    await waitFor(() => ev.some((e) => e.type === "error")); off();
    const last = AT.chats.get("agent-sam").messages.pop();
    assert.ok(last.kind === "error" && /did not accept the API key/.test(last.text));
    const keep = AT.providers.settings().providers; const saved = AT.clone(keep);
    Object.values(keep).forEach((p) => { p.status = "none"; });
    assert.ok(/No AI provider is connected/.test(AT.runtime.dispatch("agent-sam", "hi").error));
    Object.assign(AT.providers.settings().providers, saved);
    assert.ok(AT.runtime.dispatch("agent-nobody", "hi").error);
    assert.ok(AT.runtime.dispatch("agent-sam", "   ").error);
  });

  await test("a task cut off by closing the page is reported on the next visit", () => {
    AT.store.set("pending", { t1: { chatId: "agent-sam", agentId: "sam", ts: 1 } });
    AT.runtime.recoverInterrupted();
    assert.ok(/interrupted/.test(AT.chats.get("agent-sam").messages.pop().text)); same(AT.store.get("pending"), {});
  });

  await test("local API: routes behave like the old server", async () => {
    const H = (m, p, b) => AT.api.handle(m, p, b);
    assert.ok((await H("GET", "/api/team")).body.agents.zara.look.shirt);
    assert.strictEqual((await H("POST", "/api/team", { name: "", designation: "", instructions: "" })).status, 400);
    assert.strictEqual((await H("POST", "/api/team/zara", { name: "Zoe", color: "#112233" })).body.profile.name, "Zoe");
    assert.strictEqual((await H("POST", "/api/chats", { agents: ["zara"] })).status, 400);
    const g = (await H("POST", "/api/chats", { agents: ["zara", "sam"], title: "T" })).body.chat; assert.ok(g.id);
    assert.ok((await H("DELETE", "/api/chats/" + g.id)).body.ok);
    assert.strictEqual((await H("DELETE", "/api/chats/agent-zara")).status, 404);
    assert.strictEqual((await H("GET", "/api/nothing")).status, 404);
    const st = (await H("GET", "/api/settings")).body; assert.ok(!JSON.stringify(st).includes("AIza-test-key"));
    assert.strictEqual((await H("POST", "/api/settings", { imageDailyCap: 5, about: "x" })).body.imageDailyCap, 5);
    const exp = (await H("GET", "/api/data/export")).body; assert.ok(!JSON.stringify(exp).includes("AIza-test-key") && !JSON.stringify(exp).includes("sk-test"));
    assert.ok(exp.data.agents.length > 5);
  });

  await test("restore from a backup keeps this computer's keys; reset wipes everything", async () => {
    const H = (m, p, b) => AT.api.handle(m, p, b);
    gemini(); await AT.providers.test("gemini", "KEEPME-9999");
    const exp = (await H("GET", "/api/data/export")).body;
    await H("POST", "/api/team/sam", { name: "Changed" });
    assert.ok((await H("POST", "/api/data/import", exp)).body.ok);
    assert.strictEqual(AT.agents.get("sam").name, "Sam"); assert.strictEqual(AT.providers.settings().providers.gemini.key, "KEEPME-9999");
    assert.strictEqual((await H("POST", "/api/data/import", { nope: 1 })).status, 400);
    await H("POST", "/api/data/reset"); assert.strictEqual(AT.agents.list().length, 0); assert.strictEqual(AT.providers.settings().providers.gemini.key, "");
  });

  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
})();
