/* Agent Town (web edition) - AI providers.
 *
 * The browser calls the provider's API directly with the key the user pasted.
 * Supported:  Google Gemini (free tier available), OpenAI, Anthropic Claude (API).
 *
 * A website cannot use a Claude.ai or ChatGPT *subscription*: those logins are
 * only for the official apps. API keys are billed separately by each company.
 */
(function (g) {
  "use strict";
  const AT = (g.AT = g.AT || {});

  const PROVIDERS = {
    gemini: {
      id: "gemini", label: "Google Gemini", short: "Gemini", free: true,
      keyUrl: "https://aistudio.google.com/apikey",
      blurb: "Free tier available. Create a key in Google AI Studio with your Google account. Also supports Google Search.",
    },
    openai: {
      id: "openai", label: "OpenAI (ChatGPT models)", short: "OpenAI", free: false,
      keyUrl: "https://platform.openai.com/api-keys",
      blurb: "Paid per use. This is the OpenAI API, which is billed separately from a ChatGPT Plus subscription.",
    },
    anthropic: {
      id: "anthropic", label: "Anthropic (Claude API)", short: "Claude", free: false,
      keyUrl: "https://console.anthropic.com/settings/keys",
      blurb: "Paid per use. This is the Claude API, which is billed separately from a Claude.ai Pro or Max subscription.",
    },
  };

  class ProviderError extends Error {
    constructor(code, message) { super(message); this.name = "ProviderError"; this.code = code; }
  }

  const P = {
    PROVIDERS,
    ProviderError,
    retryDelays: [2500, 7000],             // seconds-ish waits before retrying a busy service (tests shorten this)
    timeoutMs: 180000,
    _fetch: (...a) => g.fetch(...a),       // replaced in tests
  };

  /* ---------- http ---------- */
  async function http(providerId, url, { method, headers, body, timeoutMs } = {}) {
    const label = PROVIDERS[providerId].short;
    const ctl = typeof AbortController !== "undefined" ? new AbortController() : null;
    const timer = ctl ? setTimeout(() => ctl.abort(), timeoutMs || P.timeoutMs) : null;
    let res;
    try {
      res = await P._fetch(url, {
        method: method || "POST", headers: Object.assign({ "Content-Type": "application/json" }, headers || {}),
        body: body === undefined ? undefined : JSON.stringify(body), signal: ctl ? ctl.signal : undefined,
      });
    } catch (e) {
      if (e && e.name === "AbortError") throw new ProviderError("timeout", `${label} took too long to answer. Try again in a moment.`);
      throw new ProviderError("network", `Couldn't reach ${label}. Check your internet connection (a VPN, firewall or ad blocker can also block it).`);
    } finally { if (timer) clearTimeout(timer); }
    let data = null, text = "";
    try { text = await res.text(); data = text ? JSON.parse(text) : null; } catch (e) { data = null; }
    if (!res.ok) throw toError(providerId, res.status, data, text);
    return data || {};
  }

  function errMessage(data, text) {
    const e = data && (data.error || data);
    return String((e && (e.message || (typeof e === "string" ? e : ""))) || text || "").slice(0, 400);
  }

  function toError(providerId, status, data, text) {
    const label = PROVIDERS[providerId].short, raw = errMessage(data, text), low = raw.toLowerCase();
    const code = data && data.error && (data.error.code || data.error.type || data.error.status);
    if (status === 401 || status === 403 || /api key not valid|invalid api key|incorrect api key|authentication|permission_denied|invalid x-api-key/.test(low) || (status === 400 && /api key/.test(low))) {
      return new ProviderError("auth", `${label} did not accept the API key. Open Settings, then Connections, and paste the key again.`);
    }
    if (status === 429 || /resource_exhausted|rate limit|quota/.test(low) || code === "insufficient_quota") {
      if (code === "insufficient_quota" || /insufficient_quota|exceeded your current quota|billing|credit balance|per day|daily/.test(low)) {
        return new ProviderError("quota", `${label} says this key has no quota or credit left right now. Check your plan and billing with ${label}, or connect another provider.`);
      }
      return new ProviderError("rate", `${label} is limiting requests right now (common on free plans). Wait a minute and try again.`);
    }
    if (status === 529 || status === 503 || status === 500 || status === 502 || status === 504 || /overloaded|unavailable/.test(low)) {
      return new ProviderError("busy", `${label} is busy right now. Try again in a moment.`);
    }
    if (status === 404 && /model/.test(low)) {
      return new ProviderError("model", `${label} doesn't know the selected model. Open Settings, then Connections, and press Test to choose a working one.`);
    }
    return new ProviderError("other", `${label} returned an error (${status}): ${raw || "no details"}`);
  }

  async function withRetry(fn) {
    let attempt = 0;
    for (;;) {
      try { return await fn(); } catch (e) {
        const wait = P.retryDelays[attempt];
        if (e instanceof ProviderError && (e.code === "rate" || e.code === "busy") && wait !== undefined) { attempt++; await AT.sleep(wait); continue; }
        throw e;
      }
    }
  }

  /* ---------- model choice ---------- */
  const verOf = (s) => { const m = /(\d+(?:\.\d+)?)/.exec(s); return m ? parseFloat(m[1]) : 0; };

  P.pickGeminiModel = function (names) {
    const bad = /(image|tts|embedding|live|audio|vision|robotics|computer|learnlm|gemma|aqa|imagen|veo|exp\b|-exp|thinking|native|deep-research)/;
    const ok = names.filter((n) => /^gemini-\d/.test(n) && !bad.test(n));
    const tiers = [(n) => /flash/.test(n) && !/lite/.test(n), (n) => /flash-lite/.test(n), (n) => /pro/.test(n), () => true];
    for (const t of tiers) {
      const c = ok.filter(t);
      if (c.length) {
        c.sort((a, b) => (verOf(b) - verOf(a)) || ((/preview/.test(a) ? 1 : 0) - (/preview/.test(b) ? 1 : 0)) || a.length - b.length);
        return c[0];
      }
    }
    return "";
  };
  P.pickGeminiImageModel = function (names) {
    const c = names.filter((n) => /image/.test(n) && /^gemini/.test(n) && !/imagen|veo|live|tts/.test(n));
    c.sort((a, b) => ((/flash/.test(b) ? 1 : 0) - (/flash/.test(a) ? 1 : 0)) || (verOf(b) - verOf(a)) || ((/preview/.test(a) ? 1 : 0) - (/preview/.test(b) ? 1 : 0)));
    return c[0] || "";
  };
  P.pickOpenAIModel = function (ids) {
    const bad = /(audio|realtime|transcribe|tts|image|search|instruct|embedding|moderation|whisper|codex|preview|davinci|babbage|chat-latest|\d{4}-\d{2}-\d{2}|-\d{4}$)/;
    const ok = ids.filter((i) => /^(gpt-\d|o\d)/.test(i) && !bad.test(i));
    const prefs = [/^gpt-5(\.\d+)?-mini$/, /^gpt-4\.1-mini$/, /^gpt-4o-mini$/, /^gpt-5(\.\d+)?$/, /^gpt-4\.1$/, /^gpt-4o$/];
    for (const re of prefs) {
      const c = ok.filter((i) => re.test(i)).sort((a, b) => verOf(b) - verOf(a));
      if (c.length) return c[0];
    }
    return ok.sort()[0] || "";
  };
  P.pickAnthropicModel = function (ids) {
    for (const re of [/sonnet/, /haiku/, /opus/]) { const c = ids.filter((i) => /^claude-/.test(i) && re.test(i)); if (c.length) return c[0]; }
    return ids.find((i) => /^claude-/.test(i)) || "";
  };

  /* ---------- Gemini ---------- */
  const GEM = "https://generativelanguage.googleapis.com/v1beta";
  const gemHeaders = (key) => ({ "x-goog-api-key": key });

  async function gemList(key) {
    const out = [];
    let token = "";
    for (let i = 0; i < 5; i++) {
      const d = await http("gemini", `${GEM}/models?pageSize=200${token ? "&pageToken=" + encodeURIComponent(token) : ""}`, { method: "GET", headers: gemHeaders(key), timeoutMs: 30000 });
      (d.models || []).forEach((m) => { if ((m.supportedGenerationMethods || []).includes("generateContent")) out.push(String(m.name || "").replace(/^models\//, "")); });
      token = d.nextPageToken || ""; if (!token) break;
    }
    return out;
  }

  function gemText(d) {
    const cand = (d.candidates || [])[0];
    const parts = (cand && cand.content && cand.content.parts) || [];
    let text = parts.filter((p) => typeof p.text === "string" && !p.thought).map((p) => p.text).join("");
    if (!text.trim()) {
      const block = d.promptFeedback && d.promptFeedback.blockReason;
      if (block || (cand && /SAFETY|BLOCK|PROHIBITED/.test(cand.finishReason || ""))) {
        throw new ProviderError("blocked", "Gemini declined to answer this request (it was blocked by its safety filters). Try rewording it.");
      }
      throw new ProviderError("empty", "Gemini sent back an empty answer. Try again, or rephrase the task.");
    }
    const chunks = (cand && cand.groundingMetadata && cand.groundingMetadata.groundingChunks) || [];
    const seen = new Set(), src = [];
    chunks.forEach((c) => { const w = c.web; if (w && w.uri && !seen.has(w.uri)) { seen.add(w.uri); src.push(`- ${w.title || w.uri}: ${w.uri}`); } });
    if (src.length) text += "\n\nSources (Google Search):\n" + src.slice(0, 6).join("\n");
    return text;
  }

  async function gemGenerate({ key, model, system, prompt, search, urls }) {
    const body = { systemInstruction: { parts: [{ text: system }] }, contents: [{ role: "user", parts: [{ text: prompt }] }] };
    const tools = [];
    if (search) tools.push({ google_search: {} });
    if (urls) tools.push({ url_context: {} });
    const url = `${GEM}/models/${encodeURIComponent(model)}:generateContent`;
    const call = (b) => withRetry(() => http("gemini", url, { headers: gemHeaders(key), body: b }));
    let d;
    if (tools.length) {
      try { d = await call(Object.assign({ tools }, body)); } catch (e) {
        if (e instanceof ProviderError && (e.code === "other" || e.code === "model")) d = await call(body);   // this model/key can't use the tools: answer without them
        else throw e;
      }
    } else d = await call(body);
    return gemText(d);
  }

  async function gemImage({ key, model, prompt, aspect }) {
    const url = `${GEM}/models/${encodeURIComponent(model)}:generateContent`;
    const base = { contents: [{ role: "user", parts: [{ text: prompt }] }] };
    const withAspect = Object.assign({}, base, { generationConfig: { responseModalities: ["IMAGE", "TEXT"], imageConfig: { aspectRatio: aspect || "1:1" } } });
    const plain = Object.assign({}, base, { generationConfig: { responseModalities: ["IMAGE", "TEXT"] } });
    let d;
    try { d = await withRetry(() => http("gemini", url, { headers: gemHeaders(key), body: withAspect })); } catch (e) {
      if (e instanceof ProviderError && e.code === "other") d = await withRetry(() => http("gemini", url, { headers: gemHeaders(key), body: plain }));
      else throw e;
    }
    const parts = ((d.candidates || [])[0] && d.candidates[0].content && d.candidates[0].content.parts) || [];
    for (const p of parts) {
      const inl = p.inlineData || p.inline_data;
      if (inl && inl.data) return { mime: inl.mimeType || inl.mime_type || "image/png", b64: inl.data };
    }
    throw new ProviderError("empty", "Gemini returned no image (the prompt may have been blocked, or this key can't make images yet). Try rewording it.");
  }

  /* ---------- OpenAI ---------- */
  const OAI = "https://api.openai.com/v1";
  const oaiHeaders = (key) => ({ Authorization: "Bearer " + key });

  async function oaiList(key) {
    const d = await http("openai", `${OAI}/models`, { method: "GET", headers: oaiHeaders(key), timeoutMs: 30000 });
    return (d.data || []).map((m) => m.id);
  }
  function oaiText(d) {
    if (typeof d.output_text === "string" && d.output_text.trim()) return d.output_text;
    const parts = [];
    (d.output || []).forEach((it) => {
      if (it.type === "message") (it.content || []).forEach((c) => { if ((c.type === "output_text" || c.type === "text") && c.text) parts.push(c.text); });
    });
    const t = parts.join("");
    if (!t.trim()) throw new ProviderError("empty", "OpenAI sent back an empty answer. Try again, or rephrase the task.");
    return t;
  }
  async function oaiGenerate({ key, model, system, prompt, search }) {
    const body = { model, instructions: system, input: prompt };
    const call = (b) => withRetry(() => http("openai", `${OAI}/responses`, { headers: oaiHeaders(key), body: b }));
    let d;
    try {
      d = await call(search ? Object.assign({ tools: [{ type: "web_search" }] }, body) : body);
    } catch (e) {
      if (search && e instanceof ProviderError && (e.code === "other" || e.code === "model")) d = await call(body);
      else if (e instanceof ProviderError && e.code === "other" && /404/.test(e.message)) {
        const c = await withRetry(() => http("openai", `${OAI}/chat/completions`, { headers: oaiHeaders(key), body: { model, messages: [{ role: "system", content: system }, { role: "user", content: prompt }] } }));
        const t = c.choices && c.choices[0] && c.choices[0].message && c.choices[0].message.content;
        if (!t) throw new ProviderError("empty", "OpenAI sent back an empty answer.");
        return t;
      } else throw e;
    }
    return oaiText(d);
  }

  /* ---------- Anthropic (Claude API) ---------- */
  const ANT = "https://api.anthropic.com/v1";
  const antHeaders = (key) => ({ "x-api-key": key, "anthropic-version": "2023-06-01", "anthropic-dangerous-direct-browser-access": "true" });

  async function antList(key) {
    const d = await http("anthropic", `${ANT}/models?limit=100`, { method: "GET", headers: antHeaders(key), timeoutMs: 30000 });
    return (d.data || []).map((m) => m.id);
  }
  async function antGenerate({ key, model, system, prompt, search }) {
    const body = { model, max_tokens: 4096, system, messages: [{ role: "user", content: prompt }] };
    const call = (b) => withRetry(() => http("anthropic", `${ANT}/messages`, { headers: antHeaders(key), body: b }));
    let d;
    try {
      d = await call(search ? Object.assign({ tools: [{ type: "web_search_20250305", name: "web_search", max_uses: 3 }] }, body) : body);
    } catch (e) {
      if (search && e instanceof ProviderError && (e.code === "other" || e.code === "model")) d = await call(body);
      else throw e;
    }
    const t = (d.content || []).filter((b) => b.type === "text").map((b) => b.text).join("");
    if (!t.trim()) throw new ProviderError("empty", "Claude sent back an empty answer. Try again, or rephrase the task.");
    return t;
  }

  /* ---------- settings access ---------- */
  P.defaultSettings = () => ({
    setupDone: false, about: "", defaultProvider: null, imageDailyCap: 10,
    providers: {
      gemini: { key: "", model: "", imageModel: "", status: "none", error: "", checkedAt: 0 },
      openai: { key: "", model: "", imageModel: "", status: "none", error: "", checkedAt: 0 },
      anthropic: { key: "", model: "", imageModel: "", status: "none", error: "", checkedAt: 0 },
    },
  });
  P.settings = function () {
    let s = AT.store.get("settings");
    if (!s) s = AT.store.set("settings", P.defaultSettings());
    const d = P.defaultSettings();
    if (!s.providers) s.providers = d.providers;
    Object.keys(d.providers).forEach((k) => { if (!s.providers[k]) s.providers[k] = d.providers[k]; });
    if (s.imageDailyCap === undefined) s.imageDailyCap = 10;
    if (s.about === undefined) s.about = "";
    return s;
  };
  P.save = () => AT.store.set("settings", P.settings());
  P.connected = () => Object.keys(PROVIDERS).filter((id) => { const c = P.settings().providers[id]; return c.key && c.status === "ok"; });
  P.hasKey = (id) => !!P.settings().providers[id].key;

  /** The provider an agent should use: its own choice if connected, else the default, else any connected one. */
  P.resolve = function (agent) {
    const s = P.settings(), ok = P.connected();
    if (!ok.length) throw new ProviderError("none", "No AI provider is connected yet. Open Settings, then Connections, and add a key (Google Gemini has a free tier).");
    const want = agent && agent.provider && agent.provider !== "default" ? agent.provider : null;
    if (want && ok.includes(want)) return want;
    if (s.defaultProvider && ok.includes(s.defaultProvider)) return s.defaultProvider;
    return ok[0];
  };

  /** Ask the provider for an answer. Returns { text, provider, model }. */
  P.generate = async function (providerId, { system, prompt, search, urls }) {
    const c = P.settings().providers[providerId];
    if (!c || !c.key) throw new ProviderError("none", `${PROVIDERS[providerId].short} is not connected.`);
    const args = { key: c.key, model: c.model, system, prompt, search: !!search, urls: !!urls };
    let text;
    if (providerId === "gemini") text = await gemGenerate(Object.assign(args, { model: c.model || "gemini-2.5-flash" }));
    else if (providerId === "openai") text = await oaiGenerate(Object.assign(args, { model: c.model || "gpt-4.1-mini" }));
    else text = await antGenerate(Object.assign(args, { model: c.model || "claude-sonnet-4-5" }));
    return { text, provider: providerId, model: args.model };
  };

  /** Make an image (Gemini only). Returns { mime, b64 }. */
  P.generateImage = async function (prompt, aspect) {
    const c = P.settings().providers.gemini;
    if (!c.key || c.status !== "ok") throw new ProviderError("none", "Image creation needs a connected Google Gemini key (Settings, then Connections).");
    return gemImage({ key: c.key, model: c.imageModel || "gemini-2.5-flash-image", prompt, aspect });
  };

  /** Check a key: list models, choose one, and make one tiny request. */
  P.test = async function (providerId, key) {
    const s = P.settings(), c = s.providers[providerId];
    if (key !== undefined) c.key = String(key || "").trim();
    if (!c.key) { c.status = "none"; c.error = ""; P.save(); return { ok: false, message: "Paste an API key first." }; }
    try {
      let names = [], model = "", imageModel = "";
      if (providerId === "gemini") { names = await gemList(c.key); model = P.pickGeminiModel(names); imageModel = P.pickGeminiImageModel(names); }
      else if (providerId === "openai") { names = await oaiList(c.key); model = P.pickOpenAIModel(names); }
      else { names = await antList(c.key); model = P.pickAnthropicModel(names); }
      if (!model) model = c.model || "";
      if (!model) throw new ProviderError("model", `No usable ${PROVIDERS[providerId].short} chat model was found for this key.`);
      c.model = model; if (imageModel) c.imageModel = imageModel;
      const r = await P.generate(providerId, { system: "You are a connection test.", prompt: "Reply with the single word OK.", search: false, urls: false });
      c.status = "ok"; c.error = ""; c.checkedAt = AT.now();
      if (!s.defaultProvider || !P.settings().providers[s.defaultProvider].key) s.defaultProvider = providerId;
      P.save();
      return { ok: true, message: `Connected. Using model ${model}.`, model, reply: r.text.slice(0, 40) };
    } catch (e) {
      c.status = "error"; c.error = e.message || String(e); c.checkedAt = AT.now(); P.save();
      return { ok: false, message: c.error, code: e.code };
    }
  };

  /** Safe summary for the UI: never includes the key itself. */
  P.publicStatus = function () {
    const s = P.settings(), out = {};
    Object.keys(PROVIDERS).forEach((id) => {
      const c = s.providers[id], k = c.key || "";
      out[id] = Object.assign({}, PROVIDERS[id], {
        hasKey: !!k, keyHint: k ? "••••" + k.slice(-4) : "", model: c.model, imageModel: c.imageModel,
        status: c.status, error: c.error, checkedAt: c.checkedAt,
      });
    });
    return { providers: out, defaultProvider: s.defaultProvider, connected: P.connected() };
  };

  AT.providers = P;
})(typeof window !== "undefined" ? window : globalThis);
