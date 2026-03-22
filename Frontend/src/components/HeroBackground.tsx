"use client";

import { useEffect, useRef } from "react";

// ─── types ────────────────────────────────────────────────────────────────────
interface AgentDot {
  id: number;
  name: string;
  color: string;
  glow: string;
  label: string;
  x: number;
  y: number;
  vx: number;
  vy: number;
  r: number;
  pulse: number;
  pulseSpeed: number;
  speaking: boolean;
  speech: string;
  speechTimer: number;
  speechTarget: number;
  speakCooldown: number;
}

// ─── constants ────────────────────────────────────────────────────────────────
const AGENT_NAMES = [
  "Isabella", "John",   "Maya",  "Carlos", "Sarah",
  "Ahmed",    "Liu",    "Emma",  "Raj",    "Nina",
  "Felix",    "Aisha",  "Omar",  "Priya",  "Tom",
  "Zara",     "Leo",    "Kenji", "Diana",  "Marcus",
  "Sourav",      "Trump",  "Biden",   "Mohammed", "Mercelo",
];

const AGENT_COLORS = [
  { main: "#4a57e4ff", glow: "rgba(175,169,236,", label: "#d0cdf5" },
  { main: "#7F77DD", glow: "rgba(127,119,221,", label: "#bbb4f0" },
  { main: "#1D9E75", glow: "rgba(29,158,117,",  label: "#4ecba0" },
  { main: "#D85A30", glow: "rgba(216,90,48,",   label: "#f0845a" },
  { main: "#BA7517", glow: "rgba(186,117,23,",  label: "#e0a040" },
  { main: "#D4537E", glow: "rgba(212,83,126,",  label: "#f08aaa" },
];

const SPEECH_PHRASES = [
  `"Have you heard?"`,
  `"We need to act."`,
  `"I don't trust them."`,
  `"What do you think?"`,
  `"Did you see this?"`,
  `"Are you joining us?"`,
  `"This changes things."`,
  `"Something's off."`,
  `"Are you sure?"`,
  `"I saw it happen."`,
  `"you are going to the uni?"`,
  `"Let's have some chitchat"`,
  `"wanna go to the caffe?"`,
];

// ─── props ────────────────────────────────────────────────────────────────────
interface HeroBackgroundProps {
  /** Number of agents to render. Default: 25 */
  agentCount?: number;
  /** Canvas opacity. Default: 0.85 */
  opacity?: number;
  /** Background base color. Default: "#08081a" */
  bgColor?: string;
}

// ─── helpers ──────────────────────────────────────────────────────────────────
function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number, y: number,
  w: number, h: number,
  r: number
) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

function createAgent(i: number, W: number, H: number): AgentDot {
  const col = AGENT_COLORS[i % AGENT_COLORS.length];
  return {
    id: i,
    name: AGENT_NAMES[i % AGENT_NAMES.length],
    color: col.main,
    glow: col.glow,
    label: col.label,
    x: 60 + Math.random() * (W - 120),
    y: 60 + Math.random() * (H - 120),
    vx: (Math.random() - 0.5) * 0.55,
    vy: (Math.random() - 0.5) * 0.55,
    r: 5 + Math.random() * 4,
    pulse: Math.random() * Math.PI * 2,
    pulseSpeed: 0.025 + Math.random() * 0.02,
    speaking: false,
    speech: "",
    speechTimer: 0,
    speechTarget: -1,
    speakCooldown: 120 + Math.floor(Math.random() * 200),
  };
}

function updateAgent(a: AgentDot, agents: AgentDot[], W: number, H: number) {
  // move
  a.x += a.vx;
  a.y += a.vy;

  // bounce off walls
  if (a.x < a.r + 8)     { a.x = a.r + 8;     a.vx =  Math.abs(a.vx); }
  if (a.x > W - a.r - 8) { a.x = W - a.r - 8; a.vx = -Math.abs(a.vx); }
  if (a.y < a.r + 8)     { a.y = a.r + 8;     a.vy =  Math.abs(a.vy); }
  if (a.y > H - a.r - 8) { a.y = H - a.r - 8; a.vy = -Math.abs(a.vy); }

  // gentle flocking toward nearby agents
  let fx = 0, fy = 0, count = 0;
  agents.forEach((b) => {
    if (b.id === a.id) return;
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const d  = Math.sqrt(dx * dx + dy * dy);
    if (d < 120 && d > 0) {
      fx += dx / d;
      fy += dy / d;
      count++;
      // separation if too close
      if (d < 30) {
        a.vx -= (dx / d) * 0.04;
        a.vy -= (dy / d) * 0.04;
      }
    }
  });
  if (count > 0) {
    a.vx += (fx / count) * 0.003;
    a.vy += (fy / count) * 0.003;
  }

  // speed clamp
  const sp = Math.sqrt(a.vx * a.vx + a.vy * a.vy);
  if (sp > 0.9)  { a.vx = (a.vx / sp) * 0.9;  a.vy = (a.vy / sp) * 0.9;  }
  if (sp < 0.1)  { a.vx += (Math.random() - 0.5) * 0.1; a.vy += (Math.random() - 0.5) * 0.1; }

  // pulse
  a.pulse += a.pulseSpeed;

  // speech cooldown tick
  a.speakCooldown--;
  if (a.speakCooldown <= 0 && !a.speaking) {
    // find nearest agent within range
    let nearest: AgentDot | null = null;
    let nearD = 999;
    agents.forEach((b) => {
      if (b.id === a.id) return;
      const d = Math.hypot(b.x - a.x, b.y - a.y);
      if (d < nearD) { nearD = d; nearest = b; }
    });
    if (nearest && nearD < 140) {
      a.speaking     = true;
      a.speechTarget = (nearest as AgentDot).id;
      a.speech       = SPEECH_PHRASES[Math.floor(Math.random() * SPEECH_PHRASES.length)];
      a.speechTimer  = 90 + Math.floor(Math.random() * 60);
    }
    a.speakCooldown = 180 + Math.floor(Math.random() * 240);
  }

  if (a.speaking) {
    a.speechTimer--;
    if (a.speechTimer <= 0) {
      a.speaking = false;
      a.speech   = "";
    }
  }
}

function drawAgent(
  ctx: CanvasRenderingContext2D,
  a: AgentDot,
  agents: AgentDot[]
) {
  const p     = Math.sin(a.pulse);
  const glowR = a.r + 4 + p * 3;

  // ── connection lines to nearby agents ──────────────────────────────────
  agents.forEach((b) => {
    if (b.id <= a.id) return;
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const d  = Math.sqrt(dx * dx + dy * dy);
    if (d < 110) {
      const alpha = (1 - d / 110) * 0.25;
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
      ctx.strokeStyle = a.glow + alpha + ")";
      ctx.lineWidth   = 0.75;
      ctx.stroke();
    }
  });

  // ── dashed speaking line to target ─────────────────────────────────────
  if (a.speaking && a.speechTarget >= 0) {
    const ta = agents[a.speechTarget];
    if (ta) {
      const fade = a.speechTimer > 20 ? 1 : a.speechTimer / 20;
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(ta.x, ta.y);
      ctx.strokeStyle = a.glow + 0.55 * fade + ")";
      ctx.lineWidth   = 1.5;
      ctx.setLineDash([4, 5]);
      ctx.stroke();
      ctx.setLineDash([]);
    }
  }

  // ── outer glow halo ────────────────────────────────────────────────────
  const grad = ctx.createRadialGradient(
    a.x, a.y, a.r * 0.3,
    a.x, a.y, glowR * 2.2
  );
  grad.addColorStop(0, a.glow + (0.28 + p * 0.1) + ")");
  grad.addColorStop(1, a.glow + "0)");
  ctx.beginPath();
  ctx.arc(a.x, a.y, glowR * 2.2, 0, Math.PI * 2);
  ctx.fillStyle = grad;
  ctx.fill();

  // ── dot body ───────────────────────────────────────────────────────────
  ctx.beginPath();
  ctx.arc(a.x, a.y, a.r, 0, Math.PI * 2);
  ctx.fillStyle = a.color;
  ctx.fill();

  // ── inner highlight ────────────────────────────────────────────────────
  ctx.beginPath();
  ctx.arc(a.x - a.r * 0.28, a.y - a.r * 0.28, a.r * 0.38, 0, Math.PI * 2);
  ctx.fillStyle = "rgba(255,255,255,.35)";
  ctx.fill();

  // ── name label ─────────────────────────────────────────────────────────
  ctx.font         = "500 9.5px -apple-system, sans-serif";
  ctx.textAlign    = "center";
  ctx.fillStyle    = a.label;
  ctx.globalAlpha  = 0.85;
  ctx.fillText(a.name, a.x, a.y - a.r - 7);
  ctx.globalAlpha  = 1;

  // ── speech bubble ──────────────────────────────────────────────────────
  if (a.speaking && a.speech) {
    const fade = a.speechTimer > 20 ? 1 : a.speechTimer / 20;
    ctx.globalAlpha = fade;

    const by = a.y - a.r - 22;
    ctx.font     = "9.5px -apple-system, sans-serif";
    const tw     = ctx.measureText(a.speech).width;
    const bw     = tw + 14;
    const bh     = 18;

    // bubble background
    ctx.fillStyle = "rgba(18,18,40,.92)";
    roundRect(ctx, a.x - bw / 2, by - bh, bw, bh, 5);
    ctx.fill();

    // bubble border
    ctx.strokeStyle = a.glow + ".5)";
    ctx.lineWidth   = 0.75;
    roundRect(ctx, a.x - bw / 2, by - bh, bw, bh, 5);
    ctx.stroke();

    // tail triangle
    ctx.beginPath();
    ctx.moveTo(a.x - 4, by);
    ctx.lineTo(a.x + 4, by);
    ctx.lineTo(a.x,     by + 5);
    ctx.closePath();
    ctx.fillStyle = "rgba(18,18,40,.92)";
    ctx.fill();

    // speech text
    ctx.font      = "9.5px -apple-system, sans-serif";
    ctx.fillStyle = a.label;
    ctx.textAlign = "center";
    ctx.fillText(a.speech, a.x, by - 5);
    ctx.globalAlpha = 1;
  }
}

// ─── component ────────────────────────────────────────────────────────────────
export default function HeroBackground({
  agentCount = 50,
  opacity    = 0.85,
  bgColor    = "#08081a",
}: HeroBackgroundProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const agentsRef = useRef<AgentDot[]>([]);
  const rafRef    = useRef<number>(0);

  useEffect(() => {
    const cv = canvasRef.current;
    if (!cv) return;
    const ctx = cv.getContext("2d");
    if (!ctx) return;

    // make canvas fill its parent container
    const resize = () => {
      const rect = cv.parentElement?.getBoundingClientRect();
      if (rect) {
        cv.width  = Math.round(rect.width);
        cv.height = Math.round(rect.height);
        // re-scatter agents when canvas resizes
        agentsRef.current = Array.from(
          { length: agentCount },
          (_, i) => createAgent(i, cv.width, cv.height)
        );
      }
    };

    resize();
    const ro = new ResizeObserver(resize);
    if (cv.parentElement) ro.observe(cv.parentElement);

    function loop() {
      const W = cv.width;
      const H = cv.height;
      if (!W || !H) { rafRef.current = requestAnimationFrame(loop); return; }

      // semi-transparent fill creates a subtle motion trail
      ctx.fillStyle = "rgba(8,8,26,.82)";
      ctx.fillRect(0, 0, W, H);

      // soft center radial ambiance
      const amb = ctx.createRadialGradient(W / 2, H / 2, 0, W / 2, H / 2, 280);
      amb.addColorStop(0, "rgba(83,74,183,.06)");
      amb.addColorStop(1, "transparent");
      ctx.fillStyle = amb;
      ctx.fillRect(0, 0, W, H);

      const ag = agentsRef.current;
      ag.forEach((a) => updateAgent(a, ag, W, H));
      ag.forEach((a) => drawAgent(ctx, a, ag));

      rafRef.current = requestAnimationFrame(loop);
    }

    loop();

    return () => {
      cancelAnimationFrame(rafRef.current);
      ro.disconnect();
    };
  }, [agentCount]);

  return (
    <canvas
      ref={canvasRef}
      style={{
        position:   "absolute",
        top:        0,
        left:       0,
        width:      "100%",
        height:     "100%",
        opacity,
        background: bgColor,
        display:    "block",
      }}
    />
  );
}