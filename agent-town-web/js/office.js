/* Agent Town (web edition) - the office: brand name, logo, fonts, textures and
 * where the desks and furniture are. Stored in the user's browser. */
(function (g) {
  "use strict";
  const AT = (g.AT = g.AT || {});
  const O = {};
  O.GRID_W = 14; O.GRID_H = 11;

  O.FONTS = {
    georgia: "Georgia Italic (classic, default)",
    playfair: "Playfair Display (elegant serif)",
    cormorant: "Cormorant Garamond (refined serif)",
    poppins: "Poppins (modern, geometric)",
    montserrat: "Montserrat (clean, wide)",
    bebas: "Bebas Neue (bold condensed)",
    pacifico: "Pacifico (playful script)",
  };

  const FURN = { sofa: { w: 3, d: 1 }, table: { w: 2, d: 1 }, shelf: { w: 3, d: 1 }, counter: { w: 2, d: 1 }, cooler: { w: 1, d: 1 }, showcase: { w: 2, d: 1 } };
  const FURN_DEFAULT = {
    sofa: { x: 4, y: 1 }, table: { x: 5, y: 3 }, shelf: { x: 9, y: 0 }, counter: { x: 12, y: 1 }, cooler: { x: 13, y: 3 }, showcase: { x: 6, y: 9 },
  };
  const PLANTS_DEFAULT = [[1, 1], [13, 5], [0, 10]];
  // The owner's own desk (drawn by the office, not movable): cells (2..4, 2) and its chair at (3, 1).
  const OWNER_CELLS = ["2,2", "3,2", "4,2", "3,1"];
  // Ready-made desk positions, in the order new agents get them. (8,3) is kept for the team manager.
  O.DESK_SLOTS = [[2, 6], [7, 6], [11, 6], [2, 9], [11, 9], [5, 8], [9, 8], [11, 4], [5, 5], [8, 3]];
  O.MANAGER_SLOT = [8, 3];

  /* ---------- ready-made office plans (the owner can still move everything afterwards) ---------- */
  O.PRESETS = {
    classic: {
      label: "Classic office", desc: "Desks around a central rug, lounge by the window.",
      manager: [8, 3], slots: [[2, 6], [7, 6], [11, 6], [2, 9], [11, 9], [5, 8], [9, 8], [11, 4], [5, 5]],
      furniture: { sofa: { x: 4, y: 1 }, table: { x: 5, y: 3 }, shelf: { x: 9, y: 0 }, counter: { x: 12, y: 1 }, cooler: { x: 13, y: 3 }, showcase: { x: 6, y: 9 } },
      plants: [[1, 1], [13, 5], [0, 10]],
    },
    open: {
      label: "Open plan", desc: "Two tidy rows of desks, lots of floor space.",
      manager: [8, 3], slots: [[2, 5], [6, 5], [10, 5], [2, 8], [6, 8], [10, 8], [11, 3]],
      furniture: { sofa: { x: 5, y: 1 }, table: { x: 0, y: 3 }, shelf: { x: 10, y: 0 }, counter: { x: 12, y: 10 }, cooler: { x: 13, y: 1 }, showcase: { x: 0, y: 10 } },
      plants: [[1, 1], [13, 7], [4, 10]],
    },
    pods: {
      label: "Team pods", desc: "Desks in side-by-side pairs, a meeting table in the middle.",
      manager: [8, 3], slots: [[2, 5], [5, 5], [9, 5], [12, 5], [2, 8], [5, 8], [9, 8], [12, 8], [11, 3]],
      furniture: { sofa: { x: 0, y: 0 }, table: { x: 6, y: 6 }, shelf: { x: 11, y: 0 }, counter: { x: 0, y: 10 }, cooler: { x: 13, y: 2 }, showcase: { x: 7, y: 10 } },
      plants: [[7, 1], [3, 10], [12, 10]],
    },
    lounge: {
      label: "Cozy lounge", desc: "Fewer desks along the walls, a big relaxed middle.",
      manager: [8, 3], slots: [[2, 6], [2, 9], [11, 6], [11, 9], [11, 4], [7, 9]],
      furniture: { sofa: { x: 4, y: 6 }, table: { x: 5, y: 8 }, shelf: { x: 0, y: 0 }, counter: { x: 12, y: 1 }, cooler: { x: 7, y: 6 }, showcase: { x: 12, y: 10 } },
      plants: [[1, 4], [9, 6], [9, 10]],
    },
  };
  O.PRESET_KEYS = Object.keys(O.PRESETS);
  const presetOf = (o) => O.PRESETS[(o && o.layout_preset)] || O.PRESETS.classic;
  const slotsOf = (P, isManager) => (isManager ? [P.manager] : []).concat(P.slots).concat(isManager ? [] : [P.manager]);

  /* ---------- look and furniture choices (what each choice looks like is drawn by the office page) ---------- */
  const opt = (key, label, swatch) => ({ key, label, swatch });
  O.STYLE_OPTIONS = {
    floor: { label: "Floor", items: [opt("wood", "Warm wood", "#c9a06a"), opt("lightwood", "Light wood", "#e0c08a"), opt("darkwood", "Dark wood", "#7e5638"), opt("tile", "Tiles", "#dedad2"), opt("carpet", "Carpet", "#7b8795"), opt("concrete", "Concrete", "#b4b4b0")] },
    wall: { label: "Walls", items: [opt("classic", "Cream & sage", "#e4dcc9"), opt("white", "Bright white", "#f2f2ee"), opt("navy", "Navy", "#46557a"), opt("terracotta", "Terracotta", "#d09478"), opt("rose", "Blush rose", "#ecc8cc"), opt("forest", "Forest green", "#9bba94"), opt("charcoal", "Charcoal", "#5c5f68"), opt("custom", "My own colour", "#d8d1c0")] },
    desk: { label: "Desks", items: [opt("wood", "Wood", "#a4714a"), opt("white", "White", "#e5e1d8"), opt("dark", "Dark", "#3f3f4a"), opt("bamboo", "Bamboo", "#c8aa6a"), opt("navy", "Navy", "#3f5a88")] },
    chair_color: { label: "Chair colour", items: [opt("team", "Team colour", "#58a6ff"), opt("black", "Black", "#2b2f3a"), opt("grey", "Grey", "#7b8392"), opt("white", "White", "#e8e6df"), opt("brown", "Brown", "#7a5230"), opt("red", "Red", "#a8433f"), opt("blue", "Blue", "#3f5f9a")] },
    chair_shape: { label: "Chair style", items: [opt("office", "Office chair", "#8a93a3"), opt("highback", "High-back", "#8a93a3"), opt("stool", "Stool", "#8a93a3")] },
    sofa: { label: "Sofa", items: [opt("blue", "Blue", "#5c6f95"), opt("grey", "Grey", "#7b8490"), opt("green", "Green", "#4f7a5e"), opt("brown", "Leather", "#8a5a3a"), opt("red", "Red", "#a24a4a"), opt("cream", "Cream", "#cfc3ac")] },
    table: { label: "Table", items: [opt("wood", "Wood", "#8a6448"), opt("white", "White", "#eeebe4"), opt("dark", "Dark", "#45454f"), opt("glass", "Glass", "#9ec7d8"), opt("marble", "Marble", "#e4e5ea")] },
    rug: { label: "Rug", items: [opt("purple", "Purple", "#5a3f6b"), opt("blue", "Blue", "#2f5083"), opt("green", "Green", "#3b6a48"), opt("red", "Red", "#7a3a42"), opt("grey", "Grey", "#5a5e68"), opt("none", "No rug", "#cdb08a")] },
    plant: { label: "Plants", items: [opt("leafy", "Leafy", "#2f9e5b"), opt("cactus", "Cactus", "#5aa06a"), opt("flowers", "Flowers", "#d86a9a")] },
  };
  O.DECOR = { art: "Framed picture", clock: "Wall clock", poster: "Motto poster", shelf: "Wall shelf" };
  O.styleDefaults = () => ({
    floor: "wood", wall: "classic", wall_color: "#d8d1c0", desk: "wood", chair_color: "team", chair_shape: "office",
    sofa: "blue", table: "wood", rug: "purple", plant: "leafy",
    decor: { art: true, clock: true, poster: true, shelf: true }, motto: "Make today count",
  });

  const IMG_PREFIX = ["data:image/png", "data:image/jpeg", "data:image/jpg", "data:image/webp", "data:image/svg+xml"];
  const FONT_PREFIX = ["data:font/", "data:application/font-woff", "data:application/x-font-ttf", "data:application/x-font-opentype", "data:application/octet-stream", "data:application/vnd.ms-fontobject"];
  const MAX_CHARS = 6000000;
  const validImg = (s) => typeof s === "string" && IMG_PREFIX.some((p) => s.startsWith(p)) && s.length <= MAX_CHARS;
  const validFont = (s) => typeof s === "string" && FONT_PREFIX.some((p) => s.startsWith(p)) && s.length <= MAX_CHARS;

  O.defaults = () => ({
    brand_name: "", layout_preset: "classic", font_key: "georgia", logo: null, wall_texture: null, floor_texture: null, custom_font: null, custom_font_name: null,
    layout: { desks: {}, furniture: AT.clone(FURN_DEFAULT), plants: AT.clone(PLANTS_DEFAULT) },
    style: O.styleDefaults(),
  });

  O.load = function () {
    let o = AT.store.get("office");
    if (!o) o = AT.store.set("office", O.defaults());
    const d = O.defaults();
    Object.keys(d).forEach((k) => { if (o[k] === undefined) o[k] = d[k]; });
    if (!o.layout) o.layout = d.layout;
    ["desks", "furniture", "plants"].forEach((k) => { if (o.layout[k] === undefined) o.layout[k] = d.layout[k]; });
    if (!o.style || typeof o.style !== "object") o.style = d.style;
    Object.keys(d.style).forEach((k) => { if (o.style[k] === undefined) o.style[k] = d.style[k]; });
    if (!o.style.decor || typeof o.style.decor !== "object") o.style.decor = d.style.decor;
    Object.keys(d.style.decor).forEach((k) => { if (o.style.decor[k] === undefined) o.style.decor[k] = d.style.decor[k]; });
    return o;
  };

  /* ---------- geometry ---------- */
  const key = (x, y) => x + "," + y;
  function cellsOf(x, y, w, d) { const c = []; for (let i = 0; i < w; i++) for (let j = 0; j < d; j++) c.push(key(x + i, y + j)); return c; }

  /** All cells taken by everything in a layout, except (optionally) one desk / furniture piece. */
  function occupied(layout, except) {
    const set = new Set(OWNER_CELLS);
    Object.entries(layout.desks).forEach(([id, p]) => {
      if (except && except.type === "desk" && except.id === id) return;
      cellsOf(p.x, p.y, 2, 1).concat([key(p.x - 1, p.y), key(p.x - 1, p.y + 1)]).forEach((c) => set.add(c));   // desk, chair, spot beside it
    });
    Object.entries(layout.furniture).forEach(([k, p]) => {
      if (except && except.type === "furniture" && except.id === k) return;
      const sz = FURN[k] || { w: 1, d: 1 };
      cellsOf(p.x, p.y, sz.w, sz.d).forEach((c) => set.add(c));
    });
    layout.plants.forEach((p, i) => { if (!(except && except.type === "plant" && except.id === i)) set.add(key(p[0], p[1])); });
    return set;
  }
  O.deskFits = function (layout, x, y, exceptId) {
    if (!Number.isInteger(x) || !Number.isInteger(y)) return false;
    if (x < 1 || x + 2 > O.GRID_W || y < 1 || y + 2 > O.GRID_H) return false;     // chair to the west, room below for visitors
    const occ = occupied(layout, { type: "desk", id: exceptId });
    const mine = cellsOf(x, y, 2, 1).concat([key(x - 1, y), key(x - 1, y + 1)]);
    return !mine.some((c) => occ.has(c));
  };

  /** Give an agent a desk: the manager prefers the manager slot, everyone else the next free slot. */
  O.assignDesk = function (agentId) {
    const o = O.load(), L = o.layout;
    if (L.desks[agentId]) return L.desks[agentId];
    const a = AT.agents && AT.agents.get(agentId);
    const slots = slotsOf(presetOf(o), !!(a && a.manager));
    for (const s of slots) {
      if (O.deskFits(L, s[0], s[1])) { L.desks[agentId] = { x: s[0], y: s[1] }; AT.store.set("office", o); return L.desks[agentId]; }
    }
    for (let y = 1; y < O.GRID_H - 1; y++) for (let x = 1; x < O.GRID_W - 1; x++) {   // anywhere that still fits
      if (O.deskFits(L, x, y)) { L.desks[agentId] = { x, y }; AT.store.set("office", o); return L.desks[agentId]; }
    }
    return null;
  };
  O.removeDesk = function (agentId) { const o = O.load(); delete o.layout.desks[agentId]; AT.store.set("office", o); };

  /** The layout the "Reset" button restores, for the agents that exist right now. */
  O.defaultLayoutFor = function (ids) {
    return O.layoutForPreset(O.load().layout_preset, ids);
  };

  /** A full layout for a plan and a list of agent ids (managers get the manager desk first). */
  O.layoutForPreset = function (key, ids) {
    const P = O.PRESETS[key] || O.PRESETS.classic;
    const L = { desks: {}, furniture: AT.clone(P.furniture), plants: AT.clone(P.plants) };
    const mgrFirst = (ids || []).slice().sort((x, y) => { const ax = AT.agents && AT.agents.get(x), ay = AT.agents && AT.agents.get(y); return (ay && ay.manager ? 1 : 0) - (ax && ax.manager ? 1 : 0); });
    mgrFirst.forEach((id) => {
      const a = AT.agents && AT.agents.get(id);
      for (const s of slotsOf(P, !!(a && a.manager))) { if (O.deskFits(L, s[0], s[1])) { L.desks[id] = { x: s[0], y: s[1] }; return; } }
      for (let y = 1; y < O.GRID_H - 1; y++) for (let x = 1; x < O.GRID_W - 1; x++) { if (O.deskFits(L, x, y)) { L.desks[id] = { x, y }; return; } }
    });
    return L;
  };

  /** Switch to one of the ready-made plans: furniture, plants and desks are laid out afresh. */
  O.applyPreset = function (key) {
    if (!O.PRESETS[key]) return { error: "Unknown office plan." };
    const o = O.load(), ids = AT.agents ? AT.agents.order() : [];
    o.layout_preset = key;
    o.layout = O.layoutForPreset(key, ids);
    AT.store.set("office", o);
    return { ok: true };
  };

  /** Called after load so every agent has a desk and no stale desk remains. */
  O.syncDesks = function () {
    const o = O.load(), ids = AT.agents ? AT.agents.list().map((a) => a.id) : [];
    Object.keys(o.layout.desks).forEach((id) => { if (!ids.includes(id)) delete o.layout.desks[id]; });
    AT.store.set("office", o);
    ids.forEach((id) => O.assignDesk(id));
  };

  /* ---------- saving ---------- */
  O.saveBranding = function (p) {
    const o = O.load();
    if (p.brand_name !== undefined) { const n = String(p.brand_name || "").trim().slice(0, 60); if (n) o.brand_name = n; }
    if (p.font_key !== undefined && (O.FONTS[p.font_key] || p.font_key === "custom")) o.font_key = p.font_key;
    ["logo", "wall_texture", "floor_texture"].forEach((f) => {
      if (p[f] === undefined) return;
      if (p[f] === "" || p[f] === null) o[f] = null; else if (validImg(p[f])) o[f] = p[f];
    });
    if (p.custom_font !== undefined) {
      if (p.custom_font === "" || p.custom_font === null) { o.custom_font = null; o.custom_font_name = null; } else if (validFont(p.custom_font)) o.custom_font = p.custom_font;
    }
    if (p.custom_font_name !== undefined && p.custom_font_name !== null) o.custom_font_name = String(p.custom_font_name).trim().slice(0, 80) || null;
    AT.store.set("office", o);
    return O.view();
  };

  /** Save look-and-furniture choices. Unknown choices are ignored. */
  O.saveStyle = function (p) {
    p = p || {};
    const o = O.load(), st = o.style;
    Object.keys(O.STYLE_OPTIONS).forEach((k) => {
      if (p[k] !== undefined && O.STYLE_OPTIONS[k].items.some((i) => i.key === p[k])) st[k] = p[k];
    });
    if (p.wall_color !== undefined && /^#[0-9a-fA-F]{6}$/.test(p.wall_color)) st.wall_color = p.wall_color;
    if (p.decor && typeof p.decor === "object") Object.keys(O.DECOR).forEach((k) => { if (p.decor[k] !== undefined) st.decor[k] = !!p.decor[k]; });
    if (p.motto !== undefined) st.motto = String(p.motto || "").trim().slice(0, 80);
    AT.store.set("office", o);
    return O.view();
  };

  /** Validate and store a layout sent from the editor. Pieces that don't fit are put back where they were. */
  O.saveLayout = function (p) {
    const o = O.load(), L = o.layout, ids = AT.agents ? AT.agents.list().map((a) => a.id) : [];
    const int = (v) => (Number.isFinite(Number(v)) && v !== null && v !== "" ? Math.round(Number(v)) : null);
    const posOf = (q, fallback) => { if (!q) return fallback; const x = int(Array.isArray(q) ? q[0] : q.x), y = int(Array.isArray(q) ? q[1] : q.y); return x === null || y === null ? fallback : { x, y }; };
    const same = (a, b) => !!a && !!b && a.x === b.x && a.y === b.y;

    const items = [];
    ids.forEach((id) => { const old = L.desks[id] || null; items.push({ type: "desk", id, old, pos: posOf(p.desks && p.desks[id], old) }); });
    Object.keys(FURN).forEach((k) => { const old = L.furniture[k] || FURN_DEFAULT[k]; items.push({ type: "furniture", id: k, old, pos: posOf(p.furniture && p.furniture[k], old) }); });
    const wantPlants = Array.isArray(p.plants) && p.plants.length ? p.plants : L.plants;
    wantPlants.forEach((q, i) => { const old = L.plants[i] ? { x: L.plants[i][0], y: L.plants[i][1] } : null; const pos = posOf(q, old); if (pos) items.push({ type: "plant", id: i, old, pos }); });

    const next = { desks: {}, furniture: {}, plants: [] };
    const view = () => ({ desks: next.desks, furniture: next.furniture, plants: next.plants.filter(Boolean) });
    const put = (it, pos) => {
      if (it.type === "desk") next.desks[it.id] = { x: pos.x, y: pos.y };
      else if (it.type === "furniture") next.furniture[it.id] = { x: pos.x, y: pos.y };
      else next.plants[it.id] = [pos.x, pos.y];
    };
    const fits = (it, pos) => {
      if (!pos) return false;
      if (it.type === "desk") return O.deskFits(view(), pos.x, pos.y, it.id);
      const sz = it.type === "plant" ? { w: 1, d: 1 } : FURN[it.id];
      if (pos.x < 0 || pos.y < 0 || pos.x + sz.w > O.GRID_W || pos.y + sz.d > O.GRID_H) return false;
      const occ = occupied(view(), it.type === "furniture" ? { type: "furniture", id: it.id } : null);
      return !cellsOf(pos.x, pos.y, sz.w, sz.d).some((c) => occ.has(c));
    };

    items.filter((it) => it.old && same(it.old, it.pos)).forEach((it) => put(it, it.pos));         // things that did not move stay put
    items.filter((it) => !(it.old && same(it.old, it.pos))).forEach((it) => {                      // moved things must fit, else go back
      if (fits(it, it.pos)) put(it, it.pos);
      else if (it.old && fits(it, it.old)) put(it, it.old);
      else if (it.type === "furniture") put(it, FURN_DEFAULT[it.id]);
    });
    next.plants = next.plants.filter(Boolean);
    if (!next.plants.length) next.plants = AT.clone(PLANTS_DEFAULT);
    o.layout = next;
    AT.store.set("office", o);
    ids.forEach((id) => { if (!next.desks[id]) O.assignDesk(id); });
    return O.load().layout;
  };

  /** What the page's drawing code reads. */
  O.view = function () {
    const o = O.load();
    const presets = {};
    O.PRESET_KEYS.forEach((k) => { const P = O.PRESETS[k]; presets[k] = { key: k, label: P.label, desc: P.desc, slots: [P.manager].concat(P.slots), furniture: AT.clone(P.furniture), plants: AT.clone(P.plants) }; });
    return Object.assign(AT.clone(o), { font_options: AT.clone(O.FONTS), default_layout: O.defaultLayoutFor(AT.agents ? AT.agents.order() : []), presets, style_options: AT.clone(O.STYLE_OPTIONS), decor_options: AT.clone(O.DECOR) });
  };

  AT.office = O;
})(typeof window !== "undefined" ? window : globalThis);
