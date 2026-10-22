// Fôlego — app de treinos com GPS em segundo plano, mapa 3D e turma de amigos.
import * as maplibregl from "./vendor/maplibre/maplibre-gl.mjs";
import { Capacitor, registerPlugin } from "./vendor/capacitor/core.mjs";

// Recursos nativos do Android (no navegador comum o app cai para as APIs da web)
const NATIVE = Capacitor.isNativePlatform();
const BG = registerPlugin("BackgroundGeolocation");
const TTS = registerPlugin("TextToSpeech");
const Notif = registerPlugin("LocalNotifications");
const Haptics = registerPlugin("Haptics");
const ShareP = registerPlugin("Share");
const FS = registerPlugin("Filesystem");
const AppP = registerPlugin("App");

const CFG = window.FOLEGO_CONFIG || {};
const MAP_STYLE = CFG.mapStyle || "https://tiles.openfreemap.org/styles/liberty";
const DEM_TILES = CFG.demTiles || "https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png";
const SB_ESM = "./vendor/supabase.mjs";

const TYPES = {
  run:  { label: "Corrida",   cls: "c-run",  rate: 10, maxSpeed: 9,  moveMin: 0.8 },
  walk: { label: "Caminhada", cls: "c-walk", rate: 6,  maxSpeed: 4,  moveMin: 0.4 },
  bike: { label: "Bike",      cls: "c-bike", rate: 3,  maxSpeed: 25, moveMin: 1.5 },
};
const CHALLENGES = [
  { type: "run",  metric: "km",  target: 3,  goal: "Corra 3 km",                 sub: "Qualquer ritmo vale. Pode ser em mais de um treino." },
  { type: "walk", metric: "min", target: 30, goal: "30 min de caminhada",        sub: "Saia na hora do almoço ou depois do trabalho." },
  { type: "bike", metric: "km",  target: 10, goal: "Pedale 10 km",               sub: "Ciclovia, estrada ou ergométrica." },
  { type: "any",  metric: "km",  target: 5,  goal: "5 km em qualquer modalidade", sub: "Some corrida, caminhada e bike do dia." },
  { type: "run",  metric: "min", target: 20, goal: "20 min correndo",            sub: "Sem parar, se der. Se não der, tudo bem também." },
  { type: "any",  metric: "min", target: 45, goal: "45 min em movimento",        sub: "Junte todos os treinos do dia." },
  { type: "walk", metric: "km",  target: 4,  goal: "Caminhe 4 km",               sub: "Chame alguém da turma para ir junto." },
  { type: "bike", metric: "min", target: 40, goal: "40 min de pedal",            sub: "Tempo em movimento sobre a bike." },
  { type: "run",  metric: "km",  target: 5,  goal: "Corra 5 km",                 sub: "O clássico. Grave e tente bater o tempo depois." },
  { type: "any",  metric: "km",  target: 8,  goal: "8 km no dia",                sub: "Desafio longo: divida em manhã e tarde." },
];
const BONUS = 20;
const COLORS = ["#BF4429", "#1D6B66", "#A87411", "#5B4FA8", "#2B7A4B", "#A8406F", "#3F6FA8"];

/* ============ utilidades ============ */
const $ = (s, el = document) => el.querySelector(s);
const pad = (n) => String(n).padStart(2, "0");
const dkey = (d) => d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate());
const parseKey = (k) => { const [y, m, d] = k.split("-").map(Number); return new Date(y, m - 1, d); };
const today = () => dkey(new Date());
const dayOfYear = (k) => { const d = parseKey(k); return Math.round((d - new Date(d.getFullYear(), 0, 1)) / 864e5) + 1; };
const challengeFor = (k) => CHALLENGES[(parseKey(k).getFullYear() * 400 + dayOfYear(k) * 7) % CHALLENGES.length];
function weekStart(d = new Date()) { const x = new Date(d.getFullYear(), d.getMonth(), d.getDate()); x.setDate(x.getDate() - ((x.getDay() + 6) % 7)); return x; }
const fmtKm = (m) => { const k = m / 1000; return k.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }); };
function fmtTime(s) { s = Math.max(0, Math.round(s)); const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), x = s % 60; return h ? h + ":" + pad(m) + ":" + pad(x) : pad(m) + ":" + pad(x); }
function fmtDur(s) { const m = Math.round(s / 60); const h = Math.floor(m / 60); return h ? h + "h" + pad(m % 60) : m + " min"; }
function paceStr(sec, meters) { if (meters < 30 || sec <= 0) return "–"; const p = sec / (meters / 1000); if (p > 3600) return "–"; const mm = Math.floor(p / 60), ss = Math.round(p % 60); return ss === 60 ? mm + 1 + ":00" : mm + ":" + pad(ss); }
function speedStr(sec, meters) { if (sec <= 0) return "–"; return (meters / 1000 / (sec / 3600)).toLocaleString("pt-BR", { maximumFractionDigits: 1 }); }
const perf = (a) => (a.type === "bike" ? speedStr(a.duration_s, a.distance_m) + " km/h" : paceStr(a.duration_s, a.distance_m) + " /km");
const pts = (a) => Math.round((a.distance_m / 1000) * TYPES[a.type].rate);
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
function colorOf(id) { let h = 0; for (const c of String(id)) h = (h * 31 + c.charCodeAt(0)) >>> 0; return COLORS[h % COLORS.length]; }
const initials = (n) => String(n || "?").split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0].toUpperCase()).join("") || "?";
function relDate(k) { if (k === today()) return "hoje"; const y = new Date(); y.setDate(y.getDate() - 1); if (k === dkey(y)) return "ontem"; return parseKey(k).toLocaleDateString("pt-BR", { day: "2-digit", month: "short" }).replace(".", ""); }
const uid = () => (crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36) + Math.random().toString(36).slice(2));
function lsGet(k, f) { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : f; } catch { return f; } }
function lsSet(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} }
let toastT;
function toast(msg, ms = 2800) { const t = $("#toast"); t.textContent = msg; t.hidden = false; clearTimeout(toastT); toastT = setTimeout(() => (t.hidden = true), ms); }

function haversine(a, b) {
  const R = 6371008.8, r = Math.PI / 180;
  const dLat = (b[1] - a[1]) * r, dLng = (b[0] - a[0]) * r;
  const s = Math.sin(dLat / 2) ** 2 + Math.cos(a[1] * r) * Math.cos(b[1] * r) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}
// Douglas–Peucker em metros (projeção local), mantém [lng,lat,alt,t]
function simplify(pts, tol = 2.5) {
  if (pts.length < 3) return pts.slice();
  const lat0 = (pts[0][1] * Math.PI) / 180, k = 111320;
  const xy = pts.map((p) => [p[0] * k * Math.cos(lat0), p[1] * k]);
  const keep = new Uint8Array(pts.length); keep[0] = keep[pts.length - 1] = 1;
  const stack = [[0, pts.length - 1]];
  while (stack.length) {
    const [s, e] = stack.pop(); let max = 0, idx = -1;
    const [x1, y1] = xy[s], [x2, y2] = xy[e], dx = x2 - x1, dy = y2 - y1, L = dx * dx + dy * dy || 1e-9;
    for (let i = s + 1; i < e; i++) {
      const t = Math.max(0, Math.min(1, ((xy[i][0] - x1) * dx + (xy[i][1] - y1) * dy) / L));
      const d = Math.hypot(xy[i][0] - (x1 + t * dx), xy[i][1] - (y1 + t * dy));
      if (d > max) { max = d; idx = i; }
    }
    if (max > tol && idx > 0) { keep[idx] = 1; stack.push([s, idx], [idx, e]); }
  }
  return pts.filter((_, i) => keep[i]);
}

/* ============ armazenamento local (IndexedDB) ============ */
const idb = (() => {
  let dbp;
  const open = () => dbp || (dbp = new Promise((res, rej) => {
    const r = indexedDB.open("folego", 1);
    r.onupgradeneeded = () => r.result.createObjectStore("acts", { keyPath: "id" });
    r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error);
  }));
  const tx = async (mode, fn) => { const db = await open(); return new Promise((res, rej) => { const t = db.transaction("acts", mode); const st = t.objectStore("acts"); const out = fn(st); t.oncomplete = () => res(out && out.result !== undefined ? out.result : out); t.onerror = () => rej(t.error); }); };
  return {
    all: () => tx("readonly", (s) => s.getAll()),
    put: (a) => tx("readwrite", (s) => s.put(a)),
    del: (id) => tx("readwrite", (s) => s.delete(id)),
  };
})();

/* ============ estado ============ */
const S = {
  nick: lsGet("folego.nick", ""),
  group: (new URLSearchParams(location.search).get("turma") || lsGet("folego.group", "") || CFG.defaultGroup || "").trim().toLowerCase(),
  voice: lsGet("folego.voice", true),
  tab: "hoje", rankType: "all",
  mine: [],            // meus treinos (local)
  remote: null,        // treinos da turma (sem trilha)
  kudos: [],
  sb: null, myId: null, sbError: null,
};
if (S.group) lsSet("folego.group", S.group);

/* ============ turma (Supabase, opcional) ============ */
const groupEnabled = () => !!(CFG.supabaseUrl && CFG.supabaseAnonKey && S.group);
async function sbReady() {
  if (!groupEnabled()) return null;
  if (S.sb && S.myId) return S.sb;
  try {
    const { createClient } = await import(SB_ESM);
    S.sb = S.sb || createClient(CFG.supabaseUrl, CFG.supabaseAnonKey, { auth: { persistSession: true, autoRefreshToken: true, storageKey: "folego-auth" } });
    let { data: { session } } = await S.sb.auth.getSession();
    if (!session) {
      const { data, error } = await S.sb.auth.signInAnonymously();
      if (error) throw error;
      session = data.session;
    }
    S.myId = session.user.id; S.sbError = null;
    return S.sb;
  } catch (e) {
    console.warn(e); S.sbError = "Não foi possível conectar à turma agora. Confira a internet.";
    return null;
  }
}
const LIST_COLS = "id,user_id,nick,type,distance_m,duration_s,elev_gain,started_at,day,has_track,created_at";
async function loadGroup() {
  const sb = await sbReady(); if (!sb) return;
  const since = new Date(); since.setDate(since.getDate() - 35);
  const { data, error } = await sb.from("activities").select(LIST_COLS).eq("group_code", S.group).gte("day", dkey(since)).order("started_at", { ascending: false }).limit(400);
  if (error) { S.sbError = "A turma não respondeu: " + error.message; return; }
  S.remote = data || [];
  const ids = S.remote.slice(0, 100).map((a) => a.id);
  if (ids.length) {
    const { data: k } = await sb.from("kudos").select("activity_id,user_id,nick").in("activity_id", ids);
    S.kudos = k || [];
  } else S.kudos = [];
}
async function uploadAct(a) {
  const sb = await sbReady(); if (!sb) return false;
  const row = { id: a.id, group_code: S.group, nick: S.nick || "Atleta", type: a.type, distance_m: a.distance_m, duration_s: a.duration_s, elapsed_s: a.elapsed_s, elev_gain: a.elev_gain || 0, started_at: a.started_at, day: a.day, track: a.track || null, splits: a.splits || null, has_track: !!(a.track && a.track.length > 1) };
  const { error } = await sb.from("activities").upsert(row);
  if (error) { console.warn(error); return false; }
  a.synced = true; await idb.put(a); return true;
}
async function syncPending() {
  if (!groupEnabled()) return;
  const pend = S.mine.filter((a) => !a.synced);
  for (const a of pend) await uploadAct(a);
}

/* ============ cálculo ============ */
function myActs() {
  // Junta meus treinos locais com os meus remotos (caso troque de aparelho)
  const map = new Map(S.mine.map((a) => [a.id, a]));
  if (S.remote && S.myId) S.remote.filter((a) => a.user_id === S.myId).forEach((a) => { if (!map.has(a.id)) map.set(a.id, a); });
  return [...map.values()].sort((a, b) => (b.started_at || "").localeCompare(a.started_at || ""));
}
function progressOf(list, k) {
  const c = challengeFor(k);
  const done = list.filter((a) => a.day === k && (c.type === "any" || a.type === c.type)).reduce((s, a) => s + (c.metric === "km" ? a.distance_m / 1000 : a.duration_s / 60), 0);
  return { c, done, pct: Math.min(1, done / c.target), ok: done >= c.target - 1e-9 };
}
function streak(list) {
  const days = new Set(list.map((a) => a.day)); const d = new Date();
  if (!days.has(dkey(d))) d.setDate(d.getDate() - 1);
  let n = 0; while (days.has(dkey(d))) { n++; d.setDate(d.getDate() - 1); } return n;
}

/* ============ telas principais ============ */
function setTab(t) {
  if (t === "gravar") return openRec();
  S.tab = t;
  document.querySelectorAll(".tabs button[data-tab]").forEach((b) => { if (b.dataset.tab === t) b.setAttribute("aria-current", "page"); else b.removeAttribute("aria-current"); });
  document.querySelectorAll(".screen").forEach((s) => (s.hidden = s.id !== "s-" + t));
  render(); window.scrollTo(0, 0);
  if ((t === "turma" || t === "rank") && groupEnabled()) loadGroup().then(render);
}
function render() {
  $("#me-nick").textContent = S.nick || "Atleta";
  $("#me-av").textContent = initials(S.nick || "A"); $("#me-av").style.background = colorOf(S.myId || S.nick || "x");
  const el = $("#s-" + S.tab); if (!el) return;
  if (S.tab === "hoje") el.innerHTML = viewHoje();
  if (S.tab === "turma") el.innerHTML = viewTurma();
  if (S.tab === "rank") el.innerHTML = viewRank();
  if (S.tab === "eu") el.innerHTML = viewEu();
  renderResume();
}
function renderResume() {
  const slot = $("#resume-slot");
  if (REC.status === "rec" || REC.status === "paused") {
    slot.innerHTML = `<button class="resume" data-do="rec">${REC.status === "rec" ? '<span class="dot"></span>' : ""}Treino ${REC.status === "rec" ? "em andamento" : "pausado"} · ${fmtKm(REC.dist)} km · toque para abrir</button>`;
  } else slot.innerHTML = "";
}

function viewHoje() {
  const k = today(), mine = myActs(), p = progressOf(mine, k), c = p.c;
  const doneTxt = c.metric === "km" ? p.done.toLocaleString("pt-BR", { maximumFractionDigits: 2 }) : Math.round(p.done);
  const ws = weekStart(), week = mine.filter((a) => parseKey(a.day) >= ws);
  const wkM = week.reduce((s, a) => s + a.distance_m, 0), wkS = week.reduce((s, a) => s + a.duration_s, 0);
  const days = []; let max = 0;
  for (let i = 0; i < 7; i++) { const d = new Date(ws); d.setDate(ws.getDate() + i); const kk = dkey(d); const m = week.filter((a) => a.day === kk).reduce((s, a) => s + a.distance_m, 0); max = Math.max(max, m); days.push({ kk, m, l: "STQQSSD"[i] }); }
  const st = streak(mine);
  let friends = "";
  if (S.remote) {
    const others = [...new Set(S.remote.filter((a) => a.day === k && a.user_id !== S.myId).map((a) => a.user_id))].filter((u) => progressOf(S.remote.filter((a) => a.user_id === u), k).ok).length;
    if (others) friends = `<p class="rules">${others} ${others > 1 ? "pessoas da turma já fecharam" : "pessoa da turma já fechou"} o desafio hoje.</p>`;
  }
  const dateTxt = new Date().toLocaleDateString("pt-BR", { weekday: "long", day: "numeric", month: "long" });
  return `
  <div class="bib" aria-label="Desafio do dia">
    <span class="pin" style="left:8px;top:40px"></span><span class="pin" style="right:8px;top:40px"></span>
    <span class="pin" style="left:8px;bottom:8px"></span><span class="pin" style="right:8px;bottom:8px"></span>
    <div class="bib-top"><span>Desafio do dia</span><span>+${BONUS} pts</span></div>
    <div class="bib-no">Nº ${dayOfYear(k)}</div>
    <div class="bib-goal">${esc(c.goal)}</div>
    <div class="bib-sub">${esc(dateTxt)} · ${esc(c.sub)}</div>
    <div class="prog ${p.ok ? "done" : ""}"><i style="width:${Math.round(p.pct * 100)}%"></i></div>
    <div class="prog-row"><span>${doneTxt} de ${c.target} ${c.metric}</span><span>${p.ok ? "Concluído" : Math.round(p.pct * 100) + "%"}</span></div>
    ${p.ok ? '<div class="stamp">FEITO</div>' : ""}
  </div>
  <div class="row-btns">
    <button class="cta red" data-do="rec"><svg viewBox="0 0 24 24" width="20" height="20"><circle cx="12" cy="12" r="5" class="fill"/></svg>Gravar treino</button>
    <button class="btn2" data-do="manual">Lançar sem GPS</button>
  </div>
  ${friends}
  <h2>Sua semana</h2>
  <div class="stats">
    <div class="stat"><b>${fmtKm(wkM)}</b><span>km</span></div>
    <div class="stat"><b>${fmtDur(wkS)}</b><span>em movimento</span></div>
    <div class="stat"><b>${st}</b><span>${st === 1 ? "dia seguido" : "dias seguidos"}</span></div>
  </div>
  <div class="week" aria-label="Quilômetros por dia nesta semana">${days.map((d) => `<div class="day ${d.kk === k ? "today" : ""}"><i><em style="height:${max ? Math.round((d.m / max) * 100) : 0}%"></em></i>${d.l}</div>`).join("")}</div>
  <h2>Últimos treinos ${mine.length > 3 ? '<button data-do="tab" data-v="eu">Ver todos</button>' : ""}</h2>
  ${listHtml(mine.slice(0, 3), "Nenhum treino ainda. Toque em Gravar treino e saia para o primeiro.")}`;
}

function listHtml(arr, emptyMsg, social = false) {
  if (!arr.length) return `<div class="empty">${emptyMsg}</div>`;
  return '<div class="list">' + arr.map((a) => {
    const t = TYPES[a.type]; if (!t) return "";
    const own = !a.user_id || a.user_id === S.myId;
    const name = own ? S.nick || "Você" : a.nick || "Atleta";
    const kd = S.kudos.filter((x) => x.activity_id === a.id), mineK = kd.some((x) => x.user_id === S.myId);
    const hasTrack = a.has_track ?? (a.track && a.track.length > 1);
    return `<article class="act">
      <div class="av" style="background:${colorOf(a.user_id || S.myId || name)}">${esc(initials(name))}</div>
      <div class="act-head"><b>${esc(name)}</b><small>${relDate(a.day)}</small></div>
      <div class="act-title"><span class="chip ${t.cls}">${t.label}</span>${hasTrack ? '<span class="gps-tag">rota GPS</span>' : '<span class="gps-tag">lançado à mão</span>'}</div>
      <div class="nums"><div><b>${fmtKm(a.distance_m)}</b>km</div><div><b>${fmtTime(a.duration_s)}</b>tempo</div><div><b>${perf(a)}</b>${a.type === "bike" ? "média" : "ritmo"}</div><div><b>${pts(a)}</b>pts</div></div>
      <div class="act-foot">
        ${social && !own ? `<button class="kudo ${mineK ? "on" : ""}" data-do="kudo" data-id="${a.id}">${mineK ? "Aplaudido" : "Aplaudir"}${kd.length ? " · " + kd.length : ""}</button>` : kd.length ? `<span class="gps-tag">${kd.length} ${kd.length > 1 ? "aplausos" : "aplauso"}</span>` : ""}
        <button class="open" data-do="detail" data-id="${a.id}">${hasTrack ? "Ver em 3D" : "Detalhes"} →</button>
      </div>
    </article>`;
  }).join("") + "</div>";
}

function inviteLink() {
  if (NATIVE) return CFG.downloadUrl || "";
  const u = new URL(location.href); u.search = "?turma=" + encodeURIComponent(S.group); u.hash = ""; return u.toString(); }

function viewTurma() {
  if (!CFG.supabaseUrl || !CFG.supabaseAnonKey) {
    return `<h2 style="margin-top:4px">Turma</h2>
    <div class="note"><b>A turma ainda não foi ligada.</b> O app já grava e guarda seus treinos neste celular. Para ver os treinos dos amigos, preencha o arquivo <span class="code">config.js</span> com os dados do Supabase (grátis), como explica o guia que veio junto do app.</div>`;
  }
  if (!S.group) return `<h2 style="margin-top:4px">Turma</h2><div class="note">Escolha um código de turma no seu perfil para entrar.</div>`;
  const head = `<h2 style="margin-top:4px">Turma <span class="code">${esc(S.group)}</span><button data-do="invite">Convidar</button></h2>`;
  if (S.sbError) return head + `<div class="note">${esc(S.sbError)}</div><div class="row-btns"><button class="btn2" data-do="reload">Tentar de novo</button></div>`;
  if (!S.remote) return head + `<div class="empty">Carregando os treinos da turma…</div>`;
  return head + listHtml(S.remote.slice(0, 80), "Ninguém da turma registrou treino ainda. Saia na frente.", true);
}

function viewRank() {
  const ws = weekStart(), src = S.remote || myActs().map((a) => ({ ...a, user_id: a.user_id || S.myId || "me", nick: S.nick }));
  const week = src.filter((a) => parseKey(a.day) >= ws && (S.rankType === "all" || a.type === S.rankType));
  const by = {};
  week.forEach((a) => { const r = by[a.user_id] || (by[a.user_id] = { id: a.user_id, nick: a.nick, pts: 0, m: 0, n: 0, days: new Set() }); r.pts += pts(a); r.m += a.distance_m; r.n++; r.days.add(a.day); });
  if (S.rankType === "all") Object.values(by).forEach((r) => r.days.forEach((d) => { if (progressOf(src.filter((a) => a.user_id === r.id), d).ok) r.pts += BONUS; }));
  const rows = Object.values(by).sort((a, b) => b.pts - a.pts || b.m - a.m);
  const end = new Date(ws); end.setDate(ws.getDate() + 6);
  const f = (d) => d.toLocaleDateString("pt-BR", { day: "numeric", month: "short" }).replace(".", "");
  const segs = [["all", "Geral"], ["run", "Corrida"], ["walk", "Caminhada"], ["bike", "Bike"]];
  const isMe = (r) => r.id === S.myId || r.id === "me";
  return `<h2 style="margin-top:4px">Semana de ${f(ws)} a ${f(end)}</h2>
  ${S.remote ? "" : '<p class="lead">Mostrando só os seus treinos. Com a turma ligada, aparece todo mundo.</p>'}
  <div class="seg">${segs.map(([v, l]) => `<button data-do="rank" data-v="${v}" aria-pressed="${S.rankType === v}">${l}</button>`).join("")}</div>
  ${rows.length ? `<div class="rank">${rows.map((r, i) => `<div class="rrow ${i === 0 ? "p1" : ""} ${isMe(r) ? "me" : ""}">
    <div class="pos">${i + 1}</div>
    <div class="nm"><b>${esc(isMe(r) ? (S.nick || "Você") + " (você)" : r.nick || "Atleta")}</b><small>${fmtKm(r.m)} km · ${r.n} ${r.n > 1 ? "treinos" : "treino"}</small></div>
    <div class="pts">${r.pts}<small>pts</small></div></div>`).join("")}</div>` : '<div class="empty">Nenhum treino nesta semana ainda. O ranking zera toda segunda-feira.</div>'}
  <p class="rules">Pontos: corrida 10 por km, caminhada 6 por km, bike 3 por km. Cada desafio do dia concluído vale +${BONUS} no ranking geral.</p>`;
}

function viewEu() {
  const mine = myActs(), tot = mine.reduce((s, a) => s + a.distance_m, 0);
  const best5 = mine.filter((a) => a.type === "run" && a.distance_m >= 5000).map((a) => a.duration_s * (5000 / a.distance_m)).sort((a, b) => a - b)[0];
  return `<h2 style="margin-top:4px">Seus números</h2>
  <div class="stats">
    <div class="stat"><b>${mine.length}</b><span>treinos</span></div>
    <div class="stat"><b>${fmtKm(tot)}</b><span>km no total</span></div>
    <div class="stat"><b>${best5 ? fmtTime(best5) : "–"}</b><span>melhor 5 km</span></div>
  </div>
  <h2>Todos os treinos</h2>
  ${listHtml(mine, "Nenhum treino ainda.")}`;
}

/* ============ mapa 3D ============ */
function makeMap(container, { center = [-46.6333, -23.5505], zoom = 15, pitch = 60, interactive = true } = {}) {
  const map = new maplibregl.Map({ container, style: MAP_STYLE, center, zoom, pitch, maxPitch: 80, interactive, attributionControl: { compact: true }, fadeDuration: 0 });
  map.on("load", () => add3D(map));
  return map;
}
function add3D(map) {
  try {
    const src = { type: "raster-dem", tiles: [DEM_TILES], tileSize: 256, maxzoom: 15, encoding: "terrarium", attribution: "Relevo: AWS Terrain Tiles" };
    if (!map.getSource("dem")) map.addSource("dem", src);
    if (!map.getSource("dem-hs")) map.addSource("dem-hs", src);
    const firstSymbol = (map.getStyle().layers || []).find((l) => l.type === "symbol")?.id;
    if (!map.getLayer("hills")) map.addLayer({ id: "hills", type: "hillshade", source: "dem-hs", paint: { "hillshade-exaggeration": 0.35, "hillshade-shadow-color": "#3d3526" } }, firstSymbol);
    map.setTerrain({ source: "dem", exaggeration: 1.4 });
  } catch (e) { console.warn("relevo", e); }
  try { map.setSky({ "sky-color": "#9ec5e8", "horizon-color": "#f3e9dc", "fog-color": "#f3e9dc", "sky-horizon-blend": 0.6, "horizon-fog-blend": 0.6, "fog-ground-blend": 0.4 }); } catch {}
}
function setRoute(map, coords, id = "route", color = "#BF4429") {
  if (!map) return;
  try { setRouteRaw(map, coords, id, color); } catch (e) { /* estilo ainda carregando: desenha no evento load */ }
}
function setRouteRaw(map, coords, id, color) {
  const data = { type: "Feature", properties: {}, geometry: { type: "LineString", coordinates: coords.length > 1 ? coords : [] } };
  const s = map.getSource(id);
  if (s) { s.setData(data); return; }
  map.addSource(id, { type: "geojson", data });
  map.addLayer({ id: id + "-case", type: "line", source: id, layout: { "line-cap": "round", "line-join": "round" }, paint: { "line-color": "#ffffff", "line-width": 9, "line-opacity": 0.9 } });
  map.addLayer({ id, type: "line", source: id, layout: { "line-cap": "round", "line-join": "round" }, paint: { "line-color": color, "line-width": 5 } });
}
function setEnds(map, a, b) { try { setEndsRaw(map, a, b); } catch {} }
function setEndsRaw(map, a, b) {
  const data = { type: "FeatureCollection", features: [a && { type: "Feature", properties: { k: "s" }, geometry: { type: "Point", coordinates: a } }, b && { type: "Feature", properties: { k: "e" }, geometry: { type: "Point", coordinates: b } }].filter(Boolean) };
  if (map.getSource("ends")) return map.getSource("ends").setData(data);
  map.addSource("ends", { type: "geojson", data });
  map.addLayer({ id: "ends", type: "circle", source: "ends", paint: { "circle-radius": 7, "circle-color": ["match", ["get", "k"], "s", "#2B7A4B", "#1B1E1C"], "circle-stroke-color": "#fff", "circle-stroke-width": 3 } });
}
function boundsOf(coords) { const b = new maplibregl.LngLatBounds(coords[0], coords[0]); coords.forEach((c) => b.extend(c)); return b; }

/* ============ gravação com GPS ============ */
const REC = Object.assign({ status: "idle", type: "run", pts: [], dist: 0, moving: 0, elevGain: 0, elevRef: null, start: null, pausedAt: null, pausedTotal: 0, splits: [], lastFix: null, follow: true }, lsGet("folego.rec", {}));
if (REC.status === "rec") REC.status = "paused", REC.pausedAt = REC.pausedAt || Date.now(); // recuperado após fechar a página
let recMap = null, meMarker = null, watchId = null, wake = null, tick = null, saveN = 0;

function persistRec() { const { lastFix, ...rest } = REC; lsSet("folego.rec", rest); }
function clearRec() { Object.assign(REC, { status: "idle", pts: [], dist: 0, moving: 0, elevGain: 0, elevRef: null, start: null, pausedAt: null, pausedTotal: 0, splits: [] }); try { localStorage.removeItem("folego.rec"); } catch {} }
const elapsed = () => (REC.start ? (REC.pausedAt || Date.now()) - REC.start - REC.pausedTotal : 0);

async function holdWake(on) {
  if (NATIVE) return; // no app nativo o GPS segue com a tela apagada
  try {
    if (on && !wake && navigator.wakeLock) { wake = await navigator.wakeLock.request("screen"); wake.addEventListener("release", () => (wake = null)); }
    else if (!on && wake) { await wake.release(); wake = null; }
  } catch {}
}
document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible" && REC.status === "rec") holdWake(true); });

function say(text) {
  if (!S.voice) return;
  if (NATIVE) { TTS.speak({ text, lang: "pt-BR", rate: 1.0, category: "playback" }).catch(() => {}); return; }
  if (!("speechSynthesis" in window)) return;
  try { const u = new SpeechSynthesisUtterance(text); u.lang = "pt-BR"; u.rate = 1.05; speechSynthesis.cancel(); speechSynthesis.speak(u); } catch {}
}

function openRec() {
  $("#rec").hidden = false; document.body.style.overflow = "hidden";
  paintRecTypes(); paintRecCtrl(); paintRecStats();
  const last = REC.pts[REC.pts.length - 1];
  if (!recMap) {
    recMap = makeMap($("#rec-map"), { center: last ? [last[0], last[1]] : lsGet("folego.lastpos", [-46.6333, -23.5505]), zoom: 16, pitch: 55 });
    recMap.on("load", () => { setRoute(recMap, REC.pts.map((p) => [p[0], p[1]])); });
    recMap.on("dragstart", () => (REC.follow = false));
    const el = document.createElement("div"); el.className = "me-dot";
    meMarker = new maplibregl.Marker({ element: el });
  }
  setTimeout(() => recMap.resize(), 50);
  startWatch();
  const ph = $(".rec-panel").offsetHeight; $("#rec").style.setProperty("--panel-h", ph + 8 + "px");
}
function closeRec() {
  $("#rec").hidden = true; document.body.style.overflow = "";
  if (REC.status === "idle") stopWatch();
  render();
}
let watchBg = false;
async function startWatch() {
  // No Android, durante o treino o GPS roda num serviço com notificação fixa e continua com a tela apagada
  const wantBg = REC.status === "rec" || REC.status === "paused";
  if (NATIVE) {
    if (watchId != null && watchBg === wantBg) return;
    if (watchId != null) await stopWatch();
    if (wantBg) { try { const p = await Notif.checkPermissions(); if (p.display !== "granted") await Notif.requestPermissions(); } catch {} }
    gpsMsg("", "Procurando sinal de GPS…");
    const opts = { requestPermissions: true, stale: false, distanceFilter: 0 };
    if (wantBg) Object.assign(opts, { backgroundTitle: "Fôlego está gravando seu treino", backgroundMessage: "Toque para abrir. Pode bloquear a tela." });
    watchBg = wantBg;
    watchId = await BG.addWatcher(opts, (loc, err) => {
      if (err) return onNativeErr(err);
      if (loc) onFix({ coords: { latitude: loc.latitude, longitude: loc.longitude, altitude: loc.altitude, accuracy: loc.accuracy, heading: loc.bearing, speed: loc.speed }, timestamp: loc.time });
    });
    return;
  }
  if (watchId != null) return;
  if (!("geolocation" in navigator)) { gpsMsg("bad", "Este navegador não tem GPS disponível."); return; }
  gpsMsg("", "Procurando sinal de GPS…");
  watchId = navigator.geolocation.watchPosition(onFix, onGpsErr, { enableHighAccuracy: true, maximumAge: 0, timeout: 20000 });
}
async function stopWatch() {
  if (watchId == null) return;
  const id = watchId; watchId = null;
  if (NATIVE) { try { await BG.removeWatcher({ id }); } catch {} }
  else navigator.geolocation.clearWatch(id);
}
function onNativeErr(err) {
  if (err.code === "NOT_AUTHORIZED") {
    gpsMsg("bad", "Localização bloqueada. Toque aqui para liberar.");
    $("#gps").onclick = () => BG.openSettings();
    watchId = null;
  } else gpsMsg("bad", "Sem sinal de GPS no momento.");
}
function onGpsErr(e) {
  if (e.code === 1) gpsMsg("bad", "GPS bloqueado. Libere a localização para este site nas configurações do navegador.");
  else if (e.code === 3) gpsMsg("fair", "GPS demorando. Vá para um lugar aberto.");
  else gpsMsg("bad", "Sem sinal de GPS no momento.");
}
function gpsMsg(cls, text) { const g = $("#gps"); g.className = "gps " + cls; g.querySelector("span").textContent = text; }

function onFix(pos) {
  const c = pos.coords, now = pos.timestamp || Date.now();
  const p = [+c.longitude.toFixed(6), +c.latitude.toFixed(6), c.altitude != null ? Math.round(c.altitude * 10) / 10 : null, now, Math.round(c.accuracy)];
  REC.lastFix = p; lsSet("folego.lastpos", [p[0], p[1]]);
  const acc = c.accuracy;
  gpsMsg(acc <= 12 ? "good" : acc <= 30 ? "fair" : "bad", acc <= 12 ? `GPS ótimo · ±${Math.round(acc)} m` : acc <= 30 ? `GPS razoável · ±${Math.round(acc)} m` : `GPS fraco · ±${Math.round(acc)} m`);
  if (recMap) {
    meMarker.setLngLat([p[0], p[1]]).addTo(recMap);
    if (REC.follow) {
      const opts = { center: [p[0], p[1]], duration: 800 };
      if (REC.status === "rec" && c.heading != null && !isNaN(c.heading) && (c.speed || 0) > 1) opts.bearing = c.heading;
      recMap.easeTo(opts);
    }
  }
  if (REC.status !== "rec") return;
  if (acc > 35) return; // ponto ruim demais para contar
  const last = REC.pts[REC.pts.length - 1];
  if (!last) { REC.pts.push(p); if (p[2] != null) REC.elevRef = p[2]; persistRec(); return; }
  const d = haversine(last, p), dt = (p[3] - last[3]) / 1000;
  if (dt <= 0) return;
  if (d < Math.max(4, acc * 0.4)) return; // parado ou ruído
  if (d / dt > TYPES[REC.type].maxSpeed && dt < 60) return; // salto do GPS
  REC.pts.push(p);
  const prevKm = Math.floor(REC.dist / 1000);
  REC.dist += d;
  if (d / dt >= TYPES[REC.type].moveMin && dt < 30) REC.moving += dt;
  else REC.moving += Math.min(dt, d / TYPES[REC.type].moveMin); // trecho lento: conta só o tempo plausível
  if (p[2] != null && acc <= 20) {
    if (REC.elevRef == null) REC.elevRef = p[2];
    else if (p[2] - REC.elevRef > 4) { REC.elevGain += p[2] - REC.elevRef; REC.elevRef = p[2]; }
    else if (REC.elevRef - p[2] > 4) REC.elevRef = p[2];
  }
  const km = Math.floor(REC.dist / 1000);
  if (km > prevKm) {
    const prevT = REC.splits.reduce((s, x) => s + x, 0);
    const split = REC.moving - prevT; REC.splits.push(Math.round(split));
    if (NATIVE) Haptics.vibrate({ duration: 400 }).catch(() => {});
    else try { navigator.vibrate && navigator.vibrate([200, 100, 200]); } catch {}
    const ps = paceStr(split, 1000).split(":");
    say(REC.type === "bike" ? `${km} quilômetros. Média ${speedStr(REC.moving, REC.dist)} quilômetros por hora.` : `${km} ${km > 1 ? "quilômetros" : "quilômetro"}. Último quilômetro em ${+ps[0]} minutos e ${+ps[1]} segundos.`);
  }
  if (recMap && recMap.isStyleLoaded()) setRoute(recMap, REC.pts.map((q) => [q[0], q[1]]));
  if (NATIVE || ++saveN % 3 === 0) persistRec();
  paintRecStats();
}

function paintRecTypes() {
  const box = $("#rec-types"); box.classList.toggle("locked", REC.status !== "idle");
  box.querySelectorAll("button").forEach((b) => b.setAttribute("aria-pressed", b.dataset.t === REC.type));
  $("#r-pace-l").textContent = REC.type === "bike" ? "km/h" : "ritmo /km";
}
function paintRecStats() {
  $("#r-dist").textContent = fmtKm(REC.dist);
  $("#r-time").textContent = fmtTime(REC.status === "idle" ? 0 : REC.moving + (REC.status === "rec" && REC.pts.length ? Math.min(30, (Date.now() - REC.pts[REC.pts.length - 1][3]) / 1000) : 0));
  $("#r-pace").textContent = REC.type === "bike" ? speedStr(REC.moving, REC.dist) : paceStr(REC.moving, REC.dist);
  $("#r-elev").textContent = Math.round(REC.elevGain);
}
let confirmStop = false;
function paintRecCtrl() {
  const c = $("#rec-ctrl");
  if (REC.status === "idle") c.innerHTML = `<button class="go" data-r="start">Começar</button>`;
  else if (REC.status === "rec") c.innerHTML = `<button class="pause" data-r="pause">Pausar</button>`;
  else if (confirmStop) c.innerHTML = `<button class="stop" data-r="keep">Continuar</button><button class="warn" data-r="${REC.dist < 50 ? "discard" : "finish"}">${REC.dist < 50 ? "Descartar" : "Salvar treino"}</button>`;
  else c.innerHTML = `<button class="go" data-r="resume">Continuar</button><button class="stop" data-r="ask">Terminar</button>`;
  $("#rec-hint").textContent = REC.status === "paused" && confirmStop && REC.dist < 50 ? "Menos de 50 metros gravados. Esse treino não será salvo."
    : NATIVE ? "Pode bloquear a tela e guardar o celular. Enquanto o treino estiver ativo, o Fôlego mostra uma notificação e segue gravando."
    : "Deixe a tela ligada durante o treino. Com a tela apagada, o celular pode parar de mandar o GPS para o navegador.";
}
function recAction(a) {
  if (a === "start") {
    if (!REC.lastFix) { toast("Aguarde o sinal do GPS aparecer no topo da tela."); return; }
    Object.assign(REC, { status: "rec", start: Date.now(), pts: [], dist: 0, moving: 0, elevGain: 0, splits: [], pausedTotal: 0, pausedAt: null, follow: true });
    if (REC.lastFix[4] <= 35) { REC.pts.push(REC.lastFix); REC.elevRef = REC.lastFix[2]; }
    holdWake(true); say("Treino iniciado. Bom treino!");
    try { recMap.easeTo({ pitch: 60, zoom: 16.5, duration: 800 }); } catch {}
  } else if (a === "pause") { REC.status = "paused"; REC.pausedAt = Date.now(); confirmStop = false; say("Pausado."); }
  else if (a === "resume" || a === "keep") {
    if (REC.pausedAt) REC.pausedTotal += Date.now() - REC.pausedAt;
    REC.pausedAt = null; REC.status = "rec"; confirmStop = false; holdWake(true);
    // não liga o último ponto ao primeiro após a pausa como se fosse corrida
    const last = REC.pts[REC.pts.length - 1]; if (last) last[3] = Date.now();
    if (a === "resume") say("Continuando.");
  } else if (a === "ask") { confirmStop = true; }
  else if (a === "discard") { confirmStop = false; clearRec(); holdWake(false); setRoute(recMap, []); toast("Treino descartado"); }
  else if (a === "finish") { confirmStop = false; finishRec(); return; }
  persistRec(); paintRecTypes(); paintRecCtrl(); paintRecStats(); renderResume();
  if (NATIVE) { if (REC.status === "idle" && $("#rec").hidden) stopWatch(); else startWatch(); }
}
async function finishRec() {
  const startT = REC.pts[0] ? REC.pts[0][3] : REC.start;
  const simp = simplify(REC.pts, 2.5).map((p) => [p[0], p[1], p[2], Math.round((p[3] - startT) / 1000)]);
  const a = {
    id: uid(), type: REC.type, distance_m: Math.round(REC.dist), duration_s: Math.round(REC.moving), elapsed_s: Math.round(elapsed() / 1000),
    elev_gain: Math.round(REC.elevGain), started_at: new Date(REC.start).toISOString(), day: dkey(new Date(REC.start)),
    track: simp, splits: REC.splits.slice(), synced: false,
  };
  const before = progressOf(myActs(), a.day).ok;
  await idb.put(a); S.mine.push(a);
  clearRec(); holdWake(false); stopWatch();
  if (recMap) setRoute(recMap, []);
  $("#rec").hidden = true; document.body.style.overflow = "";
  say(`Treino salvo. ${(a.distance_m / 1000).toLocaleString("pt-BR", { maximumFractionDigits: 2 })} quilômetros.`);
  const ok = progressOf(myActs(), a.day).ok && !before && a.day === today();
  toast(ok ? `Desafio do dia concluído! +${BONUS} pts` : `Treino salvo · ${pts(a)} pts`);
  S.tab = "hoje"; setTab("hoje");
  openDetail(a.id);
  if (groupEnabled()) uploadAct(a).then((r) => { if (!r) toast("Salvo no celular. Vai para a turma quando a internet voltar."); else loadGroup().then(render); });
}

setInterval(() => { if (REC.status === "rec" && !$("#rec").hidden) paintRecStats(); if (REC.status === "rec") renderResume(); }, 1000);

/* ============ detalhe e voo 3D ============ */
let dMap = null, flyRAF = null, current = null;
async function findAct(id) {
  let a = S.mine.find((x) => x.id === id) || (S.remote || []).find((x) => x.id === id);
  if (a && a.has_track && !a.track && S.sb) {
    const { data } = await S.sb.from("activities").select("track,splits").eq("id", id).single();
    if (data) a = { ...a, ...data };
  }
  return a;
}
async function openDetail(id) {
  const a = await findAct(id); if (!a) return;
  current = a;
  const el = $("#detail"); el.hidden = false; el.scrollTop = 0; document.body.style.overflow = "hidden";
  const own = !a.user_id || a.user_id === S.myId;
  const coords = (a.track || []).map((p) => [p[0], p[1]]);
  $("#d-fly").hidden = coords.length < 2;
  $(".detail-map-wrap").hidden = coords.length < 2;
  const when = new Date(a.started_at || parseKey(a.day));
  const splits = a.splits || [];
  const best = splits.length ? Math.min(...splits) : 0, worst = splits.length ? Math.max(...splits) : 1;
  $("#detail-body").innerHTML = `
    <span class="chip ${TYPES[a.type].cls}">${TYPES[a.type].label}</span>
    <div class="d-title">${esc(own ? S.nick || "Você" : a.nick || "Atleta")} · ${fmtKm(a.distance_m)} km</div>
    <div class="d-meta">${when.toLocaleDateString("pt-BR", { weekday: "long", day: "numeric", month: "long" })}${a.started_at ? " às " + when.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" }) : ""}</div>
    <div class="grid4">
      <div class="stat"><b>${fmtTime(a.duration_s)}</b><span>tempo em movimento</span></div>
      <div class="stat"><b>${perf(a)}</b><span>${a.type === "bike" ? "velocidade média" : "ritmo médio"}</span></div>
      <div class="stat"><b>${Math.round(a.elev_gain || 0)} m</b><span>subida acumulada</span></div>
      <div class="stat"><b>${pts(a)}</b><span>pontos</span></div>
    </div>
    ${coords.length > 1 && (a.track || []).some((p) => p[2] != null) ? `<h2>Altimetria</h2><canvas class="chart" id="elev-chart"></canvas>` : ""}
    ${splits.length ? `<h2>Parciais por km</h2><div style="overflow-x:auto"><table class="splits"><thead><tr><th>Km</th><th>${a.type === "bike" ? "km/h" : "Ritmo"}</th><th style="width:45%"></th></tr></thead><tbody>
      ${splits.map((s, i) => `<tr><td>${i + 1}</td><td class="${s === best && splits.length > 1 ? "best" : ""}">${a.type === "bike" ? speedStr(s, 1000) : paceStr(s, 1000)}</td><td><span class="bar" style="width:${Math.round(35 + 65 * (1 - (s - best) / Math.max(1, worst - best)))}%"></span></td></tr>`).join("")}
    </tbody></table></div>` : ""}
    <div class="row-btns" style="margin-top:20px">
      <button class="btn2" data-do="share">Compartilhar</button>
      ${coords.length > 1 ? '<button class="btn2" data-do="gpx">Baixar GPX</button>' : ""}
      ${own ? '<button class="btn2" data-do="del-ask" id="del-btn">Excluir</button>' : ""}
    </div>`;
  if (coords.length > 1) {
    if (!dMap) { dMap = makeMap($("#detail-map"), { center: coords[0], zoom: 14, pitch: 55 }); }
    else dMap.resize();
    const draw = () => {
      setRoute(dMap, coords); setRoute(dMap, [], "fly", "#1B1E1C"); setEnds(dMap, coords[0], coords[coords.length - 1]);
      dMap.fitBounds(boundsOf(coords), { padding: { top: 70, bottom: 40, left: 40, right: 40 }, pitch: 55, bearing: -20, duration: 900 });
    };
    if (dMap.isStyleLoaded() && dMap.getSource("dem")) draw(); else dMap.once("load", draw);
    setTimeout(() => { dMap.resize(); }, 60);
    drawElev(a.track);
  }
}
function closeDetail() { stopFly(); $("#detail").hidden = true; document.body.style.overflow = ""; current = null; render(); }

function drawElev(track) {
  const cv = $("#elev-chart"); if (!cv) return;
  const pts2 = []; let d = 0;
  for (let i = 0; i < track.length; i++) { if (i) d += haversine(track[i - 1], track[i]); if (track[i][2] != null) pts2.push([d, track[i][2]]); }
  if (pts2.length < 2) { cv.remove(); return; }
  const dpr = window.devicePixelRatio || 1, W = cv.clientWidth, H = cv.clientHeight;
  cv.width = W * dpr; cv.height = H * dpr; const g = cv.getContext("2d"); g.scale(dpr, dpr);
  const css = getComputedStyle(document.documentElement);
  const ink = css.getPropertyValue("--muted").trim(), line = css.getPropertyValue("--line").trim(), acc = css.getPropertyValue("--tartan").trim();
  const minE = Math.min(...pts2.map((p) => p[1])), maxE = Math.max(...pts2.map((p) => p[1])), span = Math.max(10, maxE - minE);
  const L = 40, R = 12, T = 12, B = 22, x = (v) => L + (v / d) * (W - L - R), y = (v) => T + (1 - (v - minE) / span) * (H - T - B);
  g.font = "11px Figtree, system-ui, sans-serif"; g.fillStyle = ink; g.strokeStyle = line; g.lineWidth = 1;
  [minE, minE + span / 2, minE + span].forEach((v) => { g.beginPath(); g.moveTo(L, y(v)); g.lineTo(W - R, y(v)); g.stroke(); g.fillText(Math.round(v) + " m", 4, y(v) + 4); });
  g.fillText("0 km", L, H - 6); const endTxt = (d / 1000).toLocaleString("pt-BR", { maximumFractionDigits: 1 }) + " km"; g.fillText(endTxt, W - R - g.measureText(endTxt).width, H - 6);
  g.beginPath(); g.moveTo(x(pts2[0][0]), y(pts2[0][1])); pts2.forEach((p) => g.lineTo(x(p[0]), y(p[1])));
  g.strokeStyle = acc; g.lineWidth = 2; g.stroke();
  g.lineTo(x(pts2[pts2.length - 1][0]), H - B); g.lineTo(x(pts2[0][0]), H - B); g.closePath(); g.globalAlpha = 0.18; g.fillStyle = acc; g.fill(); g.globalAlpha = 1;
}

function bearingOf(a, b) { const r = Math.PI / 180; const y = Math.sin((b[0] - a[0]) * r) * Math.cos(b[1] * r); const x = Math.cos(a[1] * r) * Math.sin(b[1] * r) - Math.sin(a[1] * r) * Math.cos(b[1] * r) * Math.cos((b[0] - a[0]) * r); return (Math.atan2(y, x) / r + 360) % 360; }
function stopFly() { if (flyRAF) cancelAnimationFrame(flyRAF); flyRAF = null; const b = $("#d-fly"); if (b) b.textContent = "Voo 3D"; }
function fly() {
  if (flyRAF) { stopFly(); return; }
  const coords = (current?.track || []).map((p) => [p[0], p[1]]); if (coords.length < 2) return;
  const cum = [0]; for (let i = 1; i < coords.length; i++) cum.push(cum[i - 1] + haversine(coords[i - 1], coords[i]));
  const total = cum[cum.length - 1]; const dur = Math.min(40000, Math.max(12000, total * 4));
  const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const at = (dist) => { let i = cum.findIndex((c) => c >= dist); if (i <= 0) return [coords[0], 0]; const f = (dist - cum[i - 1]) / Math.max(1e-6, cum[i] - cum[i - 1]); return [[coords[i - 1][0] + (coords[i][0] - coords[i - 1][0]) * f, coords[i - 1][1] + (coords[i][1] - coords[i - 1][1]) * f], i]; };
  let t0 = null, bearing = bearingOf(coords[0], at(Math.min(total, 120))[0]);
  $("#d-fly").textContent = "Parar";
  $(".detail-map-wrap").scrollIntoView({ behavior: reduce ? "auto" : "smooth" });
  const step = (ts) => {
    if (!t0) t0 = ts; const k = Math.min(1, (ts - t0) / dur), dist = k * total;
    const [pos, i] = at(dist);
    setRoute(dMap, coords.slice(0, Math.max(1, i)).concat([pos]), "fly", "#1B1E1C");
    const ahead = at(Math.min(total, dist + 120))[0];
    const want = bearingOf(pos, ahead); let diff = ((want - bearing + 540) % 360) - 180; bearing = (bearing + diff * 0.06 + 360) % 360;
    dMap.jumpTo({ center: pos, bearing, pitch: 68, zoom: 16.2 });
    if (k < 1) flyRAF = requestAnimationFrame(step);
    else { stopFly(); dMap.fitBounds(boundsOf(coords), { padding: 50, pitch: 55, bearing: -20, duration: 1500 }); }
  };
  if (reduce) { dMap.jumpTo({ center: coords[0], pitch: 65, zoom: 16 }); }
  flyRAF = requestAnimationFrame(step);
}

function gpxOf(a) {
  const t0 = new Date(a.started_at).getTime();
  const pts3 = (a.track || []).map((p) => `<trkpt lat="${p[1]}" lon="${p[0]}">${p[2] != null ? `<ele>${p[2]}</ele>` : ""}<time>${new Date(t0 + (p[3] || 0) * 1000).toISOString()}</time></trkpt>`).join("\n");
  const kind = { run: "running", walk: "walking", bike: "cycling" }[a.type];
  return `<?xml version="1.0" encoding="UTF-8"?>\n<gpx version="1.1" creator="Fôlego" xmlns="http://www.topografix.com/GPX/1/1">\n<trk><name>${TYPES[a.type].label} ${a.day}</name><type>${kind}</type><trkseg>\n${pts3}\n</trkseg></trk></gpx>`;
}
async function downloadGpx(a) {
  const name = `folego-${a.type}-${a.day}.gpx`;
  if (NATIVE) {
    try {
      const w = await FS.writeFile({ path: name, data: gpxOf(a), directory: "CACHE", encoding: "utf8" });
      await ShareP.share({ title: "Treino em GPX", text: "Arquivo GPX do Fôlego (abre no Strava, Garmin, Komoot).", files: [w.uri], dialogTitle: "Enviar GPX" });
    } catch (e) { if (!/cancel/i.test(String(e && e.message))) toast("Não foi possível gerar o GPX."); }
    return;
  }
  const blob = new Blob([gpxOf(a)], { type: "application/gpx+xml" });
  const url = URL.createObjectURL(blob); const link = document.createElement("a");
  link.href = url; link.download = `folego-${a.type}-${a.day}.gpx`; document.body.appendChild(link); link.click(); link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}
async function shareAct(a) {
  const verb = { run: "Corri", walk: "Caminhei", bike: "Pedalei" }[a.type];
  const text = `${verb} ${fmtKm(a.distance_m)} km em ${fmtTime(a.duration_s)} (${perf(a)}) no Fôlego.` + (S.group ? " Entre na turma:" : "");
  const url = NATIVE ? CFG.downloadUrl || "" : S.group ? inviteLink() : location.origin + location.pathname;
  if (NATIVE) {
    const full = text.replace(" Entre na turma:", "") + (S.group ? ` Turma: ${S.group}.` : "") + (url ? " Baixe o app: " + url : "");
    try { await ShareP.share({ title: "Fôlego", text: full, dialogTitle: "Compartilhar treino" }); } catch {}
    return;
  }
  try {
    if (navigator.share) { await navigator.share({ title: "Fôlego", text, url }); return; }
  } catch (e) { if (e.name === "AbortError") return; }
  try { await navigator.clipboard.writeText(text + " " + url); toast("Texto copiado. Cole no WhatsApp."); } catch { toast(text + " " + url, 6000); }
}

/* ============ folhas: perfil, lançamento manual ============ */
function openSheet(html, bind) { $("#sheet").innerHTML = html; $("#sheet-bg").hidden = false; bind && bind($("#sheet")); }
function closeSheet() { $("#sheet-bg").hidden = true; $("#sheet").innerHTML = ""; }
$("#sheet-bg").addEventListener("click", (e) => { if (e.target.id === "sheet-bg" && S.nick) closeSheet(); });

function openProfile(first = false) {
  openSheet(`<h3>${first ? "Bem-vindo ao Fôlego" : "Seu perfil"}</h3>
    ${first ? '<p class="lead">Escolha como a turma vai te ver. Não precisa criar conta nem senha.</p>' : ""}
    <form id="pf" novalidate>
      <div class="field"><label for="pf-nick">Seu apelido</label><input id="pf-nick" maxlength="24" autocomplete="nickname" value="${esc(S.nick)}" placeholder="Ex.: Guga"></div>
      <div class="field"><label for="pf-group">Código da turma</label><input id="pf-group" maxlength="30" autocapitalize="none" value="${esc(S.group)}" placeholder="Ex.: corredores-da-vila"></div>
      <p class="lead" style="margin-top:-4px">Quem usar o mesmo código vê os mesmos treinos e entra no mesmo ranking.</p>
      <label class="switch"><span>Avisos por voz a cada km</span><input type="checkbox" id="pf-voice" ${S.voice ? "checked" : ""}></label>
      <div class="err" id="pf-err"></div>
      <button class="cta red" type="submit">${first ? "Começar" : "Salvar"}</button>
      ${!first && S.group ? '<button class="btn2" type="button" id="pf-invite" style="width:100%;margin-top:8px">Convidar amigos para a turma</button>' : ""}
    </form>`, (sh) => {
    $("#pf", sh).addEventListener("submit", (e) => {
      e.preventDefault();
      const nick = $("#pf-nick", sh).value.trim(), group = $("#pf-group", sh).value.trim().toLowerCase().replace(/[^a-z0-9\-_.]/g, "-").replace(/-+/g, "-");
      if (!nick) { $("#pf-err", sh).textContent = "Escreva um apelido para a turma te reconhecer."; return; }
      const changed = group !== S.group;
      S.nick = nick; S.group = group; S.voice = $("#pf-voice", sh).checked;
      lsSet("folego.nick", nick); lsSet("folego.group", group); lsSet("folego.voice", S.voice);
      if (changed) { S.remote = null; S.kudos = []; history.replaceState(null, "", group ? "?turma=" + encodeURIComponent(group) : location.pathname); }
      closeSheet(); render();
      if (groupEnabled()) { syncPending(); loadGroup().then(render); }
    });
    const inv = $("#pf-invite", sh); if (inv) inv.onclick = invite;
  });
}
async function invite() {
  if (NATIVE) {
    const dl = CFG.downloadUrl ? `\n1. Baixe e instale: ${CFG.downloadUrl}` : "\n1. Peça o arquivo do app para quem te convidou";
    const msg = `Bora treinar comigo no Fôlego?${dl}\n2. Abra o app, escolha um apelido e use o código da turma: ${S.group}`;
    try { await ShareP.share({ title: "Fôlego", text: msg, dialogTitle: "Convidar para a turma" }); } catch {}
    return;
  }
  const url = inviteLink(), text = `Bora treinar comigo no Fôlego? Entre na turma "${S.group}":`;
  try { if (navigator.share) { await navigator.share({ title: "Fôlego", text, url }); return; } } catch (e) { if (e.name === "AbortError") return; }
  try { await navigator.clipboard.writeText(text + " " + url); toast("Link de convite copiado. Cole no WhatsApp."); } catch { toast(url, 8000); }
}

function openManual() {
  let type = "run";
  openSheet(`<h3>Lançar sem GPS</h3><p class="lead">Para esteira, bike ergométrica ou quando esqueceu de gravar.</p>
    <form id="mf" novalidate>
      <div class="types" id="mf-t">${Object.entries(TYPES).map(([k, t]) => `<button type="button" data-t="${k}" aria-pressed="${k === type}">${t.label}</button>`).join("")}</div>
      <div class="field"><label for="mf-km">Distância (km)</label><input id="mf-km" inputmode="decimal" placeholder="Ex.: 5,2"></div>
      <div class="two"><div class="field"><label for="mf-h">Horas</label><input id="mf-h" inputmode="numeric" placeholder="0"></div><div class="field"><label for="mf-m">Minutos</label><input id="mf-m" inputmode="numeric" placeholder="32"></div></div>
      <div class="field"><label for="mf-d">Data</label><input id="mf-d" type="date" value="${today()}" max="${today()}"></div>
      <div class="err" id="mf-err"></div>
      <div class="row-btns"><button class="btn2" type="button" id="mf-cancel">Cancelar</button><button class="cta red" type="submit">Salvar</button></div>
    </form>`, (sh) => {
    sh.querySelectorAll("#mf-t button").forEach((b) => (b.onclick = () => { type = b.dataset.t; sh.querySelectorAll("#mf-t button").forEach((x) => x.setAttribute("aria-pressed", x === b)); }));
    $("#mf-cancel", sh).onclick = closeSheet;
    $("#mf", sh).addEventListener("submit", async (e) => {
      e.preventDefault();
      const km = parseFloat(($("#mf-km", sh).value || "").replace(",", ".")), min = (parseInt($("#mf-h", sh).value) || 0) * 60 + (parseInt($("#mf-m", sh).value) || 0);
      const err = $("#mf-err", sh), day = $("#mf-d", sh).value || today();
      if (!(km > 0) || km > 400) return (err.textContent = "Informe a distância em km, por exemplo 5,2.");
      if (!(min > 0) || min > 1440) return (err.textContent = "Informe o tempo em horas e minutos.");
      if (day > today()) return (err.textContent = "A data não pode ser no futuro.");
      const a = { id: uid(), type, distance_m: Math.round(km * 1000), duration_s: min * 60, elapsed_s: min * 60, elev_gain: 0, started_at: new Date(parseKey(day).getTime() + 12 * 3600e3).toISOString(), day, track: null, splits: null, synced: false };
      await idb.put(a); S.mine.push(a); closeSheet(); render(); toast(`Treino salvo · ${pts(a)} pts`);
      if (groupEnabled()) uploadAct(a).then((ok) => ok && loadGroup().then(render));
    });
  });
}

async function delAct(a) {
  await idb.del(a.id); S.mine = S.mine.filter((x) => x.id !== a.id);
  if (S.sb && S.myId) { await S.sb.from("activities").delete().eq("id", a.id); if (S.remote) S.remote = S.remote.filter((x) => x.id !== a.id); }
  closeDetail(); toast("Treino excluído");
}
async function toggleKudo(id) {
  const sb = await sbReady(); if (!sb) return;
  const has = S.kudos.some((k) => k.activity_id === id && k.user_id === S.myId);
  if (has) { S.kudos = S.kudos.filter((k) => !(k.activity_id === id && k.user_id === S.myId)); render(); await sb.from("kudos").delete().eq("activity_id", id).eq("user_id", S.myId); }
  else { S.kudos.push({ activity_id: id, user_id: S.myId, nick: S.nick }); render(); const { error } = await sb.from("kudos").insert({ activity_id: id, nick: S.nick }); if (error) toast("Não foi possível aplaudir agora."); }
}

/* ============ eventos ============ */
document.addEventListener("click", async (e) => {
  const b = e.target.closest("[data-do],[data-tab],[data-r],#rec-types button"); if (!b) return;
  if (b.dataset.tab) return setTab(b.dataset.tab);
  if (b.dataset.r) return recAction(b.dataset.r);
  if (b.closest("#rec-types")) { if (REC.status === "idle") { REC.type = b.dataset.t; paintRecTypes(); paintRecStats(); } return; }
  const d = b.dataset.do, id = b.dataset.id;
  if (d === "rec") openRec();
  else if (d === "manual") openManual();
  else if (d === "tab") setTab(b.dataset.v);
  else if (d === "rank") { S.rankType = b.dataset.v; render(); }
  else if (d === "detail") openDetail(id);
  else if (d === "kudo") toggleKudo(id);
  else if (d === "invite") invite();
  else if (d === "reload") { S.sbError = null; S.sb = null; render(); loadGroup().then(render); }
  else if (d === "share" && current) shareAct(current);
  else if (d === "gpx" && current) downloadGpx(current);
  else if (d === "del-ask") { b.textContent = "Toque de novo para excluir"; b.dataset.do = "del-yes"; b.style.color = "var(--tartan)"; }
  else if (d === "del-yes" && current) delAct(current);
});
$("#me-btn").onclick = () => openProfile(false);
$("#rec-close").onclick = closeRec;
$("#rec-center").onclick = () => { REC.follow = true; const p = REC.lastFix; if (p && recMap) recMap.easeTo({ center: [p[0], p[1]], zoom: 16.5, duration: 600 }); };
$("#rec-3d").onclick = () => { if (!recMap) return; const flat = recMap.getPitch() < 10; recMap.easeTo({ pitch: flat ? 60 : 0, bearing: flat ? recMap.getBearing() : 0, duration: 600 }); $("#rec-3d").textContent = flat ? "3D" : "2D"; };
$("#d-close").onclick = closeDetail;
$("#d-fly").onclick = fly;
window.addEventListener("online", () => { syncPending(); });

/* ============ início ============ */
if (NATIVE) {
  AppP.addListener("backButton", () => {
    if (!$("#sheet-bg").hidden) { if (S.nick) closeSheet(); return; }
    if (!$("#detail").hidden) return closeDetail();
    if (!$("#rec").hidden) return closeRec();
    if (S.tab !== "hoje") return setTab("hoje");
    AppP.minimizeApp();
  });
  // Ao voltar para o app, atualiza tela e turma
  AppP.addListener("resume", () => { paintRecStats(); render(); if (groupEnabled() && (S.tab === "turma" || S.tab === "rank")) loadGroup().then(render); });
}
(async function boot() {
  try { S.mine = await idb.all(); } catch { S.mine = []; }
  setTab("hoje");
  if (!S.nick) openProfile(true);
  if (REC.status === "paused" && REC.pts.length) toast("Encontramos um treino pausado. Toque nele para continuar ou salvar.", 5000);
  if (groupEnabled()) { await loadGroup(); await syncPending(); render(); }
  if (!NATIVE && "serviceWorker" in navigator && location.protocol === "https:") navigator.serviceWorker.register("sw.js").catch(() => {});
})();
