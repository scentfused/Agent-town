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

  const IMG_PREFIX = ["data:image/png", "data:image/jpeg", "data:image/jpg", "data:image/webp", "data:image/svg+xml"];
  const FONT_PREFIX = ["data:font/", "data:application/font-woff", "data:application/x-font-ttf", "data:application/x-font-opentype", "data:application/octet-stream", "data:application/vnd.ms-fontobject"];
  const MAX_CHARS = 6000000;
  const validImg = (s) => typeof s === "string" && IMG_PREFIX.some((p) => s.startsWith(p)) && s.length <= MAX_CHARS;
  const validFont = (s) => typeof s === "string" && FONT_PREFIX.some((p) => s.startsWith(p)) && s.length <= MAX_CHARS;

  O.defaults = () => ({
    brand_name: "", font_key: "georgia", logo: null, wall_texture: null, floor_texture: null, custom_font: null, custom_font_name: null,
    layout: { desks: {}, furniture: AT.clone(FURN_DEFAULT), plants: AT.clone(PLANTS_DEFAULT) },
  });

  O.load = function () {
    let o = AT.store.get("office");
    if (!o) o = AT.store.set("office", O.defaults());
    const d = O.defaults();
    Object.keys(d).forEach((k) => { if (o[k] === undefined) o[k] = d[k]; });
    if (!o.layout) o.layout = d.layout;
    ["desks", "furniture", "plants"].forEach((k) => { if (o.layout[k] === undefined) o.layout[k] = d.layout[k]; });
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
    const slots = a && a.manager ? [O.MANAGER_SLOT].concat(O.DESK_SLOTS) : O.DESK_SLOTS;
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
    const L = { desks: {}, furniture: AT.clone(FURN_DEFAULT), plants: AT.clone(PLANTS_DEFAULT) };
    ids.forEach((id) => {
      const a = AT.agents && AT.agents.get(id);
      const slots = a && a.manager ? [O.MANAGER_SLOT].concat(O.DESK_SLOTS) : O.DESK_SLOTS;
      for (const s of slots) { if (O.deskFits(L, s[0], s[1])) { L.desks[id] = { x: s[0], y: s[1] }; break; } }
    });
    return L;
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
    return Object.assign(AT.clone(o), { font_options: AT.clone(O.FONTS), default_layout: O.defaultLayoutFor(AT.agents ? AT.agents.order() : []) });
  };

  AT.office = O;
})(typeof window !== "undefined" ? window : globalThis);
