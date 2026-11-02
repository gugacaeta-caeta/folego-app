// Fôlego — imagem de compartilhamento do treino (foto + rota + números)
const DISPLAY = '"Saira Condensed","Arial Narrow",Arial,sans-serif';
const BODY = 'Figtree,system-ui,-apple-system,"Segoe UI",sans-serif';
const TARTAN = "#BF4429", CREAM = "#FFFDF7", INK = "#1B1E1C", WARM = "#FF9A7A";

export const TEMPLATES = { classico: "Clássico", peito: "Número de peito", minimo: "Mínimo" };
export const FORMATS = { story: { label: "Story 9:16", w: 1080, h: 1920 }, post: { label: "Post 4:5", w: 1080, h: 1350 } };

export async function ensureFonts() {
  try {
    await Promise.race([
      Promise.all([document.fonts.load(`800 120px ${DISPLAY}`), document.fonts.load(`700 60px ${DISPLAY}`), document.fonts.load(`600 30px ${BODY}`), document.fonts.load(`700 30px ${BODY}`)]),
      new Promise((r) => setTimeout(r, 2500)),
    ]);
  } catch {}
}
export function loadImg(src) {
  return new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = src; });
}

/* ---------- utilidades de desenho ---------- */
function cover(g, img, W, H) {
  const r = Math.max(W / img.width, H / img.height), w = img.width * r, h = img.height * r;
  g.drawImage(img, (W - w) / 2, (H - h) / 2, w, h);
}
function rrect(g, x, y, w, h, r) { g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r); g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath(); }
function grad(g, y0, y1, a0, a1, W) { const gr = g.createLinearGradient(0, y0, 0, y1); gr.addColorStop(0, `rgba(10,12,10,${a0})`); gr.addColorStop(1, `rgba(10,12,10,${a1})`); g.fillStyle = gr; g.fillRect(0, y0, W, y1 - y0); }
function fitText(g, text, font, size, maxW) { let s = size; g.font = font(s); while (g.measureText(text).width > maxW && s > 10) { s -= 2; g.font = font(s); } return s; }

// Fundo de pista de atletismo quando não há foto
function trackBg(g, W, H) {
  g.fillStyle = TARTAN; g.fillRect(0, 0, W, H);
  const gr = g.createRadialGradient(W * 0.3, H * 0.2, 0, W * 0.3, H * 0.2, H); gr.addColorStop(0, "rgba(255,255,255,.10)"); gr.addColorStop(1, "rgba(0,0,0,.18)");
  g.fillStyle = gr; g.fillRect(0, 0, W, H);
  g.strokeStyle = "rgba(255,248,242,.28)"; g.lineWidth = 5;
  const lanes = 7, top = H * 0.08, step = (H * 0.84) / lanes;
  for (let i = 0; i <= lanes; i++) { const y = top + i * step; g.beginPath(); g.moveTo(-20, y); g.bezierCurveTo(W * 0.35, y - 30, W * 0.65, y + 30, W + 20, y); g.stroke(); }
  g.fillStyle = "rgba(255,248,242,.22)"; g.font = `800 ${Math.round(step * 0.55)}px ${DISPLAY}`; g.textBaseline = "middle";
  for (let i = 0; i < lanes; i++) g.fillText(String(i + 1), W * 0.05, top + (i + 0.5) * step);
  g.textBaseline = "alphabetic";
}

// Projeta a rota (lng, lat) dentro de uma caixa mantendo a proporção
function routePts(track, x, y, w, h) {
  if (!track || track.length < 2) return null;
  const lat0 = (track[0][1] * Math.PI) / 180, k = Math.cos(lat0);
  const P = track.map((p) => [p[0] * k, -p[1]]);
  let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
  P.forEach(([a, b]) => { x0 = Math.min(x0, a); x1 = Math.max(x1, a); y0 = Math.min(y0, b); y1 = Math.max(y1, b); });
  const s = Math.min(w / (x1 - x0 || 1e-9), h / (y1 - y0 || 1e-9));
  const ox = x + (w - (x1 - x0) * s) / 2, oy = y + (h - (y1 - y0) * s) / 2;
  return P.map(([a, b]) => [ox + (a - x0) * s, oy + (b - y0) * s]);
}
function drawRoute(g, pts, { core = TARTAN, casing = "#fff", width = 10, dots = true } = {}) {
  if (!pts) return;
  const path = () => { g.beginPath(); pts.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y))); };
  g.lineJoin = g.lineCap = "round";
  g.save(); g.shadowColor = "rgba(0,0,0,.35)"; g.shadowBlur = width * 1.5;
  path(); g.strokeStyle = casing; g.lineWidth = width * 1.9; g.stroke(); g.restore();
  path(); g.strokeStyle = core; g.lineWidth = width; g.stroke();
  if (dots) {
    const dot = ([x, y], c) => { g.beginPath(); g.arc(x, y, width * 1.15, 0, Math.PI * 2); g.fillStyle = c; g.fill(); g.lineWidth = width * 0.6; g.strokeStyle = "#fff"; g.stroke(); };
    dot(pts[0], "#2B7A4B"); dot(pts[pts.length - 1], INK);
  }
}
function brand(g, x, y, size, color = "#fff", accent = WARM, align = "left") {
  g.font = `italic 800 ${size}px ${DISPLAY}`; g.textBaseline = "alphabetic";
  const parts = [["F", color], ["ô", accent], ["lego", color]];
  const total = parts.reduce((s, [t]) => s + g.measureText(t).width, 0);
  let cx = align === "right" ? x - total : x;
  parts.forEach(([t, c]) => { g.fillStyle = c; g.fillText(t, cx, y); cx += g.measureText(t).width; });
}
function statRow(g, stats, x, y, w, { val = "#fff", lbl = "rgba(255,255,255,.78)", vs = 64, ls = 26 } = {}) {
  const colW = w / stats.length;
  stats.forEach((s, i) => {
    const cx = x + i * colW;
    const size = fitText(g, s.v, (n) => `700 ${n}px ${DISPLAY}`, vs, colW - 16);
    g.fillStyle = val; g.font = `700 ${size}px ${DISPLAY}`; g.fillText(s.v, cx, y);
    g.fillStyle = lbl; g.font = `700 ${ls}px ${BODY}`; g.fillText(s.l.toUpperCase(), cx, y + ls * 1.5);
  });
}
function pill(g, text, x, y, size, bg, fg) {
  g.font = `700 ${size}px ${BODY}`; const w = g.measureText(text).width + size * 1.2, h = size * 1.7;
  rrect(g, x, y - h * 0.75, w, h, h * 0.25); g.fillStyle = bg; g.fill();
  g.fillStyle = fg; g.fillText(text, x + size * 0.6, y + size * 0.1); return w;
}

/* ---------- modelos ---------- */
// d: { img, fmt, tpl, route, track, km, kmUnit, stats:[{v,l}], typeLabel, date, dayNo, challenge }
export function drawCard(canvas, d) {
  const F = FORMATS[d.fmt], W = F.w, H = F.h; canvas.width = W; canvas.height = H;
  const g = canvas.getContext("2d"); const pad = 72, story = d.fmt === "story";
  g.clearRect(0, 0, W, H);
  if (d.img) cover(g, d.img, W, H); else trackBg(g, W, H);
  const showRoute = d.route && d.track && d.track.length > 1;

  if (d.tpl === "peito") {
    if (d.img) grad(g, 0, H * 0.18, 0.4, 0, W);
    brand(g, pad, pad + 40, 76);
    g.font = `600 30px ${BODY}`; g.fillStyle = "rgba(255,255,255,.9)"; g.textAlign = "right"; g.fillText(d.date, W - pad, pad + 30); g.textAlign = "left";
    const ch = story ? 640 : 560, cy = H - pad - ch, cx = pad, cw = W - pad * 2, band = 92;
    g.save(); g.shadowColor = "rgba(0,0,0,.45)"; g.shadowBlur = 50; g.shadowOffsetY = 18; rrect(g, cx, cy, cw, ch, 22); g.fillStyle = CREAM; g.fill(); g.restore();
    g.save(); rrect(g, cx, cy, cw, ch, 22); g.clip(); g.fillStyle = TARTAN; g.fillRect(cx, cy, cw, band); g.restore();
    g.fillStyle = "#FFF8F2"; g.font = `700 34px ${DISPLAY}`; g.fillText(`FÔLEGO · ${d.typeLabel.toUpperCase()}`, cx + 44, cy + 60);
    g.textAlign = "right"; g.fillText(d.challenge ? "DESAFIO DO DIA FEITO" : `DESAFIO Nº ${d.dayNo}`, cx + cw - 44, cy + 60); g.textAlign = "left";
    [[cx + 22, cy + band + 24], [cx + cw - 22, cy + band + 24], [cx + 22, cy + ch - 24], [cx + cw - 22, cy + ch - 24]].forEach(([x, y]) => { g.beginPath(); g.arc(x, y, 11, 0, Math.PI * 2); g.fillStyle = "#D9D6CB"; g.fill(); g.beginPath(); g.arc(x, y, 5, 0, Math.PI * 2); g.fillStyle = "#9A978E"; g.fill(); });
    const routeW = showRoute ? cw * 0.36 : 0;
    const big = fitText(g, d.km, (n) => `800 ${n}px ${DISPLAY}`, story ? 250 : 220, cw - 88 - routeW - 120);
    g.fillStyle = INK; g.font = `800 ${big}px ${DISPLAY}`; const ky = cy + band + 40 + big * 0.86; g.fillText(d.km, cx + 44, ky);
    const kw = g.measureText(d.km).width; g.font = `700 ${Math.round(big * 0.32)}px ${DISPLAY}`; g.fillText("KM", cx + 52 + kw, ky);
    if (showRoute) drawRoute(g, routePts(d.track, cx + cw - routeW - 40, cy + band + 50, routeW, ch - band - 230), { width: 9, casing: "#fff" });
    g.strokeStyle = "#E3E0D6"; g.lineWidth = 3; g.beginPath(); g.moveTo(cx + 44, cy + ch - 180); g.lineTo(cx + cw - 44, cy + ch - 180); g.stroke();
    statRow(g, d.stats, cx + 44, cy + ch - 98, cw - 88, { val: INK, lbl: "#6A716B", vs: 62, ls: 24 });
    return;
  }

  if (d.tpl === "minimo") {
    if (d.img) { g.fillStyle = "rgba(10,12,10,.22)"; g.fillRect(0, 0, W, H); }
    if (showRoute) drawRoute(g, routePts(d.track, W * 0.12, H * (story ? 0.16 : 0.12), W * 0.76, H * (story ? 0.48 : 0.46)), { width: 16, core: d.img ? TARTAN : INK, casing: "#fff" });
    grad(g, H * 0.62, H, 0, d.img ? 0.7 : 0.25, W);
    const big = story ? 210 : 170;
    g.fillStyle = "#fff"; g.font = `800 ${big}px ${DISPLAY}`; const y1 = H - pad - 120; g.fillText(d.km, pad, y1);
    const kw = g.measureText(d.km).width; g.font = `700 ${Math.round(big * 0.34)}px ${DISPLAY}`; g.fillText("km", pad + kw + 12, y1);
    g.font = `600 44px ${BODY}`; g.fillStyle = "rgba(255,255,255,.92)"; g.fillText(d.stats.map((s) => s.v).join("  ·  "), pad, y1 + 78);
    g.font = `600 30px ${BODY}`; g.fillStyle = "rgba(255,255,255,.75)"; g.fillText(`${d.typeLabel} · ${d.date}`, pad, y1 + 128);
    brand(g, W - pad, pad + 40, 64, "#fff", WARM, "right");
    return;
  }

  // clássico
  if (d.img) { grad(g, 0, H * 0.2, 0.45, 0, W); grad(g, H * 0.42, H, 0, 0.82, W); } else grad(g, H * 0.5, H, 0, 0.35, W);
  brand(g, pad, pad + 48, 84);
  g.font = `600 30px ${BODY}`; g.fillStyle = "rgba(255,255,255,.9)"; g.textAlign = "right"; g.fillText(d.date, W - pad, pad + 38); g.textAlign = "left";
  if (showRoute) drawRoute(g, routePts(d.track, W * 0.5, pad + 110, W * 0.5 - pad, H * (story ? 0.26 : 0.22)), { width: 10 });
  const big = story ? 260 : 210, statsY = H - pad - 44, kmY = statsY - 140;
  let ty = kmY - big * 0.86 - 30;
  let px = pad; px += pill(g, d.typeLabel.toUpperCase(), px, ty, 28, TARTAN, "#FFF8F2") + 14;
  if (d.challenge) pill(g, "DESAFIO DO DIA CONCLUÍDO", px, ty, 28, "#2B7A4B", "#fff");
  g.fillStyle = "#fff"; g.font = `800 ${big}px ${DISPLAY}`; g.fillText(d.km, pad - 6, kmY);
  const kw = g.measureText(d.km).width; g.font = `700 ${Math.round(big * 0.3)}px ${DISPLAY}`; g.fillText("KM", pad + kw + 10, kmY);
  statRow(g, d.stats, pad, statsY - 30, W - pad * 2, { vs: 70, ls: 26 });
}
