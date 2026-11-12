"use client";
import { useEffect, useRef, useState } from "react";

const RADIUS = 120;
const CIRC = 2 * Math.PI * RADIUS;
const PRESETS = [15, 25, 45, 60];
const MAX_MIN = 1440; // 24 hours
// ring path: starts at the top and goes clockwise
const RING_PATH = `M 140 ${140 - RADIUS} A ${RADIUS} ${RADIUS} 0 1 1 140 ${
  140 + RADIUS
} A ${RADIUS} ${RADIUS} 0 1 1 140 ${140 - RADIUS}`;

type Session = { t: number; name: string; m: number }; // t = end time, m = minutes
type DayLog = {
  s: number; // sessions
  m: number; // total minutes
  n?: Record<string, number>; // minutes per section
  l?: Session[]; // every session entry
};
type WeekDay = {
  key: string;
  label: string;
  date: number;
  min: number;
  isToday: boolean;
};

const ALARMS = [
  { id: "ding", name: "Ding", emoji: "✨" },
  { id: "beep", name: "Classic Beep", emoji: "🔔" },
  { id: "bell", name: "Soft Bell", emoji: "🛎️" },
  { id: "chime", name: "Chime", emoji: "🎐" },
  { id: "digital", name: "Digital", emoji: "⏰" },
  { id: "melody", name: "Calm Melody", emoji: "🎵" },
];

function dayKey(d: Date) {
  return d.toLocaleDateString("en-CA"); // YYYY-MM-DD
}

function prettyDate(key: string) {
  const [y, m, d] = key.split("-");
  return `${d}-${m}-${y}`;
}

function fmtClock(ts: number) {
  return new Date(ts).toLocaleTimeString("en-IN", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
}

function fmtMin(min: number) {
  const h = Math.floor(min / 60);
  const m = Math.round(min % 60);
  if (h === 0) return `${m}m`;
  return m === 0 ? `${h}h` : `${h}h ${m}m`;
}

function calcStreak(days: string[]) {
  let streak = 0;
  const d = new Date();
  if (!days.includes(dayKey(d))) d.setDate(d.getDate() - 1);
  while (days.includes(dayKey(d))) {
    streak++;
    d.setDate(d.getDate() - 1);
  }
  return streak;
}

function save(key: string, val: string) {
  try {
    localStorage.setItem(key, val);
  } catch {}
}

// ---------- Confetti (pure canvas, no library) ----------
function fireConfetti(canvas: HTMLCanvasElement) {
  if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  const c = ctx;

  const dpr = window.devicePixelRatio || 1;
  const w = window.innerWidth;
  const h = window.innerHeight;
  canvas.width = w * dpr;
  canvas.height = h * dpr;
  canvas.style.width = `${w}px`;
  canvas.style.height = `${h}px`;
  c.setTransform(dpr, 0, 0, dpr, 0, 0);

  const colors = ["#34d399", "#a78bfa", "#f9a8d4", "#fbbf24", "#60a5fa", "#ffffff"];
  const parts: {
    x: number;
    y: number;
    vx: number;
    vy: number;
    size: number;
    rot: number;
    vr: number;
    color: string;
    circle: boolean;
  }[] = [];

  // two cannons: bottom-left and bottom-right
  for (let i = 0; i < 170; i++) {
    const left = i % 2 === 0;
    const angle = ((left ? -65 : -115) + (Math.random() - 0.5) * 40) * (Math.PI / 180);
    const speed = 11 + Math.random() * 13;
    parts.push({
      x: left ? w * 0.08 : w * 0.92,
      y: h + 10,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      size: 6 + Math.random() * 7,
      rot: Math.random() * Math.PI * 2,
      vr: (Math.random() - 0.5) * 0.4,
      color: colors[Math.floor(Math.random() * colors.length)],
      circle: Math.random() < 0.3,
    });
  }

  const start = performance.now();
  function frame(now: number) {
    const t = now - start;
    c.clearRect(0, 0, w, h);
    let alive = 0;
    for (const p of parts) {
      p.vx *= 0.992;
      p.vy = p.vy * 0.992 + 0.32; // drag + gravity
      p.x += p.vx;
      p.y += p.vy;
      p.rot += p.vr;
      if (p.y < h + 30) alive++;
      c.save();
      c.translate(p.x, p.y);
      c.rotate(p.rot);
      c.globalAlpha = t > 2800 ? Math.max(0, 1 - (t - 2800) / 1400) : 1;
      c.fillStyle = p.color;
      if (p.circle) {
        c.beginPath();
        c.arc(0, 0, p.size / 2, 0, Math.PI * 2);
        c.fill();
      } else {
        c.fillRect(-p.size / 2, -p.size / 4, p.size, p.size / 2);
      }
      c.restore();
    }
    if (alive > 0 && t < 4200) requestAnimationFrame(frame);
    else c.clearRect(0, 0, w, h);
  }
  requestAnimationFrame(frame);
}

// ---------- Sounds (Web Audio, no files needed) ----------
let audioCtx: AudioContext | null = null;

function getCtx() {
  if (!audioCtx) {
    const AC =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext })
        .webkitAudioContext;
    audioCtx = new AC();
  }
  if (audioCtx.state === "suspended") audioCtx.resume();
  return audioCtx;
}

function tone(
  ctx: AudioContext,
  freq: number,
  t: number,
  dur: number,
  type: OscillatorType,
  vol: number
) {
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = type;
  osc.frequency.value = freq;
  gain.gain.setValueAtTime(0.0001, t);
  gain.gain.exponentialRampToValueAtTime(vol, t + 0.015);
  gain.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  osc.connect(gain);
  gain.connect(ctx.destination);
  osc.start(t);
  osc.stop(t + dur + 0.02);
}

// full = true: real alarm (several rounds), false: preview (1 round)
function playAlarm(id: string, full = true) {
  try {
    const ctx = getCtx();
    const now = ctx.currentTime + 0.02;
    const rounds = full ? (id === "melody" || id === "ding" ? 2 : 3) : 1;
    for (let r = 0; r < rounds; r++) {
      if (id === "ding") {
        const t = now + r * 1.4;
        tone(ctx, 1318.5, t, 1.3, "sine", 0.32);
        tone(ctx, 2637, t, 0.5, "sine", 0.08);
        tone(ctx, 1975.5, t + 0.12, 1.0, "sine", 0.16);
      } else if (id === "bell") {
        const t = now + r * 2.0;
        tone(ctx, 523.25, t, 1.7, "sine", 0.35);
        tone(ctx, 523.25 * 2.76, t, 0.9, "sine", 0.12);
      } else if (id === "chime") {
        const t0 = now + r * 1.6;
        [659.25, 783.99, 987.77, 1318.5].forEach((f, i) =>
          tone(ctx, f, t0 + i * 0.18, 0.55, "triangle", 0.25)
        );
      } else if (id === "digital") {
        const t0 = now + r * 1.0;
        for (let i = 0; i < 4; i++)
          tone(ctx, 1000, t0 + i * 0.15, 0.08, "square", 0.08);
      } else if (id === "melody") {
        const t0 = now + r * 2.6;
        [392, 493.88, 587.33, 783.99, 587.33, 493.88, 392].forEach((f, i) => {
          tone(ctx, f, t0 + i * 0.3, 0.5, "sine", 0.3);
          tone(ctx, f * 2, t0 + i * 0.3, 0.3, "triangle", 0.06);
        });
      } else {
        // classic beep
        const t0 = now + r * 1.2;
        for (let i = 0; i < 3; i++)
          tone(ctx, i === 2 ? 1175 : 880, t0 + i * 0.22, 0.16, "sine", 0.3);
      }
    }
  } catch {}
}

function tap() {
  try {
    const ctx = getCtx();
    const t = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "sine";
    osc.frequency.setValueAtTime(1400, t);
    osc.frequency.exponentialRampToValueAtTime(700, t + 0.05);
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.exponentialRampToValueAtTime(0.12, t + 0.005);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.06);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(t);
    osc.stop(t + 0.08);
  } catch {}
}

const CSS = `
@import url('https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;600;700&family=JetBrains+Mono:wght@300;500&display=swap');

.app { font-family: 'Outfit', system-ui, sans-serif; }
.mono { font-family: 'JetBrains Mono', ui-monospace, monospace; font-variant-numeric: tabular-nums; }

.bg {
  background:
    radial-gradient(1200px 600px at 10% -10%, #1e1b4b 0%, transparent 60%),
    radial-gradient(900px 600px at 110% 10%, #3b0764 0%, transparent 55%),
    linear-gradient(160deg, #070a14 0%, #0d1224 50%, #0a0f1c 100%);
}

.orb { position: absolute; border-radius: 9999px; filter: blur(80px); opacity: 0.45; pointer-events: none; }
.o1 { width: 340px; height: 340px; background: #10b981; top: -80px; left: -80px; animation: float1 14s ease-in-out infinite; }
.o2 { width: 380px; height: 380px; background: #8b5cf6; top: 30%; right: -120px; animation: float2 18s ease-in-out infinite; }
.o3 { width: 300px; height: 300px; background: #ec4899; bottom: -100px; left: 25%; animation: float1 20s ease-in-out infinite reverse; }
@keyframes float1 { 0%,100% { transform: translate(0,0) scale(1); } 50% { transform: translate(40px,60px) scale(1.15); } }
@keyframes float2 { 0%,100% { transform: translate(0,0) scale(1); } 50% { transform: translate(-60px,-40px) scale(1.1); } }

.glass {
  background: rgba(255, 255, 255, var(--ga, 0.055));
  border: 1px solid rgba(255, 255, 255, var(--gba, 0.1));
  backdrop-filter: blur(16px);
  -webkit-backdrop-filter: blur(16px);
}

.title-grad {
  background: linear-gradient(90deg, #6ee7b7, #a78bfa, #f9a8d4);
  -webkit-background-clip: text; background-clip: text; color: transparent;
}

.scene { width: 64px; height: 64px; perspective: 600px; }
.cube {
  width: 100%; height: 100%; position: relative;
  transform-style: preserve-3d;
  transform: rotateX(-25deg) rotateY(30deg);
  animation: spin 9s linear infinite;
}
.face {
  position: absolute; width: 64px; height: 64px;
  display: flex; align-items: center; justify-content: center;
  font-size: 24px;
  background: linear-gradient(135deg, rgba(110,231,183,0.18), rgba(167,139,250,0.18));
  border: 1px solid rgba(255,255,255,0.35);
  box-shadow: inset 0 0 18px rgba(255,255,255,0.08);
}
.f1 { transform: rotateY(0deg) translateZ(32px); }
.f2 { transform: rotateY(90deg) translateZ(32px); }
.f3 { transform: rotateY(180deg) translateZ(32px); }
.f4 { transform: rotateY(-90deg) translateZ(32px); }
.f5 { transform: rotateX(90deg) translateZ(32px); }
.f6 { transform: rotateX(-90deg) translateZ(32px); }
@keyframes spin {
  from { transform: rotateX(-25deg) rotateY(30deg); }
  to { transform: rotateX(335deg) rotateY(390deg); }
}

.tick { animation: tick 0.5s ease-out; }
@keyframes tick {
  from { transform: perspective(400px) rotateX(-70deg); opacity: 0.3; }
  to { transform: perspective(400px) rotateX(0deg); opacity: 1; }
}

.ring-progress {
  transition: stroke-dashoffset 0.12s linear;
  filter: drop-shadow(0 0 8px rgba(139,92,246,0.55));
}

.pulse { animation: pulse 2s ease-in-out infinite; }
@keyframes pulse { 0%,100% { opacity: 1; } 50% { opacity: 0.35; } }

.pop { animation: pop 0.5s cubic-bezier(.2,1.4,.4,1); }
@keyframes pop { from { transform: scale(0.8); opacity: 0; } to { transform: scale(1); opacity: 1; } }

.bar { transform-origin: bottom; animation: grow 0.8s cubic-bezier(.2,.8,.2,1) both; }
@keyframes grow { from { transform: scaleY(0); } to { transform: scaleY(1); } }

.row { transition: background 0.2s ease; }
.row:hover { background: rgba(255,255,255,0.08); }

.btn-main {
  background: linear-gradient(135deg, #34d399, #10b981);
  box-shadow: 0 6px 0 0 #047857, 0 12px 30px rgba(16,185,129,0.35);
}
.btn-ghost {
  background: rgba(255,255,255,0.08);
  box-shadow: 0 6px 0 0 rgba(0,0,0,0.35);
}

@media (prefers-reduced-motion: reduce) {
  .cube, .tick, .orb, .pulse, .pop, .bar { animation: none; }
}
`;

export default function Home() {
  const [totalSec, setTotalSec] = useState(25 * 60);
  const [msLeft, setMsLeft] = useState(25 * 60 * 1000); // time left in milliseconds
  const [running, setRunning] = useState(false);
  const [endAt, setEndAt] = useState(0);
  const [log, setLog] = useState<Record<string, DayLog>>({});
  const [today, setToday] = useState(0);
  const [streak, setStreak] = useState(0);
  const [week, setWeek] = useState<WeekDay[]>([]);
  const [tilt, setTilt] = useState({ x: 0, y: 0 });
  const [soundOn, setSoundOn] = useState(true);
  const [tapOn, setTapOn] = useState(true);
  const [confettiOn, setConfettiOn] = useState(true);
  const [alarmId, setAlarmId] = useState("ding");
  const [glass, setGlass] = useState(85); // 0 = solid, 100 = very transparent
  const [section, setSection] = useState("");
  const [showSettings, setShowSettings] = useState(false);
  const [done, setDone] = useState(false);
  const [custom, setCustom] = useState("");
  const [openDays, setOpenDays] = useState<Record<string, boolean>>({});

  // refs so the timer effect doesn't restart on every change
  const sectionRef = useRef(section);
  const alarmRef = useRef(alarmId);
  const soundRef = useRef(soundOn);
  const confettiOnRef = useRef(confettiOn);
  const confettiCanvas = useRef<HTMLCanvasElement>(null);
  sectionRef.current = section;
  alarmRef.current = alarmId;
  soundRef.current = soundOn;
  confettiOnRef.current = confettiOn;

  const minutes = totalSec / 60;
  const seconds = Math.ceil(msLeft / 1000);
  const progress = 1 - msLeft / (totalSec * 1000); // 0 → 1 as time passes

  // load saved data
  useEffect(() => {
    try {
      const saved = localStorage.getItem("study-log");
      if (saved) {
        const raw = JSON.parse(saved) as Record<string, number | DayLog>;
        const fixed: Record<string, DayLog> = {};
        for (const k of Object.keys(raw)) {
          const v = raw[k];
          // convert old data (plain number) to the new format
          fixed[k] = typeof v === "number" ? { s: v, m: v * 25 } : v;
        }
        setLog(fixed);
      }
      const savedMin = parseInt(localStorage.getItem("study-minutes") || "", 10);
      if (savedMin >= 1 && savedMin <= MAX_MIN) {
        setTotalSec(savedMin * 60);
        setMsLeft(savedMin * 60 * 1000);
      }
      if (localStorage.getItem("study-sound") === "off") setSoundOn(false);
      if (localStorage.getItem("study-tap") === "off") setTapOn(false);
      if (localStorage.getItem("study-confetti") === "off") setConfettiOn(false);
      const a = localStorage.getItem("study-alarm");
      if (a && ALARMS.some((x) => x.id === a)) setAlarmId(a);
      const g = parseInt(localStorage.getItem("study-glass") || "", 10);
      if (g >= 0 && g <= 100) setGlass(g);
      const sec = localStorage.getItem("study-section");
      if (sec) setSection(sec);
    } catch {}
  }, []);

  // recompute today's sessions, streak and the last-7-days chart when the log changes
  useEffect(() => {
    setToday(log[dayKey(new Date())]?.s || 0);
    setStreak(calcStreak(Object.keys(log)));

    const days: WeekDay[] = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const key = dayKey(d);
      days.push({
        key,
        label: d.toLocaleDateString("en-US", { weekday: "short" }),
        date: d.getDate(),
        min: log[key]?.m || 0,
        isToday: i === 0,
      });
    }
    setWeek(days);
  }, [log]);

  // run the timer (uses end time, so it stays correct in a background tab)
  useEffect(() => {
    if (!running) return;
    let finished = false;
    const id = setInterval(() => {
      const rem = Math.max(0, endAt - Date.now());
      setMsLeft(rem);
      if (rem === 0 && !finished) {
        finished = true;
        setRunning(false);
        setMsLeft(totalSec * 1000);
        setDone(true);
        const name = (sectionRef.current.trim() || "General").slice(0, 24);
        const nowTs = Date.now();
        const mins = totalSec / 60;
        setLog((prev) => {
          const key = dayKey(new Date(nowTs));
          const cur = prev[key] || { s: 0, m: 0 };
          const n = { ...(cur.n || {}) };
          n[name] = (n[name] || 0) + mins;
          const l = [...(cur.l || []), { t: nowTs, name, m: mins }];
          const next = {
            ...prev,
            [key]: { s: cur.s + 1, m: cur.m + mins, n, l },
          };
          save("study-log", JSON.stringify(next));
          return next;
        });
        if (soundRef.current) playAlarm(alarmRef.current, true);
        if (confettiOnRef.current && confettiCanvas.current)
          fireConfetti(confettiCanvas.current);
        try {
          navigator.vibrate?.([300, 150, 300]);
        } catch {}
      }
    }, 100);
    return () => clearInterval(id);
  }, [running, endAt, totalSec]);

  // show the time in the browser tab title
  useEffect(() => {
    const h = Math.floor(seconds / 3600);
    const m = String(Math.floor((seconds % 3600) / 60)).padStart(2, "0");
    const s = String(seconds % 60).padStart(2, "0");
    const clock = h > 0 ? `${h}:${m}:${s}` : `${m}:${s}`;
    document.title = running ? `${clock} · Study Timer` : "Study Timer";
  }, [seconds, running]);

  function toggleStart() {
    if (running) {
      setRunning(false);
      return;
    }
    getCtx(); // unlock sound on click
    setDone(false);
    setEndAt(Date.now() + msLeft);
    setRunning(true);
  }

  function resetTimer() {
    setRunning(false);
    setMsLeft(totalSec * 1000);
    setDone(false);
  }

  function setDuration(min: number) {
    if (running) return;
    const m = Math.min(MAX_MIN, Math.max(1, Math.round(min)));
    setTotalSec(m * 60);
    setMsLeft(m * 60 * 1000);
    setDone(false);
    save("study-minutes", String(m));
  }

  function applyCustom() {
    const n = parseInt(custom, 10);
    if (!n || n < 1) return;
    setDuration(n);
    setCustom("");
  }

  function changeSection(v: string) {
    setSection(v);
    save("study-section", v);
  }

  function toggleSound() {
    const next = !soundOn;
    setSoundOn(next);
    save("study-sound", next ? "on" : "off");
  }

  function toggleTap() {
    const next = !tapOn;
    setTapOn(next);
    save("study-tap", next ? "on" : "off");
  }

  function toggleConfetti() {
    const next = !confettiOn;
    setConfettiOn(next);
    save("study-confetti", next ? "on" : "off");
  }

  function pickAlarm(id: string) {
    setAlarmId(id);
    save("study-alarm", id);
    playAlarm(id, false); // preview
  }

  function previewCelebration() {
    getCtx();
    if (soundOn) playAlarm(alarmId, false);
    if (confettiOn && confettiCanvas.current) fireConfetti(confettiCanvas.current);
  }

  function changeGlass(v: number) {
    setGlass(v);
    save("study-glass", String(v));
  }

  function clearHistory() {
    if (!confirm("Delete all history?")) return;
    setLog({});
    try {
      localStorage.removeItem("study-log");
    } catch {}
  }

  // soft tick on every button tap (except buttons marked data-notap)
  function handleTap(e: React.MouseEvent<HTMLElement>) {
    if (!tapOn) return;
    const el = (e.target as HTMLElement).closest("button:not([data-notap])");
    if (el) tap();
  }

  // tilt the card with the mouse
  function handleMove(e: React.MouseEvent<HTMLDivElement>) {
    const r = e.currentTarget.getBoundingClientRect();
    const px = (e.clientX - r.left) / r.width - 0.5;
    const py = (e.clientY - r.top) / r.height - 0.5;
    setTilt({ x: -py * 14, y: px * 14 });
  }

  const hh = Math.floor(seconds / 3600);
  const mm = String(Math.floor((seconds % 3600) / 60)).padStart(2, "0");
  const ss = String(seconds % 60).padStart(2, "0");
  const ringOffset = CIRC * (1 - progress);

  // history: newest day first
  const history = Object.entries(log).sort((a, b) => b[0].localeCompare(a[0]));
  const totalSessions = history.reduce((sum, [, v]) => sum + v.s, 0);
  const totalMinutes = history.reduce((sum, [, v]) => sum + v.m, 0);

  // section-wise total (all days)
  const sectionTotals: Record<string, number> = {};
  for (const [, v] of history)
    for (const [k, min] of Object.entries(v.n || {}))
      sectionTotals[k] = (sectionTotals[k] || 0) + min;
  const sectionList = Object.entries(sectionTotals).sort((a, b) => b[1] - a[1]);

  // recent section names (for the chips)
  const recent: string[] = [];
  for (const [, v] of history)
    for (const k of Object.keys(v.n || {}))
      if (!recent.includes(k)) recent.push(k);
  const chips = (recent.length ? recent : ["Maths", "Coding", "Reading"]).slice(0, 5);

  // weekly chart numbers
  const weekTotal = week.reduce((sum, d) => sum + d.min, 0);
  const weekMax = week.reduce((mx, d) => Math.max(mx, d.min), 0);
  const step = weekMax > 180 ? 60 : 30; // axis step: 30 min, or 1 hour for long days
  const niceMax = Math.max(step, Math.ceil(weekMax / step) * step);
  const activeDays = week.filter((d) => d.min > 0).length;

  // glass transparency: 0 = solid, 100 = very transparent
  const glassVars = {
    "--ga": (0.01 + (100 - glass) * 0.003).toFixed(3),
    "--gba": (0.04 + (100 - glass) * 0.001).toFixed(3),
  } as React.CSSProperties;

  return (
    <main
      className="app bg relative min-h-screen overflow-hidden text-white"
      style={glassVars}
      onClickCapture={handleTap}
    >
      <style>{CSS}</style>

      {/* confetti layer */}
      <canvas
        ref={confettiCanvas}
        className="pointer-events-none fixed inset-0 z-50"
      />

      {/* floating glow orbs */}
      <div className="orb o1" />
      <div className="orb o2" />
      <div className="orb o3" />

      <div className="relative z-10 flex flex-col items-center gap-7 px-5 py-14">
        {/* Heading */}
        <div className="text-center">
          <h1 className="title-grad text-4xl font-bold tracking-tight">
            Study Timer
          </h1>
          <p className="mt-1 text-sm font-light tracking-[0.3em] text-white/50 uppercase">
            Focus · Breathe · Repeat
          </p>
        </div>

        {/* 3D cube */}
        <div className="scene">
          <div
            className="cube"
            style={{ animationPlayState: running ? "running" : "paused" }}
          >
            <div className="face f1">📚</div>
            <div className="face f2">⏱️</div>
            <div className="face f3">🔥</div>
            <div className="face f4">✅</div>
            <div className="face f5">🎯</div>
            <div className="face f6">💡</div>
          </div>
        </div>

        {/* Session complete banner */}
        {done && (
          <div className="glass pop flex items-center gap-4 rounded-2xl px-5 py-3">
            <span className="text-2xl">🎉</span>
            <div>
              <div className="font-semibold">Session complete!</div>
              <div className="text-xs text-white/60">
                Take a short break, drink some water 💧
              </div>
            </div>
            <button
              onClick={() => setDone(false)}
              className="ml-2 rounded-lg bg-white/10 px-3 py-1 text-sm hover:bg-white/20"
            >
              OK
            </button>
          </div>
        )}

        {/* Section name + time */}
        <div className="glass w-full max-w-sm rounded-2xl p-4">
          <div className="mb-2 text-xs tracking-widest text-white/50 uppercase">
            Section / Subject
          </div>
          <input
            type="text"
            maxLength={24}
            value={section}
            onChange={(e) => changeSection(e.target.value)}
            placeholder="What are you studying? (e.g. Maths)"
            className="w-full rounded-xl bg-white/10 px-3 py-2 text-sm text-white outline-none placeholder:text-white/30 focus:ring-2 focus:ring-emerald-400/60"
          />
          <div className="mt-2 flex flex-wrap gap-1.5">
            {chips.map((c) => (
              <button
                key={c}
                onClick={() => changeSection(c)}
                className={`rounded-full px-3 py-1 text-xs transition ${
                  section.trim() === c
                    ? "bg-emerald-400 font-semibold text-emerald-950"
                    : "bg-white/10 text-white/70 hover:bg-white/20"
                }`}
              >
                {c}
              </button>
            ))}
          </div>

          {/* Session time */}
          <div className={`mt-4 transition ${running ? "opacity-50" : ""}`}>
            <div className="mb-2 flex items-center justify-between">
              <span className="text-xs tracking-widest text-white/50 uppercase">
                Session time (minutes)
              </span>
              <span className="text-xs text-white/40">
                {running ? "Pause to change" : `Now: ${fmtMin(minutes)}`}
              </span>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              {PRESETS.map((p) => (
                <button
                  key={p}
                  disabled={running}
                  onClick={() => setDuration(p)}
                  className={`rounded-xl px-4 py-2 text-sm transition ${
                    minutes === p
                      ? "bg-emerald-400 font-semibold text-emerald-950"
                      : "bg-white/10 text-white/80 hover:bg-white/20"
                  } disabled:cursor-not-allowed`}
                >
                  {p}
                </button>
              ))}
            </div>

            <div className="mt-3 flex items-center gap-2">
              <input
                type="number"
                inputMode="numeric"
                min={1}
                max={MAX_MIN}
                disabled={running}
                value={custom}
                onChange={(e) => setCustom(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && applyCustom()}
                onBlur={applyCustom}
                placeholder={`Type minutes (1–${MAX_MIN})`}
                className="min-w-0 flex-1 rounded-xl bg-white/10 px-3 py-2 text-sm text-white outline-none placeholder:text-white/30 focus:ring-2 focus:ring-emerald-400/60 disabled:cursor-not-allowed"
              />
              <button
                disabled={running}
                onClick={applyCustom}
                className="rounded-xl bg-emerald-400 px-5 py-2 text-sm font-semibold text-emerald-950 transition hover:bg-emerald-300 disabled:cursor-not-allowed disabled:opacity-50"
              >
                Set
              </button>
            </div>
            <p className="mt-2 text-xs text-white/40">
              Any time up to {MAX_MIN} min (24h). Press Enter or tap Set.
            </p>
          </div>

          <button
            onClick={() => setShowSettings(!showSettings)}
            className="mt-4 w-full rounded-xl bg-white/5 py-2 text-sm text-white/70 transition hover:bg-white/10"
          >
            ⚙️ Settings {showSettings ? "▲" : "▼"}
          </button>

          {showSettings && (
            <div className="pop mt-4 flex flex-col gap-4">
              {/* Alarm sound */}
              <div>
                <div className="mb-2 flex items-center justify-between">
                  <span className="text-xs tracking-widest text-white/50 uppercase">
                    Alarm sound
                  </span>
                  <button
                    onClick={toggleSound}
                    className="text-xs text-white/60 hover:text-white"
                  >
                    {soundOn ? "🔔 Alarm on" : "🔕 Alarm off"}
                  </button>
                </div>
                <div className="flex flex-wrap gap-2">
                  {ALARMS.map((a) => (
                    <button
                      key={a.id}
                      data-notap
                      onClick={() => pickAlarm(a.id)}
                      className={`rounded-xl px-3 py-2 text-sm transition ${
                        alarmId === a.id
                          ? "bg-emerald-400 font-semibold text-emerald-950"
                          : "bg-white/10 text-white/80 hover:bg-white/20"
                      }`}
                    >
                      {a.emoji} {a.name}
                    </button>
                  ))}
                </div>
                <p className="mt-2 text-xs text-white/40">
                  Tap a sound to preview it.
                </p>
              </div>

              {/* Confetti */}
              <div className="flex items-center justify-between">
                <span className="text-xs tracking-widest text-white/50 uppercase">
                  Confetti
                </span>
                <div className="flex gap-2">
                  <button
                    data-notap
                    onClick={previewCelebration}
                    className="rounded-xl bg-white/10 px-3 py-1.5 text-sm hover:bg-white/20"
                  >
                    🎉 Preview
                  </button>
                  <button
                    onClick={toggleConfetti}
                    className="rounded-xl bg-white/10 px-3 py-1.5 text-sm hover:bg-white/20"
                  >
                    {confettiOn ? "On" : "Off"}
                  </button>
                </div>
              </div>

              {/* Tap sound */}
              <div className="flex items-center justify-between">
                <span className="text-xs tracking-widest text-white/50 uppercase">
                  Tap sound
                </span>
                <button
                  onClick={toggleTap}
                  className="rounded-xl bg-white/10 px-3 py-1.5 text-sm hover:bg-white/20"
                >
                  {tapOn ? "👆 On" : "🚫 Off"}
                </button>
              </div>

              {/* Transparency */}
              <div>
                <div className="mb-2 flex items-center justify-between">
                  <span className="text-xs tracking-widest text-white/50 uppercase">
                    Transparency
                  </span>
                  <span className="text-xs text-white/50">{glass}%</span>
                </div>
                <input
                  type="range"
                  min={0}
                  max={100}
                  value={glass}
                  onChange={(e) => changeGlass(parseInt(e.target.value, 10))}
                  className="w-full"
                  style={{ accentColor: "#34d399" }}
                />
                <div className="mt-1 flex justify-between text-[10px] text-white/40">
                  <span>Solid</span>
                  <span>Transparent</span>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Timer card with ring + tilt */}
        <div
          style={{ perspective: "900px" }}
          onMouseMove={handleMove}
          onMouseLeave={() => setTilt({ x: 0, y: 0 })}
        >
          <div
            className="glass rounded-[2rem] p-6"
            style={{
              transform: `rotateX(${tilt.x}deg) rotateY(${tilt.y}deg)`,
              transition: "transform 0.15s ease-out",
              boxShadow: running
                ? "0 25px 70px rgba(139,92,246,0.28)"
                : "0 25px 60px rgba(0,0,0,0.45)",
            }}
          >
            <div className="relative" style={{ width: 280, height: 280 }}>
              <svg width="280" height="280" viewBox="0 0 280 280">
                <defs>
                  <linearGradient
                    id="ringGrad"
                    gradientUnits="userSpaceOnUse"
                    x1="0"
                    y1="20"
                    x2="0"
                    y2="260"
                  >
                    <stop offset="0%" stopColor="#34d399" />
                    <stop offset="100%" stopColor="#8b5cf6" />
                  </linearGradient>
                </defs>
                {/* faint track */}
                <path
                  d={RING_PATH}
                  fill="none"
                  stroke="rgba(255,255,255,0.1)"
                  strokeWidth="10"
                />
                {/* filling ring: green → purple */}
                {progress > 0.002 && (
                  <path
                    className="ring-progress"
                    d={RING_PATH}
                    fill="none"
                    stroke="url(#ringGrad)"
                    strokeWidth="10"
                    strokeLinecap="round"
                    strokeDasharray={CIRC}
                    strokeDashoffset={ringOffset}
                  />
                )}
              </svg>

              <div className="absolute inset-0 flex flex-col items-center justify-center">
                <div
                  className={`mono font-light ${
                    hh > 0 ? "text-[2.6rem]" : "text-6xl"
                  }`}
                >
                  {hh > 0 ? `${hh}:` : ""}
                  {mm}:
                  <span
                    key={ss}
                    className={running ? "tick inline-block" : "inline-block"}
                  >
                    {ss}
                  </span>
                </div>
                <div className="mt-2 max-w-[200px] truncate text-sm text-emerald-300/80">
                  {section.trim() || "General"}
                </div>
                <div className="mt-2 flex items-center gap-2 text-xs tracking-widest text-white/50 uppercase">
                  <span
                    className={`inline-block h-2 w-2 rounded-full ${
                      running ? "pulse bg-emerald-400" : "bg-white/30"
                    }`}
                  />
                  {running ? "Focus mode on" : "Ready when you are"}
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Buttons */}
        <div className="flex gap-4">
          <button
            onClick={toggleStart}
            className="btn-main rounded-2xl px-9 py-3 text-lg font-semibold text-emerald-950 transition active:translate-y-1 active:shadow-none"
          >
            {running ? "Pause" : "Start"}
          </button>
          <button
            onClick={resetTimer}
            className="btn-ghost rounded-2xl px-7 py-3 text-lg text-white/80 transition hover:bg-white/15 active:translate-y-1 active:shadow-none"
          >
            Reset
          </button>
        </div>

        {/* Stats */}
        <div className="flex gap-4">
          <div className="glass w-36 rounded-2xl py-4 text-center">
            <div className="text-3xl font-semibold">{today}</div>
            <div className="mt-1 text-xs tracking-wider text-white/50 uppercase">
              Today&apos;s sessions
            </div>
          </div>
          <div className="glass w-36 rounded-2xl py-4 text-center">
            <div className="text-3xl font-semibold">🔥 {streak}</div>
            <div className="mt-1 text-xs tracking-wider text-white/50 uppercase">
              Day streak
            </div>
          </div>
        </div>

        {/* Weekly chart */}
        <section className="glass w-full max-w-md rounded-3xl p-5">
          <div className="mb-1 flex items-center justify-between">
            <h2 className="text-lg font-semibold">This week</h2>
            <span className="text-xs text-white/40">Last 7 days</span>
          </div>
          <div className="mb-4 flex gap-4 text-xs text-white/60">
            <span>
              Total{" "}
              <span className="font-semibold text-emerald-300">
                {fmtMin(weekTotal)}
              </span>
            </span>
            <span>
              Daily avg{" "}
              <span className="font-semibold text-violet-300">
                {fmtMin(weekTotal / 7)}
              </span>
            </span>
            <span>
              Active days{" "}
              <span className="font-semibold text-white/80">{activeDays}/7</span>
            </span>
          </div>

          {week.length > 0 && (
            <>
              <div className="relative h-40">
                {/* hour gridlines */}
                {[1, 0.5, 0].map((f) => (
                  <div
                    key={f}
                    className="absolute right-0 left-0 flex items-center"
                    style={{ bottom: `${f * 100}%` }}
                  >
                    <span className="w-10 pr-2 text-right text-[10px] text-white/40">
                      {f === 0 ? "0" : fmtMin(niceMax * f)}
                    </span>
                    <div className="h-px flex-1 bg-white/10" />
                  </div>
                ))}

                {/* bars */}
                <div className="absolute inset-0 left-10 flex gap-2">
                  {week.map((d) => {
                    const pct = Math.min(100, (d.min / niceMax) * 100);
                    return (
                      <div
                        key={d.key}
                        className="relative h-full flex-1"
                        title={`${d.label} ${d.date}: ${fmtMin(d.min)}`}
                      >
                        {d.min > 0 && (
                          <>
                            <div
                              className="bar absolute right-[18%] bottom-0 left-[18%] rounded-t-lg"
                              style={{
                                height: `${Math.max(pct, 3)}%`,
                                background:
                                  "linear-gradient(to top, #8b5cf6, #34d399)",
                                opacity: d.isToday ? 1 : 0.6,
                                boxShadow: d.isToday
                                  ? "0 0 16px rgba(139,92,246,0.5)"
                                  : "none",
                              }}
                            />
                            <div
                              className="absolute w-full text-center text-[10px] whitespace-nowrap text-white/80"
                              style={{ bottom: `calc(${Math.max(pct, 3)}% + 4px)` }}
                            >
                              {fmtMin(d.min)}
                            </div>
                          </>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* day labels */}
              <div className="mt-2 flex gap-2 pl-10">
                {week.map((d) => (
                  <div
                    key={d.key}
                    className={`flex-1 text-center text-[11px] leading-tight ${
                      d.isToday ? "font-semibold text-emerald-300" : "text-white/50"
                    }`}
                  >
                    {d.label}
                    <div className="text-[10px] text-white/30">{d.date}</div>
                  </div>
                ))}
              </div>
            </>
          )}
        </section>

        {/* History */}
        <section className="glass w-full max-w-md rounded-3xl p-5">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-lg font-semibold">History</h2>
            {history.length > 0 && (
              <button
                onClick={clearHistory}
                className="text-xs text-white/40 transition hover:text-rose-300"
              >
                Clear history
              </button>
            )}
          </div>

          {history.length === 0 ? (
            <p className="py-4 text-center text-sm text-white/40">
              No sessions yet. Complete your first one ✨
            </p>
          ) : (
            <>
              {/* Section-wise total */}
              {sectionList.length > 0 && (
                <div className="mb-4">
                  <div className="mb-2 text-xs tracking-widest text-white/50 uppercase">
                    Section-wise total
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {sectionList.map(([name, min]) => (
                      <span
                        key={name}
                        className="rounded-full bg-emerald-400/15 px-3 py-1 text-xs text-emerald-200"
                      >
                        {name} · {fmtMin(min)}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              <ul className="flex flex-col gap-2">
                {history.map(([date, v], idx) => {
                  const isOpen = openDays[date] ?? idx === 0;
                  const sessions = [...(v.l || [])].reverse(); // newest first
                  return (
                    <li key={date} className="row rounded-xl bg-white/5">
                      <button
                        onClick={() =>
                          setOpenDays((o) => ({ ...o, [date]: !isOpen }))
                        }
                        className="flex w-full items-center justify-between px-4 py-3 text-left"
                      >
                        <span className="mono text-sm text-white/70">
                          {isOpen ? "▾" : "▸"} {prettyDate(date)}
                        </span>
                        <span className="text-sm">
                          {v.s} session{v.s > 1 ? "s" : ""} ·{" "}
                          <span className="text-emerald-300">
                            {fmtMin(v.m)}
                          </span>
                        </span>
                      </button>

                      {isOpen && (
                        <div className="px-4 pb-3">
                          {sessions.length > 0 ? (
                            <ul className="flex flex-col gap-1.5">
                              {sessions.map((s, i) => (
                                <li
                                  key={`${s.t}-${i}`}
                                  className="flex items-center justify-between rounded-lg bg-white/5 px-3 py-2 text-xs"
                                >
                                  <span className="mono text-white/50">
                                    {fmtClock(s.t - s.m * 60000)} –{" "}
                                    {fmtClock(s.t)}
                                  </span>
                                  <span className="flex items-center gap-2">
                                    <span className="rounded-full bg-white/10 px-2 py-0.5 text-white/80">
                                      {s.name}
                                    </span>
                                    <span className="text-emerald-300">
                                      {fmtMin(s.m)}
                                    </span>
                                  </span>
                                </li>
                              ))}
                            </ul>
                          ) : v.n && Object.keys(v.n).length > 0 ? (
                            <div className="flex flex-wrap gap-1.5">
                              {Object.entries(v.n).map(([name, min]) => (
                                <span
                                  key={name}
                                  className="rounded-full bg-white/10 px-2.5 py-0.5 text-xs text-white/70"
                                >
                                  {name} · {fmtMin(min)}
                                </span>
                              ))}
                            </div>
                          ) : (
                            <p className="text-xs text-white/30">
                              No details saved for this day.
                            </p>
                          )}
                        </div>
                      )}
                    </li>
                  );
                })}
              </ul>
              <p className="mt-4 text-center text-xs tracking-wider text-white/40 uppercase">
                Total {totalSessions} sessions · {fmtMin(totalMinutes)}
              </p>
            </>
          )}
        </section>
      </div>
    </main>
  );
}