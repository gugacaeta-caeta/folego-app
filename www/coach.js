// Fôlego — treinador por voz, calorias, frequência cardíaca e diagnóstico do treino.
import { Capacitor, registerPlugin } from "./vendor/capacitor/core.mjs";
import { BleClient, numberToUUID } from "./vendor/ble.mjs";

const NATIVE = Capacitor.isNativePlatform();
const TTS = registerPlugin("TextToSpeech");

function lsGet(k, f) { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : f; } catch { return f; } }
function lsSet(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} }
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
const pad = (n) => String(n).padStart(2, "0");

/* ================= ajustes ================= */
export const body = Object.assign({ weight: null, age: null, sex: "", hrMax: null }, lsGet("folego.body", {}));
export function saveBody() { lsSet("folego.body", body); }

const COACH_DEFAULT = {
  on: lsGet("folego.voice", true), style: "animado", voiceURI: "", rate: 1.0, pitch: 1.0, volume: 1.0, every: 1000,
  say: { time: true, pace: true, split: true, hr: true, kcal: false, cheer: true },
};
const savedCoach = lsGet("folego.coach", {});
export const coach = Object.assign({}, COACH_DEFAULT, savedCoach, { say: Object.assign({}, COACH_DEFAULT.say, savedCoach.say || {}) });
export function saveCoach() { lsSet("folego.coach", coach); }

export const STYLES = {
  animado:   { label: "Animado",   desc: "Empolgado, comemora cada km" },
  tranquilo: { label: "Tranquilo", desc: "Calmo, foca na respiração" },
  tecnico:   { label: "Técnico",   desc: "Só os números, sem firula" },
  durao:     { label: "Sargento",  desc: "Linha dura, não deixa afrouxar" },
};

/* ================= voz ================= */
let voiceCache = null;
async function webVoices() {
  if (!("speechSynthesis" in window)) return [];
  let v = speechSynthesis.getVoices();
  if (v.length) return v;
  await new Promise((r) => { speechSynthesis.addEventListener("voiceschanged", r, { once: true }); setTimeout(r, 1500); });
  return speechSynthesis.getVoices();
}
// Lista as vozes em português instaladas no celular, com nomes legíveis
export async function listVoices() {
  try {
    if (NATIVE) voiceCache = (await TTS.getSupportedVoices()).voices || [];
    else voiceCache = (await webVoices()).map((v) => ({ name: v.name, lang: v.lang, voiceURI: v.voiceURI, localService: v.localService, _web: v }));
  } catch { voiceCache = []; }
  const pt = voiceCache.map((v, index) => ({ ...v, index })).filter((v) => /^pt/i.test(v.lang || ""));
  const seen = {};
  return pt.map((v) => {
    const region = /pt[-_]pt/i.test(v.lang) ? "Portugal" : "Brasil";
    const code = (String(v.name).match(/-x-([a-z0-9]+)/i) || [])[1];
    const base = code ? `Voz ${code.toUpperCase()}` : String(v.name).replace(/\s*\(.*?\)\s*/g, " ").trim();
    const key = region + base; seen[key] = (seen[key] || 0) + 1;
    return { uri: v.voiceURI, label: `${base}${seen[key] > 1 ? " " + seen[key] : ""} · ${region} · ${v.localService === false ? "online" : "no aparelho"}` };
  });
}
let speakSeq = 0;
// Fala o texto com a voz escolhida. Resolve quando termina (ou é interrompido).
export async function speak(text, { force = false } = {}) {
  if (!text || (!coach.on && !force)) return;
  const my = ++speakSeq;
  if (NATIVE) {
    let voice;
    if (coach.voiceURI) { if (!voiceCache) await listVoices(); const i = voiceCache.findIndex((v) => v.voiceURI === coach.voiceURI); if (i >= 0) voice = i; }
    try { await TTS.speak({ text, lang: "pt-BR", rate: coach.rate, pitch: coach.pitch, volume: coach.volume, voice, category: "playback" }); } catch {}
    return my;
  }
  if (!("speechSynthesis" in window)) return;
  try {
    speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.lang = "pt-BR"; u.rate = coach.rate; u.pitch = coach.pitch; u.volume = coach.volume;
    if (coach.voiceURI) { if (!voiceCache) await listVoices(); const v = voiceCache.find((x) => x.voiceURI === coach.voiceURI); if (v && v._web) u.voice = v._web; }
    await new Promise((res) => { u.onend = res; u.onerror = res; speechSynthesis.speak(u); });
  } catch {}
  return my;
}
export function stopSpeak() { speakSeq++; try { NATIVE ? TTS.stop() : speechSynthesis.cancel(); } catch {} }

/* ================= falar números ================= */
export function sayDur(sec) {
  sec = Math.round(sec); const h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60), s = sec % 60;
  const parts = [];
  if (h) parts.push(`${h} ${h > 1 ? "horas" : "hora"}`);
  if (m) parts.push(`${m} ${m > 1 ? "minutos" : "minuto"}`);
  if (!h && s) parts.push(`${s} ${s > 1 ? "segundos" : "segundo"}`);
  return parts.length ? parts.join(" e ") : "0 segundos";
}
export function sayPace(secPerKm) {
  let m = Math.floor(secPerKm / 60), s = Math.round(secPerKm % 60); if (s === 60) { m++; s = 0; }
  return s ? `${m} minutos e ${s} segundos por quilômetro` : `${m} minutos por quilômetro`;
}
const sayKm = (m) => { const k = Math.round(m / 100) / 10; return `${k.toLocaleString("pt-BR")} ${k === 1 ? "quilômetro" : "quilômetros"}`; };
const sayKmh = (kmh) => `${(Math.round(kmh * 10) / 10).toLocaleString("pt-BR")} quilômetros por hora`;
const txtPace = (secPerKm) => { let m = Math.floor(secPerKm / 60), s = Math.round(secPerKm % 60); if (s === 60) { m++; s = 0; } return `${m}:${pad(s)} /km`; };
const txtKm = (m) => (m / 1000).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + " km";
const txtDur = (sec) => { sec = Math.round(sec); const h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60), s = sec % 60; return h ? `${h}h${pad(m)}` : `${m}:${pad(s)}`; };
const txtKmh = (kmh) => (Math.round(kmh * 10) / 10).toLocaleString("pt-BR") + " km/h";

/* ================= calorias ================= */
export const weightKg = () => +body.weight || 70;
// Estimativa por peso, distância e velocidade (sem sensor cardíaco)
export function metKcal(type, meters, secs) {
  if (!(meters > 0) || !(secs > 0)) return 0;
  const kg = weightKg(), h = secs / 3600, kmh = meters / 1000 / h;
  if (type === "run") return 1.0 * kg * (meters / 1000); // ~1 kcal por kg por km correndo
  if (type === "walk") { const met = kmh < 3.5 ? 2.8 : kmh < 4.5 ? 3.3 : kmh < 5.5 ? 3.8 : kmh < 6.5 ? 4.8 : 6.3; return met * kg * h; }
  const met = kmh < 16 ? 4 : kmh < 19 ? 6.8 : kmh < 22 ? 8 : kmh < 25 ? 10 : kmh < 30 ? 12 : 15.8;
  return met * kg * h;
}
// Pela frequência cardíaca (fórmula de Keytel, 2005). Precisa da idade.
export function hrKcalPerMin(bpm) {
  if (!body.age || !bpm) return null;
  const W = weightKg(), A = +body.age;
  const m = (-55.0969 + 0.6309 * bpm + 0.1988 * W + 0.2017 * A) / 4.184;
  const f = (-20.4022 + 0.4472 * bpm - 0.1263 * W + 0.074 * A) / 4.184;
  const v = body.sex === "m" ? m : body.sex === "f" ? f : (m + f) / 2;
  return Math.max(1, v);
}

/* ================= zonas cardíacas ================= */
export const hrMaxOf = () => +body.hrMax || (body.age ? Math.round(208 - 0.7 * body.age) : 190);
export function zoneOf(bpm) { const p = bpm / hrMaxOf(); return p < 0.6 ? 1 : p < 0.7 ? 2 : p < 0.8 ? 3 : p < 0.9 ? 4 : 5; }
export const ZONES = [
  { n: 1, name: "Recuperação", color: "#6F8F96" },
  { n: 2, name: "Aeróbico leve", color: "#2B7A4B" },
  { n: 3, name: "Moderado", color: "#C9962E" },
  { n: 4, name: "Limiar", color: "#D96A2B" },
  { n: 5, name: "Máximo", color: "#BF2F29" },
];

/* ================= sensor cardíaco (Bluetooth) ================= */
const HR_SVC = numberToUUID(0x180d), HR_CHR = numberToUUID(0x2a37), BAT_SVC = numberToUUID(0x180f), BAT_CHR = numberToUUID(0x2a19);
const savedDev = lsGet("folego.hrdev", null);
export const hr = { status: "off", bpm: null, at: 0, name: savedDev?.name || "", id: savedDev?.id || "", battery: null, error: "" };
const hrListeners = new Set();
export const onHr = (cb) => hrListeners.add(cb);
const emit = () => hrListeners.forEach((cb) => { try { cb(hr); } catch {} });
export const hrFresh = () => hr.bpm > 0 && Date.now() - hr.at < 8000;
export const hrCalReady = () => hrFresh() && !!body.age;
let bleInit = false, want = false, retryT = null, retryWait = 4000;

async function initBle() { if (!bleInit) { await BleClient.initialize({ androidNeverForLocation: false }); bleInit = true; } }
function parseHr(dv) { const flags = dv.getUint8(0); return flags & 1 ? dv.getUint16(1, true) : dv.getUint8(1); }

export async function hrPick() {
  hr.error = "";
  try {
    await initBle();
    const dev = await BleClient.requestDevice({ services: [HR_SVC], optionalServices: [BAT_SVC] });
    if (hr.id && hr.id !== dev.deviceId) await hrDisconnect(false);
    hr.id = dev.deviceId; hr.name = dev.name || "Sensor cardíaco";
    lsSet("folego.hrdev", { id: hr.id, name: hr.name });
    await hrConnect();
  } catch (e) {
    const msg = String(e?.message || e);
    if (/cancel/i.test(msg)) return;
    hr.error = /disabled|not enabled|turned off/i.test(msg) ? "Ligue o Bluetooth do celular e tente de novo."
      : /permission|denied/i.test(msg) ? "Permita o acesso a dispositivos próximos (Bluetooth) nas configurações do app."
      : "Não foi possível conectar ao sensor. Confira se ele está ligado e transmitindo.";
    hr.status = "off"; emit();
  }
}
export async function hrConnect() {
  if (!hr.id) return;
  want = true; clearTimeout(retryT);
  hr.status = "connecting"; emit();
  try {
    await initBle();
    await BleClient.connect(hr.id, () => { hr.bpm = null; if (want) { hr.status = "lost"; emit(); retry(); } else { hr.status = "off"; emit(); } }, { timeout: 15000 });
    await BleClient.startNotifications(hr.id, HR_SVC, HR_CHR, (dv) => {
      const v = parseHr(dv);
      if (v > 25 && v < 240) { hr.bpm = v; hr.at = Date.now(); if (hr.status !== "on") hr.status = "on"; } else hr.bpm = null;
      emit();
    });
    try { hr.battery = (await BleClient.read(hr.id, BAT_SVC, BAT_CHR)).getUint8(0); } catch { hr.battery = null; }
    hr.status = "on"; hr.error = ""; retryWait = 4000; emit();
  } catch (e) {
    hr.status = "lost"; emit(); retry();
  }
}
function retry() { if (!want) return; clearTimeout(retryT); retryT = setTimeout(() => { if (want) hrConnect(); }, retryWait); retryWait = Math.min(20000, retryWait * 1.6); }
export async function hrDisconnect(forget = true) {
  want = false; clearTimeout(retryT);
  if (hr.id) { try { await BleClient.disconnect(hr.id); } catch {} }
  hr.status = "off"; hr.bpm = null;
  if (forget) { hr.id = ""; hr.name = ""; hr.battery = null; try { localStorage.removeItem("folego.hrdev"); } catch {} }
  emit();
}
// Ao abrir a gravação, reconecta sozinho ao último sensor usado
export function hrAuto() { if (hr.id && hr.status === "off") hrConnect(); }

/* ================= frases do treinador ================= */
const LINES = {
  animado: {
    start: ["Bora! Treino iniciado. Bom treino!", "Partiu! Hoje é dia de mandar bem."],
    generic: ["Isso aí, tá mandando muito bem!", "Bora, bora! Cada passo conta.", "Que treino! Segue nesse embalo.", "Você tá voando hoje!", "Mais um na conta. Bora pro próximo!"],
    faster: ["Acelerou! Que perna!", "Mais rápido que o anterior, sensacional!", "Olha esse ritmo subindo!"],
    slower: ["Tudo bem dar uma segurada, o importante é continuar.", "Respira, ajusta e segue firme!"],
    hot: ["Opa, coração lá em cima! Diminui um pouquinho e respira."],
    milestone: ["Marca importante! Que orgulho!", "Que marca! Isso é pra poucos!"],
    challenge: ["Desafio do dia concluído! Arrasou!"],
    end: ["Treino salvo. Parabéns, foi demais!"],
  },
  tranquilo: {
    start: ["Treino iniciado. Comece leve e encontre o seu ritmo.", "Vamos começar. Respire fundo e solte o corpo."],
    generic: ["Muito bem. Mantenha a respiração tranquila.", "Bom ritmo. Relaxe os ombros e siga.", "Você está indo bem. Um passo de cada vez."],
    faster: ["O ritmo subiu. Se estiver confortável, mantenha."],
    slower: ["Sem pressa. O importante é manter a constância."],
    hot: ["Frequência alta. Reduza um pouco e respire fundo."],
    milestone: ["Uma bela marca. Aproveite o momento."],
    challenge: ["Desafio do dia concluído. Muito bem."],
    end: ["Treino salvo. Bom descanso."],
  },
  tecnico: {
    start: ["Gravação iniciada."],
    generic: [""],
    faster: ["Parcial abaixo da anterior."],
    slower: ["Parcial acima da anterior."],
    hot: ["Zona 5. Reduza a intensidade."],
    milestone: [""],
    challenge: ["Desafio do dia concluído."],
    end: ["Treino salvo."],
  },
  durao: {
    start: ["Treino iniciado. Sem moleza hoje!", "Em posição! Treino valendo!"],
    generic: ["Nada de moleza! Mais um!", "Cansou? Cansaço é desculpa. Segue!", "Peito aberto, passada firme. Vai!", "Ninguém disse que ia ser fácil. Continua!"],
    faster: ["Assim que eu gosto! Não alivia!"],
    slower: ["Tá passeando? Aperta esse passo!", "Afrouxou! Volta pro ritmo!"],
    hot: ["Segura um pouco, recruta. Coração no limite."],
    milestone: ["Marca batida. Mas o treino não acabou!"],
    challenge: ["Missão do dia cumprida! Agora termina o treino!"],
    end: ["Treino salvo. Dispensado. Amanhã tem mais!"],
  },
};
let lastLine = "";
export function line(kind) {
  const set = (LINES[coach.style] || LINES.animado)[kind] || [""];
  let s = pick(set); if (s === lastLine && set.length > 1) s = pick(set); lastLine = s; return s;
}

// Aviso a cada intervalo (0,5 / 1 / 2 km)
export function cue(c) {
  const out = [sayKm(c.dist) + "."];
  const k = coach.say;
  if (k.time) out.push(`Tempo, ${sayDur(c.moving)}.`);
  if (k.pace) out.push(c.type === "bike" ? `Média de ${sayKmh(c.dist / 1000 / (c.moving / 3600))}.` : `Ritmo médio, ${sayPace(c.moving / (c.dist / 1000))}.`);
  if (k.split && c.split) {
    let t = c.type === "bike" ? `Último quilômetro a ${sayKmh(3600 / c.split)}` : `Último quilômetro em ${sayDur(c.split)}`;
    if (c.prevSplit) { const d = Math.round(c.prevSplit - c.split); if (Math.abs(d) >= 5) t += `, ${Math.abs(d)} segundos ${d > 0 ? "mais rápido" : "mais lento"} que o anterior`; }
    out.push(t + ".");
  }
  if (k.hr && c.bpm) out.push(`Frequência ${c.bpm}, zona ${zoneOf(c.bpm)}.`);
  if (k.kcal && c.kcal >= 1) out.push(`${Math.round(c.kcal)} calorias.`);
  if (c.challengeDone) out.push(line("challenge"));
  else if (k.cheer) {
    const km = c.dist / 1000;
    const milestone = [5, 10, 21.1, 42.2].some((m) => km >= m && km - (coach.every / 1000) < m);
    const kind = c.bpm && zoneOf(c.bpm) === 5 ? "hot" : milestone ? "milestone" : c.split && c.prevSplit && c.prevSplit - c.split >= 5 ? "faster" : c.split && c.prevSplit && c.split - c.prevSplit >= 8 ? "slower" : "generic";
    out.push(line(kind));
  }
  return out.filter(Boolean).join(" ");
}

/* ================= diagnóstico do treino ================= */
const mean = (a) => a.reduce((s, x) => s + x, 0) / (a.length || 1);
const LBL = { run: "Corrida", walk: "Caminhada", bike: "Pedal" };

// a: treino; history: meus treinos anteriores (todos os tipos); ctx: { weekActs, challenge }
export function diagnose(a, history, ctx = {}) {
  const items = [];
  const add = (title, text, speech) => items.push({ title, text, speech: speech || text });
  const isBike = a.type === "bike";
  const km = a.distance_m / 1000, pace = a.duration_s / km, kmh = km / (a.duration_s / 3600);
  const same = history.filter((h) => h.id !== a.id && h.type === a.type && h.distance_m > 200 && h.duration_s > 0);

  // 1. Resumo
  add("Resumo",
    `${LBL[a.type]} de ${txtKm(a.distance_m)} em ${txtDur(a.duration_s)}, ${isBike ? "média de " + txtKmh(kmh) : "ritmo médio de " + txtPace(pace)}.`,
    `${LBL[a.type]} de ${sayKm(a.distance_m)} em ${sayDur(a.duration_s)}, ${isBike ? "com média de " + sayKmh(kmh) : "com ritmo médio de " + sayPace(pace)}.`);

  // 2. Comparação e recordes
  if (!same.length) {
    add("Comparação", `Primeiro treino de ${LBL[a.type].toLowerCase()} registrado. Ele vira a base para comparar os próximos.`);
  } else {
    const recent = same.filter((h) => h.distance_m >= a.distance_m * 0.5 && h.distance_m <= a.distance_m * 2).sort((x, y) => (y.started_at || "").localeCompare(x.started_at || "")).slice(0, 8);
    const rec = [];
    if (a.distance_m > Math.max(...same.map((h) => h.distance_m))) rec.push({ t: `seu treino de ${LBL[a.type].toLowerCase()} mais longo até agora`, s: `seu treino de ${LBL[a.type].toLowerCase()} mais longo até agora` });
    const similar = same.filter((h) => h.distance_m >= a.distance_m * 0.8);
    if (similar.length && a.distance_m >= 1000 && pace < Math.min(...similar.map((h) => h.duration_s / (h.distance_m / 1000)))) rec.push({ t: "seu melhor ritmo médio para essa distância", s: "seu melhor ritmo médio para essa distância" });
    const allSplits = same.flatMap((h) => h.splits || []);
    if ((a.splits || []).length && allSplits.length && Math.min(...a.splits) < Math.min(...allSplits)) {
      const i = a.splits.indexOf(Math.min(...a.splits));
      rec.push({ t: `seu quilômetro mais rápido de todos (km ${i + 1}, ${isBike ? txtKmh(3600 / a.splits[i]) : txtDur(a.splits[i])})`, s: `seu quilômetro mais rápido de todos, o quilômetro ${i + 1}` });
    }
    let t = "", s = "";
    if (recent.length >= 2) {
      const avgPace = mean(recent.map((h) => h.duration_s / (h.distance_m / 1000)));
      const diff = Math.round(avgPace - pace);
      if (isBike) {
        const avgKmh = mean(recent.map((h) => h.distance_m / 1000 / (h.duration_s / 3600))), dk = kmh - avgKmh;
        t = Math.abs(dk) < 0.5 ? `Velocidade em linha com sua média recente (${txtKmh(avgKmh)}).` : `${txtKmh(Math.abs(dk))} ${dk > 0 ? "mais rápido" : "mais lento"} que sua média recente em distâncias parecidas.`;
        s = Math.abs(dk) < 0.5 ? "Velocidade em linha com a sua média recente." : `${sayKmh(Math.abs(dk))} ${dk > 0 ? "mais rápido" : "mais lento"} que a sua média recente em distâncias parecidas.`;
      } else {
        t = Math.abs(diff) < 5 ? `Ritmo em linha com sua média recente (${txtPace(avgPace)}).` : `${Math.abs(diff)} s/km ${diff > 0 ? "mais rápido" : "mais lento"} que sua média recente em distâncias parecidas (${txtPace(avgPace)}).`;
        s = Math.abs(diff) < 5 ? "Ritmo em linha com a sua média recente." : `${Math.abs(diff)} segundos por quilômetro ${diff > 0 ? "mais rápido" : "mais lento"} que a sua média recente em distâncias parecidas.`;
      }
    }
    if (rec.length) { t += (t ? " " : "") + "Recorde: " + rec.map((r) => r.t).join("; ") + "."; s += (s ? " " : "") + "E tem recorde: " + rec.map((r) => r.s).join(", e ") + "!"; }
    if (t) add("Comparação", t, s);
  }

  // 3. Parciais
  const sp = (a.splits || []).filter((x) => x > 0);
  if (sp.length >= 2) {
    const m = mean(sp), sd = Math.sqrt(mean(sp.map((x) => (x - m) ** 2))), cv = sd / m;
    const half = Math.floor(sp.length / 2), h1 = mean(sp.slice(0, half)), h2 = mean(sp.slice(sp.length - half));
    const fi = sp.indexOf(Math.min(...sp)), si = sp.indexOf(Math.max(...sp));
    const fmt = (x) => (isBike ? txtKmh(3600 / x) : txtDur(x));
    const neg = sp.length >= 3 && h2 < h1 * 0.98, fade = sp.length >= 3 && h2 > h1 * 1.04;
    let t, s;
    if (neg) { t = "Split negativo: terminou mais rápido do que começou. Ótima gestão de esforço."; s = "Você fez split negativo, terminando mais rápido do que começou. Ótima gestão de esforço."; }
    else if (fade) { const p = Math.round((h2 / h1 - 1) * 100); t = `Começou forte e perdeu ${p}% de ritmo na segunda metade. Na próxima, saia um pouco mais devagar.`; s = `Você começou forte e perdeu ${p} por cento de ritmo na segunda metade. Na próxima, tente sair um pouco mais devagar para chegar inteiro no fim.`; }
    else { t = cv < 0.03 ? "Ritmo muito constante do início ao fim." : cv < 0.07 ? "Boa regularidade entre os quilômetros." : "O ritmo variou bastante de um quilômetro para outro, mas as metades ficaram equilibradas."; s = t; }
    t += ` Mais rápido: km ${fi + 1} (${fmt(sp[fi])}). Mais lento: km ${si + 1} (${fmt(sp[si])}).`;
    s += ` O quilômetro mais rápido foi o ${fi + 1}, e o mais lento, o ${si + 1}.`;
    add("Ritmo", t, s);
  }

  // 4. Terreno
  const g = Math.round(a.elev_gain || 0);
  if ((a.track || []).length > 1 || g > 0) {
    if (g >= 40 && g / km > 10) add("Terreno", `Percurso com subidas: ${g} m acumulados. Isso pesa no ritmo, então o resultado vale mais do que parece.`, `Percurso com subidas, ${g} metros acumulados. Isso pesa no ritmo, então o resultado vale mais do que parece.`);
    else if (g < 15) add("Terreno", "Percurso praticamente plano.");
    else add("Terreno", `Subida acumulada de ${g} m, terreno moderado.`, `Subida acumulada de ${g} metros, terreno moderado.`);
  }

  // 5. Coração
  let hard = false;
  if (a.avg_hr) {
    const z = a.zones || [0, 0, 0, 0, 0], tot = z.reduce((s, x) => s + x, 0) || 1, pc = z.map((x) => Math.round((x / tot) * 100));
    const dom = pc.indexOf(Math.max(...pc));
    let t = `Frequência média de ${a.avg_hr} bpm, máxima de ${a.max_hr} bpm. Mais tempo na zona ${dom + 1} (${ZONES[dom].name.toLowerCase()}, ${pc[dom]}%).`;
    let s = `Frequência cardíaca média de ${a.avg_hr} e máxima de ${a.max_hr} batimentos por minuto. Você passou mais tempo na zona ${dom + 1}, ${ZONES[dom].name.toLowerCase()}.`;
    const high = pc[3] + pc[4], low = pc[0] + pc[1];
    if (high >= 35) { hard = true; t += ` Treino intenso: ${high}% do tempo no limiar ou acima.`; s += ` Foi um treino intenso, com ${high} por cento do tempo no limiar ou acima.`; }
    else if (low >= 60) { t += " Treino aeróbico leve, ótimo para construir base."; s += " Foi um treino aeróbico leve, ótimo para construir base."; }
    else { t += " Esforço moderado, bom para condicionamento."; s += " Esforço moderado, bom para o condicionamento."; }
    const hrs = a.hr || [];
    if (hrs.length >= 10 && sp.length >= 2) {
      const mid = hrs[hrs.length - 1][0] / 2, a1 = mean(hrs.filter((x) => x[0] < mid).map((x) => x[1])), a2 = mean(hrs.filter((x) => x[0] >= mid).map((x) => x[1]));
      const half = Math.floor(sp.length / 2), p1 = mean(sp.slice(0, half)), p2 = mean(sp.slice(sp.length - half));
      if (a2 > a1 * 1.06 && p2 >= p1 * 0.98) { t += " O coração subiu na segunda metade sem o ritmo acelerar: sinal de cansaço, calor ou hidratação baixa."; s += " O coração subiu na segunda metade sem o ritmo acelerar. Isso costuma ser cansaço, calor ou falta de hidratação."; }
    }
    if (a.max_hr > hrMaxOf() + 3) { t += ` A máxima passou da sua FC máxima configurada (${hrMaxOf()}). Atualize nos Ajustes para zonas mais precisas.`; s += " A sua máxima passou da frequência máxima configurada. Vale atualizar nos ajustes para as zonas ficarem mais precisas."; }
    add("Coração", t, s);
  } else {
    add("Coração", "Sem sensor cardíaco neste treino. Conecte uma cinta ou relógio compatível para analisar as zonas.", "Este treino foi sem sensor cardíaco.");
  }

  // 6. Energia
  if (a.kcal) {
    const how = a.kcal_by === "fc" ? "pela frequência cardíaca" : body.weight ? "pelo seu peso e ritmo" : "considerando 70 kg";
    add("Energia", `Gasto estimado de ${Math.round(a.kcal)} kcal (${how}).${!body.weight ? " Informe seu peso nos Ajustes para mais precisão." : ""}`, `Gasto estimado de ${Math.round(a.kcal)} calorias.`);
  }

  // 7. Semana e desafio
  if (ctx.weekActs) {
    const w = ctx.weekActs, wk = w.reduce((s, x) => s + x.distance_m, 0);
    const n = w.length;
    let t = `${n}º treino da semana, somando ${txtKm(wk)}.`, s = `É o seu ${n}º treino da semana, somando ${sayKm(wk)}.`;
    if (ctx.challenge) { t += " " + ctx.challenge.text; s += " " + ctx.challenge.speech; }
    add("Semana", t, s);
  }

  // 8. Recuperação
  const mins = a.duration_s / 60;
  if (!a.avg_hr && same.length >= 2) { const avgP = mean(same.map((h) => h.duration_s / (h.distance_m / 1000))); if (pace < avgP * 0.95 && mins > 30) hard = true; }
  if (mins > 90) hard = true;
  if (hard) add("Recuperação", "Treino puxado. Amanhã prefira descanso ou algo bem leve, e capriche no sono e na hidratação.", "Treino puxado. Amanhã prefira descanso ou algo bem leve, e capriche no sono e na hidratação.");
  else if (mins > 45 || (a.type === "run" && km >= 8)) add("Recuperação", "Recuperação de cerca de 24 horas. Um treino leve amanhã cai bem.");
  else add("Recuperação", "Treino leve. Dá para treinar normalmente amanhã.");

  const close = { animado: "Parabéns pelo treino!", tranquilo: "Bom descanso.", tecnico: "", durao: "Dispensado. Amanhã tem mais!" }[coach.style] || "";
  return { items, speech: items.map((i) => i.speech).join(" ") + (close ? " " + close : "") };
}
