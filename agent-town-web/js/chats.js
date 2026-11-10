/* Agent Town (web edition) - chats: one chat per agent plus group chats.
 * Saved in the user's browser. */
(function (g) {
  "use strict";
  const AT = (g.AT = g.AT || {});
  const C = {};
  const MAX_MESSAGES = 400, CONTEXT_MESSAGES = 8, CONTEXT_CHARS = 1500;

  C.agentChatId = (agentId) => "agent-" + agentId;
  const doc = () => { let d = AT.store.get("chats"); if (!d || !d.chats) d = AT.store.set("chats", { chats: {} }); return d; };
  const persist = () => AT.store.set("chats", doc());

  C.ensure = function (agentIds) {
    const d = doc(); let changed = false;
    agentIds.forEach((id) => {
      const cid = C.agentChatId(id);
      if (!d.chats[cid]) { d.chats[cid] = { id: cid, type: "agent", agents: [id], title: "", created: AT.now(), messages: [] }; changed = true; }
    });
    if (changed) persist();
  };

  /** Every agent's own chat first (in team order), then groups. */
  C.list = function (orderedIds) {
    C.ensure(orderedIds);
    const d = doc(), all = Object.values(d.chats);
    const idx = new Map(orderedIds.map((id, i) => [id, i]));
    const singles = all.filter((c) => c.type === "agent" && idx.has(c.agents[0])).sort((a, b) => idx.get(a.agents[0]) - idx.get(b.agents[0]));
    const groups = all.filter((c) => c.type === "group").sort((a, b) => (a.created || 0) - (b.created || 0));
    return singles.concat(groups);
  };
  C.get = (id) => doc().chats[id] || null;

  C.createGroup = function (agentIds, title) {
    const d = doc(), cid = "grp-" + AT.uid(10);
    const chat = { id: cid, type: "group", agents: agentIds.slice(), title: String(title || "").trim().slice(0, 60), created: AT.now(), messages: [] };
    d.chats[cid] = chat; persist(); return chat;
  };
  C.deleteGroup = function (id) {
    const d = doc(), c = d.chats[id];
    if (!c || c.type !== "group") return false;
    delete d.chats[id]; persist(); return true;
  };

  C.append = function (chatId, role, text, agentId, kind, taskId, extra) {
    const d = doc(); let chat = d.chats[chatId];
    if (!chat && chatId.startsWith("agent-")) { C.ensure([chatId.slice(6)]); chat = d.chats[chatId]; }
    if (!chat) return null;
    const msg = { id: AT.uid(12), role, agent_id: agentId || null, kind: kind || "text", text: text || "", ts: AT.now(), task_id: taskId || null };
    if (extra) Object.assign(msg, extra);
    chat.messages.push(msg);
    if (chat.messages.length > MAX_MESSAGES) chat.messages = chat.messages.slice(-MAX_MESSAGES);
    persist(); return msg;
  };
  C.update = function (chatId, messageId, fields) {
    const chat = doc().chats[chatId]; if (!chat) return null;
    const m = chat.messages.find((x) => x.id === messageId); if (!m) return null;
    Object.assign(m, fields); persist(); return m;
  };

  /** Recent conversation as text, so a follow-up question has its context (each AI request starts fresh). */
  C.context = function (chatId, nameOf) {
    const chat = C.get(chatId); if (!chat) return "";
    return chat.messages.slice(-CONTEXT_MESSAGES).filter((m) => m.kind === "text").map((m) => {
      const who = m.role === "user" ? "Owner" : nameOf(m.agent_id);
      let t = (m.text || "").trim(); if (t.length > CONTEXT_CHARS) t = t.slice(0, CONTEXT_CHARS) + " ...";
      return `${who}: ${t}`;
    }).join("\n\n");
  };

  /** An agent was deleted: remove its chat and take it out of groups (a group with fewer than two agents is removed). */
  C.removeAgent = function (agentId) {
    const d = doc();
    delete d.chats[C.agentChatId(agentId)];
    Object.values(d.chats).forEach((c) => {
      if (c.type !== "group" || !c.agents.includes(agentId)) return;
      c.agents = c.agents.filter((a) => a !== agentId);
      if (c.agents.length < 2) delete d.chats[c.id];
    });
    persist();
  };

  AT.chats = C;
})(typeof window !== "undefined" ? window : globalThis);
