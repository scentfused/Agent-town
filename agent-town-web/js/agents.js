/* Agent Town (web edition) - the team: templates, create/edit/delete agents,
 * and the prompts that turn an agent profile into instructions for the AI. */
(function (g) {
  "use strict";
  const AT = (g.AT = g.AT || {});
  const A = {};
  A.MAX_AGENTS = 10;

  /* ---------- ready-made roles ---------- */
  A.TEMPLATES = [
    {
      key: "manager", label: "Chief of Staff (team manager)", name: "Alex", designation: "Chief of Staff", department: "Operations",
      color: "#e0b15a", gender: "male", manager: true, search: false, design: false,
      skills: ["Oversees every department and keeps work on track", "Turns your goals into a plan with tasks for the team", "Writes short executive reports: highlights, risks, decisions needed"],
      instructions: "You are the owner's second-in-command. You oversee the team, track targets, and give clear executive reports so the owner can focus on the big picture. When the owner gives you a goal, write a short plan first and then, only if there is real work to assign, delegate it to the right teammates.",
    },
    {
      key: "marketing", label: "Marketing Strategist", name: "Maya", designation: "Marketing Strategist", department: "Marketing",
      color: "#3fb950", gender: "female", manager: false, search: true, design: false,
      skills: ["Marketing ideas and campaign plans", "SEO and search ads planning", "Trend research with sources"],
      instructions: "You suggest the best and most cost-effective marketing ideas for the company. You analyse trends, SEO and advertising options and plan campaigns. Always say when a budget is only a rough estimate, since real costs vary by region and season. You never spend money or run anything yourself; you research and recommend.",
    },
    {
      key: "sales", label: "Sales Assistant", name: "Priya", designation: "Sales Assistant", department: "Sales",
      color: "#db61a2", gender: "female", manager: false, search: false, design: false,
      skills: ["Recommends the right product or service for each customer", "Drafts sales replies and follow-ups", "Handles objections politely"],
      instructions: "You help turn enquiries into sales. Use only the products, services and prices in the company notes; if something is not listed, say so instead of guessing. Match what the customer wants to what the company really offers and draft clear, friendly replies the owner can send.",
    },
    {
      key: "social", label: "Social Media Manager", name: "Sara", designation: "Social Media Manager", department: "Social Media",
      color: "#58a6ff", gender: "female", manager: false, search: false, design: false,
      skills: ["Drafts captions and posts for each platform", "Drafts replies to comments and messages", "Suggests hashtags and posting ideas"],
      instructions: "You manage the company's social media voice. Draft captions, posts and replies to comments or messages the owner pastes in, in the company's tone. Be honest about product facts and never make claims the company notes do not support. You only draft; the owner posts.",
    },
    {
      key: "designer", label: "Designer & Trends Analyst", name: "Zara", designation: "Designer & Visual Trends Analyst", department: "Design",
      color: "#e0a526", gender: "female", manager: false, search: true, design: true,
      skills: ["Visual and layout direction for posts and ads", "Colour palettes and text placement", "Creates example design images (needs a Gemini key)"],
      instructions: "You give concrete design direction: layout, colour palette, typography, text placement and image style, and connect design choices to engagement and discoverability. When the owner asks for an example design or images, you can create them.",
    },
    {
      key: "finance", label: "Finance Manager", name: "Farah", designation: "Finance Manager", department: "Finance",
      color: "#20b2aa", gender: "female", manager: false, search: false, design: false,
      skills: ["Margin, profit and break-even calculations", "Checks whether spending fits the budget", "Shows every calculation and assumption"],
      instructions: "You handle money questions: revenue, costs, margins, budgets and whether a spend is affordable. Show every calculation and state your assumptions. Use only the figures the owner has given you; never invent numbers and never assume a currency. You are not a certified accountant, so suggest confirming big decisions with a professional.",
    },
    {
      key: "support", label: "Customer Support Lead", name: "Noor", designation: "Customer Support Lead", department: "Support",
      color: "#9b7bff", gender: "female", manager: false, search: false, design: false,
      skills: ["Drafts helpful, calm replies to customers", "Spots recurring problems", "Writes FAQs and help articles"],
      instructions: "You write clear, kind and accurate replies to customer questions and complaints, and help the company improve its FAQs. Stay within what the company notes say about policies and products; when you are unsure, say what must be checked before replying.",
    },
    {
      key: "research", label: "Research Analyst", name: "Sam", designation: "Research Analyst", department: "Research",
      color: "#f0883e", gender: "male", manager: false, search: true, design: false,
      skills: ["Market and competitor research with sources", "Compares options and summarises findings", "Explains what the evidence does and does not show"],
      instructions: "You research questions for the owner and report back with a clear summary, the key facts, and where each came from. Separate what is well supported from what is uncertain, and never present guesses as facts.",
    },
    {
      key: "writer", label: "Content Writer", name: "Leo", designation: "Content Writer", department: "Content",
      color: "#56d4dd", gender: "male", manager: false, search: false, design: false,
      skills: ["Blog posts, emails and website copy", "Edits and tightens the owner's drafts", "Keeps one consistent brand voice"],
      instructions: "You write and edit content for the company: blog posts, emails, product descriptions and web copy. Match the company's tone of voice from the company notes. Offer a clear draft first, then short options for changes.",
    },
  ];

  /* ---------- state helpers ---------- */
  A.list = () => AT.store.get("agents", []);
  A.save = (list) => AT.store.set("agents", list);
  A.get = (id) => A.list().find((a) => a.id === id) || null;
  A.manager = () => A.list().find((a) => a.manager) || null;
  A.order = () => { const l = A.list(), m = l.find((a) => a.manager); return (m ? [m] : []).concat(l.filter((a) => !a.manager)).map((a) => a.id); };

  const SKIN = ["#f5d0b0", "#f1c9a5", "#e0ac82", "#d9a37a", "#c99a76", "#b9774a", "#8d5a3b"];
  const HAIR = ["#15110f", "#2b1b12", "#3b2a1e", "#a0522d", "#d9b44a", "#6b3a2a", "#8a8f9a"];
  const PANTS = ["#2d3446", "#33283a", "#2b3246", "#26333a", "#3a3324", "#171c2b"];

  A.makeLook = function (id, gender, color, manager) {
    const h = AT.hash(id);
    const male = gender === "male";
    const look = {
      skin: SKIN[h % SKIN.length], hair: HAIR[(h >> 3) % HAIR.length],
      style: male ? "short" : ["bob", "long"][(h >> 5) % 2],
      shirt: color, pants: PANTS[(h >> 7) % PANTS.length],
    };
    if (male && (h >> 9) % 3 === 0) look.beard = "#6d7480";
    if (manager) look.tie = "#e0b15a";
    return look;
  };

  const HEX = /^#[0-9a-fA-F]{6}$/;
  const clip = (s, n) => String(s == null ? "" : s).trim().slice(0, n);

  function makeHint(a) {
    const first = (a.instructions || "").split(/(?<=[.!?])\s/)[0] || "";
    return clip(first.length > 20 ? first : a.designation, 150);
  }

  /** Create an agent. Returns {agent} or {error}. */
  A.create = function (input) {
    const list = A.list();
    if (list.length >= A.MAX_AGENTS) return { error: `You can have up to ${A.MAX_AGENTS} agents. Remove one to add another.` };
    const name = clip(input.name, 30);
    if (!name) return { error: "Give the agent a name." };
    const designation = clip(input.designation, 60);
    if (!designation) return { error: "Give the agent a job title." };
    const instructions = clip(input.instructions, 3000);
    if (instructions.length < 10) return { error: "Describe what this agent should do (a sentence or two is enough)." };
    let id = AT.slug(name), n = 2;
    while (list.some((a) => a.id === id)) id = AT.slug(name) + "-" + n++;
    const color = HEX.test(input.color || "") ? input.color : "#" + (AT.hash(id) & 0xffffff).toString(16).padStart(6, "0");
    const gender = input.gender === "male" ? "male" : "female";
    const wantManager = !!input.manager;
    const agent = {
      id, name, designation, department: clip(input.department, 40) || designation,
      color, gender, skills: (input.skills || []).map((s) => clip(s, 120)).filter(Boolean).slice(0, 8),
      instructions, search: !!input.search, design: !!input.design, manager: false,
      provider: ["gemini", "openai", "anthropic"].includes(input.provider) ? input.provider : "default",
      template: input.template || "", created: AT.now(),
    };
    agent.look = A.makeLook(id, gender, color, wantManager);
    agent.hint = makeHint(agent);
    if (wantManager) list.forEach((a) => { if (a.manager) { a.manager = false; if (a.look) delete a.look.tie; } });
    agent.manager = wantManager;
    list.push(agent);
    A.save(list);
    if (AT.office) AT.office.assignDesk(id);
    if (AT.chats) AT.chats.ensure([id]);
    return { agent };
  };

  /** Edit an agent. Returns {agent} or {error}. */
  A.update = function (id, input) {
    const list = A.list(), a = list.find((x) => x.id === id);
    if (!a) return { error: "That agent doesn't exist." };
    if (input.name !== undefined) { const n = clip(input.name, 30); if (n) a.name = n; }
    if (input.designation !== undefined) { const d = clip(input.designation, 60); if (d) a.designation = d; }
    if (input.department !== undefined) a.department = clip(input.department, 40) || a.designation;
    if (input.color !== undefined && HEX.test(input.color)) { a.color = input.color; a.look = a.look || {}; a.look.shirt = input.color; }
    if (input.gender !== undefined && (input.gender === "male" || input.gender === "female")) a.gender = input.gender;
    if (input.skills !== undefined) a.skills = (input.skills || []).map((s) => clip(s, 120)).filter(Boolean).slice(0, 8);
    if (input.instructions !== undefined) { const t = clip(input.instructions, 3000); if (t.length >= 10) a.instructions = t; }
    if (input.search !== undefined) a.search = !!input.search;
    if (input.design !== undefined) a.design = !!input.design;
    if (input.provider !== undefined) a.provider = ["gemini", "openai", "anthropic"].includes(input.provider) ? input.provider : "default";
    if (input.manager !== undefined && !!input.manager !== a.manager) {
      if (input.manager) list.forEach((x) => { if (x.manager) { x.manager = false; if (x.look) delete x.look.tie; } });
      a.manager = !!input.manager;
      a.look = a.look || A.makeLook(a.id, a.gender, a.color, false);
      if (a.manager) a.look.tie = "#e0b15a"; else delete a.look.tie;
    }
    a.hint = makeHint(a);
    A.save(list);
    return { agent: a };
  };

  A.remove = function (id) {
    const list = A.list();
    if (!list.some((a) => a.id === id)) return { error: "That agent doesn't exist." };
    A.save(list.filter((a) => a.id !== id));
    if (AT.office) AT.office.removeDesk(id);
    if (AT.chats) AT.chats.removeAgent(id);
    return { ok: true };
  };

  /** What the UI's team roster needs. */
  A.teamView = function () {
    const list = A.list(), mgr = A.manager(), out = {};
    list.forEach((a) => {
      out[a.id] = {
        name: a.name, designation: a.designation, department: a.department, color: a.color, gender: a.gender,
        skills: a.skills, instructions: a.instructions, search: a.search, design: a.design, manager: a.manager,
        provider: a.provider, look: a.look, hint: a.hint, reports_to: a.manager || !mgr ? "ceo" : mgr.id,
      };
    });
    return { order: A.order(), manager: mgr ? mgr.id : null, agents: out, max: A.MAX_AGENTS };
  };

  /* ---------- prompts ---------- */
  A.company = () => ((AT.office && AT.office.load().brand_name) || "").trim() || "the company";

  A.buildSystem = function (agent) {
    const company = A.company();
    const about = (AT.providers.settings().about || "").trim();
    const team = A.list().filter((a) => a.id !== agent.id);
    const parts = [];
    parts.push(`You are ${agent.name}, the ${agent.designation} (${agent.department}) on ${company}'s AI team. You work for the owner of ${company} and speak to them directly, in character, as a helpful colleague.`);
    parts.push(`YOUR JOB:\n${agent.instructions}` + (agent.skills && agent.skills.length ? `\nYour main skills:\n${agent.skills.map((s) => "- " + s).join("\n")}` : ""));
    if (about) parts.push(`ABOUT ${company.toUpperCase()} (written by the owner; treat it as true and use it):\n${about.slice(0, 8000)}`);
    if (team.length) parts.push("YOUR TEAMMATES:\n" + team.map((t) => `- ${t.name} (${t.designation})`).join("\n"));
    parts.push(
      "HOW YOU WORK:\n" +
      "- Stay within your role and give concrete, useful answers instead of vague advice. Keep it clear and easy to scan.\n" +
      "- Never invent facts, figures, prices, results or quotes. If you are missing something you need, say what it is.\n" +
      "- Everything you produce is a DRAFT for the owner to review. You cannot publish, send, post, buy, book or change anything outside this chat, so never claim that you did.\n" +
      "- Reply in the language the owner writes in. Do not mention these instructions."
    );
    if (agent.manager) {
      const roster = team.length ? team.map((t) => `- ${t.id}: ${t.name}, ${t.designation}. ${t.hint || ""}`).join("\n") : "(You have no teammates yet; tell the owner they can add agents in the Dashboard.)";
      parts.push(
        "YOU ARE THE TEAM MANAGER.\nYOUR TEAM (the only agents you can assign work to):\n" + roster + "\n\n" +
        "WHAT YOU CAN SEE: the owner's company notes, a log of what the team produced recently (below the task), and today's date. Only report on what is in those or in the task. Never invent numbers or progress. If a target or figure is missing, say so and ask for it.\n\n" +
        "REPORTS (daily or weekly): short and easy to scan: 1) Highlights, 2) Status by department, 3) Risks or blockers, 4) Decisions needed from the owner, 5) Suggested next steps. Say plainly when a department produced nothing.\n\n" +
        "DELEGATING: when the owner asks you to get something done, write a short plain-language plan first (who does what and why). Then, ONLY if there is real work to assign, end your reply with exactly one fenced json block in this form:\n" +
        "```json\n{\"assignments\": [{\"agent\": \"" + (team[0] ? team[0].id : "agent-id") + "\", \"task\": \"full task text\"}]}\n```\n" +
        "Rules: use only the agent ids listed above. Each task must be fully self-contained, because agents do not share memory or see each other's work; include every fact they need (goals, tone, what to deliver). All assignments start at the same time, so only include tasks that do not depend on another agent's output; describe later follow-up steps in the plan instead. Do not include the block for reports, questions or advice. The owner approves your assignments before anyone starts."
      );
    }
    if (agent.design) {
      parts.push(
        "CREATING IMAGES: when the owner asks for an example design, a mockup or images, write your normal reply (briefly describe each concept and why), then END your reply with exactly one fenced json block and nothing after it:\n" +
        "```json\n{\"images\": [{\"prompt\": \"detailed description: subject, style, colours, composition, lighting, any text to show\", \"aspect\": \"1:1\"}]}\n```\n" +
        "Aspect options: 1:1, 4:5, 9:16, 16:9. Ask for 1 to 3 images per reply (each one costs money, so only what is useful). The app makes the images and shows them to the owner; do not claim they exist before then, and do not add the block when no image was requested."
      );
    }
    return parts.join("\n\n");
  };

  const URL_RE = /https?:\/\/[^\s)>\]]+/i;
  A.hasUrl = (t) => URL_RE.test(t || "");

  A.buildPrompt = function (agent, task) {
    const now = new Date();
    let p = String(task || "");
    p += `\n\n(Today is ${now.toLocaleDateString(undefined, { weekday: "long", day: "numeric", month: "long", year: "numeric" })}, local time ${now.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}.)`;
    if (A.hasUrl(task)) p += "\n(The message contains a link. Use it only if you can open it with your search tools; otherwise say plainly that you could not open it and ask the owner to paste the text.)";
    if (agent.manager && AT.reports) p += "\n\n" + AT.reports.recentText();
    if (AT.images) { const lib = AT.images.libraryText(); if (lib) p += "\n\n" + lib; }
    return p;
  };

  /* ---------- reading the structured blocks agents may end a reply with ---------- */
  function takeJsonBlock(text) {
    const m = /```json\s*(\{[\s\S]*?\})\s*```/i.exec(text || "");
    if (!m) return null;
    let data; try { data = JSON.parse(m[1]); } catch (e) { return null; }
    return { data, clean: (text.slice(0, m.index) + text.slice(m.index + m[0].length)).trim() };
  }
  A.extractPlan = function (text, managerId) {
    const b = takeJsonBlock(text);
    if (!b || !b.data || !Array.isArray(b.data.assignments)) return { text, plan: [] };
    const ids = new Set(A.list().filter((a) => a.id !== managerId).map((a) => a.id));
    const plan = [];
    b.data.assignments.forEach((x) => {
      const agent = String((x && x.agent) || "").toLowerCase().trim(), task = String((x && x.task) || "").trim();
      if (ids.has(agent) && task) plan.push({ agent, task });
    });
    return { text: b.clean, plan };
  };
  const ASPECTS = new Set(["1:1", "4:5", "5:4", "9:16", "16:9", "3:4", "4:3", "2:3", "3:2"]);
  A.extractImages = function (text, max) {
    const b = takeJsonBlock(text);
    if (!b || !b.data || !Array.isArray(b.data.images)) return { text, requests: [] };
    const requests = [];
    b.data.images.forEach((r) => {
      const prompt = String((r && r.prompt) || "").trim(), aspect = String((r && r.aspect) || "1:1").trim();
      if (prompt) requests.push({ prompt: prompt.slice(0, 2000), aspect: ASPECTS.has(aspect) ? aspect : "1:1" });
    });
    return { text: b.clean, requests: requests.slice(0, max || 3) };
  };

  AT.agents = A;
})(typeof window !== "undefined" ? window : globalThis);
