/* Agent Town (web edition) - runs tasks: one agent in its own chat, or a group
 * of agents taking turns. Mirrors what a server would do, but inside the page. */
(function (g) {
  "use strict";
  const AT = (g.AT = g.AT || {});
  const R = { groupBusy: new Set(), running: 0 };

  const emit = (m) => AT.bus.emit(m);
  const nameOf = (id) => { const a = AT.agents.get(id); return a ? a.name : (id || "Someone"); };

  /* ---------- keep to a few AI requests at once (friendlier to free plans) ---------- */
  const MAX_PARALLEL = 3;
  let active = 0; const waiters = [];
  async function slot() {
    if (active < MAX_PARALLEL) { active++; return; }
    await new Promise((res) => waiters.push(res));
    active++;
  }
  function release() { active--; const n = waiters.shift(); if (n) n(); }

  /* ---------- tasks that were running when the page closed ---------- */
  const pendingMap = () => AT.store.get("pending", {});
  function markPending(taskId, info) { const p = pendingMap(); p[taskId] = info; AT.store.set("pending", p); }
  function clearPending(taskId) { const p = pendingMap(); if (p[taskId]) { delete p[taskId]; AT.store.set("pending", p); } }
  R.recoverInterrupted = function () {
    const p = pendingMap(); let any = false;
    Object.entries(p).forEach(([tid, info]) => {
      if (info.chatId && AT.chats.get(info.chatId)) {
        AT.chats.append(info.chatId, "agent", "This task was interrupted because the page was closed or reloaded before it finished. Please send it again.", info.agentId, "error", tid);
      }
      any = true;
    });
    if (any) AT.store.set("pending", {});
  };

  /* ---------- one agent, one task ---------- */
  R.runAgentTask = async function (agentId, task, taskId, chatId, displayTask) {
    const agent = AT.agents.get(agentId);
    const shown = displayTask !== undefined ? displayTask : task;
    if (!agent) return null;
    emit({ type: "task_started", agent_id: agentId, task_id: taskId, chat_id: chatId });
    R.running++;
    markPending(taskId, { chatId, agentId, ts: AT.now() });
    const status = (message) => emit({ type: "status", agent_id: agentId, task_id: taskId, chat_id: chatId, message });
    let acquired = false;
    try {
      const provider = AT.providers.resolve(agent);
      if (active >= MAX_PARALLEL) status("Waiting for a free slot...");
      await slot(); acquired = true;
      status(`Thinking with ${AT.providers.PROVIDERS[provider].short}...`);
      const system = AT.agents.buildSystem(agent);
      const prompt = AT.agents.buildPrompt(agent, task);
      const urls = AT.agents.hasUrl(task);
      const out = await AT.providers.generate(provider, { system, prompt, search: agent.search || urls, urls });
      release(); acquired = false;

      let text = out.text, plan = [], imageReqs = [];
      if (agent.manager) { const r = AT.agents.extractPlan(text, agent.id); text = r.text; plan = r.plan; }
      if (agent.design) { const r = AT.agents.extractImages(text, 3); text = r.text; imageReqs = r.requests; }
      text = (text || "").trim() || "(No written answer.)";
      AT.reports.add(agentId, shown, text);

      let planMsg = null;
      if (chatId) {
        const msg = AT.chats.append(chatId, "agent", text, agentId, "text", taskId);
        if (msg) emit({ type: "chat_message", chat_id: chatId, message: msg });
        for (const req of imageReqs) {
          status("Creating an image...");
          let m;
          try {
            const img = await AT.images.create(req.prompt, req.aspect, agentId);
            m = AT.chats.append(chatId, "agent", req.prompt, agentId, "image", taskId, { image_id: img.id, aspect: req.aspect });
          } catch (e) {
            m = AT.chats.append(chatId, "agent", (e && e.message) || String(e), agentId, "error", taskId);
          }
          if (m) emit({ type: "chat_message", chat_id: chatId, message: m });
        }
        if (plan.length) {
          planMsg = AT.chats.append(chatId, "agent", "", agentId, "plan", taskId, { assignments: plan, status: "pending" });
          if (planMsg) emit({ type: "chat_message", chat_id: chatId, message: planMsg });
        }
      }
      emit({ type: "result", agent_id: agentId, task_id: taskId, chat_id: chatId, task: shown, result: text, failed: false });
      if (plan.length) emit({ type: "plan", agent_id: agentId, task_id: taskId, chat_id: chatId, message_id: planMsg ? planMsg.id : null, assignments: plan });
      return text;
    } catch (e) {
      const message = (e && e.message) || String(e);
      if (chatId) {
        const m = AT.chats.append(chatId, "agent", message, agentId, "error", taskId);
        if (m) emit({ type: "chat_message", chat_id: chatId, message: m });
      }
      emit({ type: "error", agent_id: agentId, task_id: taskId, chat_id: chatId, task: shown, message });
      return null;
    } finally {
      if (acquired) release();
      R.running--;
      clearPending(taskId);
    }
  };

  /* ---------- group chat: agents take turns and build on each other ---------- */
  const withContext = (context, body) => (context ? `Conversation so far (oldest first):\n${context}\n\n---\n${body}` : body);

  R.runGroupTurn = async function (chatId, text, agentIds, context) {
    try {
      const names = agentIds.map(nameOf).join(", ");
      const prior = [];
      for (const id of agentIds) {
        if (!AT.agents.get(id)) continue;
        let body = `You are in a group chat with the owner and these teammates: ${names}. Work on the owner's message together.\n\nOwner's message:\n${text}`;
        if (prior.length) {
          body += "\n\nYour teammates' replies so far:\n" + prior.map(([n, r]) => `[${n}]: ${r}`).join("\n\n") +
            "\n\nAdd your own contribution from your role. Build on what they said instead of repeating it, and say so if you disagree.";
        } else body += "\n\nYou go first. Reply from your own role; your teammates will add to your answer after you.";
        const reply = await R.runAgentTask(id, withContext(context, body), AT.uid(16), chatId, text);
        if (reply) prior.push([nameOf(id), reply]);
      }
    } finally {
      R.groupBusy.delete(chatId);
      emit({ type: "group_idle", chat_id: chatId });
    }
  };

  /** Save the owner's message into a chat and start the agent(s). Returns {message, task_ids} or {error}. */
  R.dispatch = function (chatId, text, fromPlan) {
    let chat = AT.chats.get(chatId);
    if (!chat && chatId.startsWith("agent-") && AT.agents.get(chatId.slice(6))) { AT.chats.ensure([chatId.slice(6)]); chat = AT.chats.get(chatId); }
    if (!chat) return { error: "That chat doesn't exist." };
    text = String(text || "").trim();
    if (!text) return { error: "Type a message first." };
    if (text.length > 20000) return { error: "That message is too long. Please shorten it." };
    const agents = chat.agents.filter((a) => AT.agents.get(a));
    if (!agents.length) return { error: "No agents in this chat are available." };
    if (chat.type === "group" && R.groupBusy.has(chatId)) return { error: "This group is still working on your last message." };
    if (!AT.providers.connected().length) return { error: "No AI provider is connected yet. Open the Dashboard, then Connections, and add a key (Google Gemini has a free tier)." };

    const context = AT.chats.context(chatId, nameOf);
    const msg = AT.chats.append(chatId, "user", text, null, "text", null, fromPlan ? { from_plan: true } : null);
    emit({ type: "chat_message", chat_id: chatId, message: msg });

    if (chat.type === "group") {
      R.groupBusy.add(chatId);
      R.runGroupTurn(chatId, text, agents, context);          // runs in the background
      return { message: msg, task_ids: [] };
    }
    const taskId = AT.uid(16);
    R.runAgentTask(agents[0], context ? withContext(context, `Owner's new message:\n${text}`) : text, taskId, chatId, text);
    return { message: msg, task_ids: [taskId] };
  };

  R.planAction = function (chatId, messageId, action) {
    const chat = AT.chats.get(chatId);
    const plan = chat && chat.messages.find((m) => m.id === messageId && m.kind === "plan");
    if (!plan) return { error: "That plan was not found." };
    if (plan.status !== "pending") return { error: `That plan was already ${plan.status}.` };
    if (action === "dismiss") {
      const u = AT.chats.update(chatId, messageId, { status: "dismissed" });
      emit({ type: "chat_message_updated", chat_id: chatId, message: u });
      return { status: "dismissed", task_ids: [] };
    }
    if (action !== "approve") return { error: "Unknown action." };
    const taskIds = [];
    (plan.assignments || []).forEach((a) => {
      if (!AT.agents.get(a.agent)) return;
      const r = R.dispatch(AT.chats.agentChatId(a.agent), a.task || "", true);
      if (r.message) taskIds.push(...r.task_ids);
    });
    const u = AT.chats.update(chatId, messageId, { status: "approved", count: taskIds.length });
    emit({ type: "chat_message_updated", chat_id: chatId, message: u });
    return { status: "approved", task_ids: taskIds };
  };

  if (typeof g.addEventListener === "function") {
    g.addEventListener("beforeunload", (e) => { if (R.running > 0) { e.preventDefault(); e.returnValue = ""; } });
  }

  AT.runtime = R;
})(typeof window !== "undefined" ? window : globalThis);
