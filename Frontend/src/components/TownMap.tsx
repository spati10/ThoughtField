"use client";

import { useEffect, useRef, useCallback, useState } from "react";
import type { AgentState } from "@/hooks/useSimStore";

// ─── constants ────────────────────────────────────────────────────────────────

const TILE     = 14;
const GRID     = 40;
const CANVAS_W = TILE * GRID;   // 560px
const CANVAS_H = TILE * GRID;   // 560px

// Each area gets its own color scheme + emoji icon
const AREA_STYLES: Record<string, {
  fill: string; border: string; labelColor: string; icon: string; iconSize: number;
}> = {
  cafe:             { fill:"#1e1508", border:"#BA7517", labelColor:"#EF9F27", icon:"☕", iconSize:13 },
  park:             { fill:"#081a0b", border:"#3B6D11", labelColor:"#97C459", icon:"🌳", iconSize:13 },
  library:          { fill:"#071122", border:"#185FA5", labelColor:"#85B7EB", icon:"📚", iconSize:12 },
  town_square:      { fill:"#0f0f20", border:"#534AB7", labelColor:"#AFA9EC", icon:"⬡",  iconSize:15 },
  office:           { fill:"#0a1218", border:"#378ADD", labelColor:"#85B7EB", icon:"🏢", iconSize:12 },
  school:           { fill:"#091616", border:"#0F6E56", labelColor:"#5DCAA5", icon:"🎓", iconSize:12 },
  market:           { fill:"#1a0f06", border:"#993C1D", labelColor:"#F0997B", icon:"🛒", iconSize:12 },
  community_center: { fill:"#100e22", border:"#534AB7", labelColor:"#CECBF6", icon:"🏛",  iconSize:12 },
  house_A:          { fill:"#180a0a", border:"#712B13", labelColor:"#F5C4B3", icon:"⌂",  iconSize:14 },
  house_B:          { fill:"#180a0a", border:"#712B13", labelColor:"#F5C4B3", icon:"⌂",  iconSize:14 },
  house_C:          { fill:"#180a0a", border:"#712B13", labelColor:"#F5C4B3", icon:"⌂",  iconSize:14 },
  house_D:          { fill:"#180a0a", border:"#712B13", labelColor:"#F5C4B3", icon:"⌂",  iconSize:14 },
  house_E:          { fill:"#180a0a", border:"#712B13", labelColor:"#F5C4B3", icon:"⌂",  iconSize:14 },
};

const DEFAULT_STYLE = {
  fill:"#0d0d1a", border:"#534AB7", labelColor:"#AFA9EC", icon:"◆", iconSize:11,
};

// ─── types ────────────────────────────────────────────────────────────────────

interface WorldArea {
  x: number; y: number; w: number; h: number;
  color?: string; description?: string;
}

interface Props {
  agents:       Record<string, AgentState>;
  areas:        Record<string, WorldArea>;
  selectedId:   string | null;
  onAgentClick: (id: string) => void;
}

interface Tooltip {
  visible: boolean; x: number; y: number;
  areaName: string; agentCount: number; description: string;
}

// ─── helpers ──────────────────────────────────────────────────────────────────

function rrect(
  ctx: CanvasRenderingContext2D,
  x: number, y: number, w: number, h: number, r: number
) {
  const R = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + R, y);
  ctx.lineTo(x + w - R, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + R);
  ctx.lineTo(x + w, y + h - R);
  ctx.quadraticCurveTo(x + w, y + h, x + w - R, y + h);
  ctx.lineTo(x + R, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - R);
  ctx.lineTo(x, y + R);
  ctx.quadraticCurveTo(x, y, x + R, y);
  ctx.closePath();
}

function prettyName(raw: string): string {
  if (raw.startsWith("house_")) return "Home";
  return raw.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

function agentsInArea(agents: Record<string, AgentState>, area: WorldArea): AgentState[] {
  return Object.values(agents).filter(
    (a) => a.x >= area.x && a.x <= area.x + area.w &&
           a.y >= area.y && a.y <= area.y + area.h
  );
}

// ─── component ────────────────────────────────────────────────────────────────

export default function TownMap({ agents, areas, selectedId, onAgentClick }: Props) {
  const canvasRef   = useRef<HTMLCanvasElement>(null);
  const hoveredArea = useRef<string | null>(null);
  const [tip, setTip] = useState<Tooltip>({
    visible: false, x: 0, y: 0, areaName: "", agentCount: 0, description: "",
  });

  const draw = useCallback(() => {
    const cv = canvasRef.current;
    if (!cv) return;
    const ctx = cv.getContext("2d");
    if (!ctx) return;

    ctx.clearRect(0, 0, CANVAS_W, CANVAS_H);

    // ── dark base ──────────────────────────────────────────────────────
    ctx.fillStyle = "#080810";
    ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);

    // dot grid
    ctx.fillStyle = "rgba(127,119,221,.07)";
    for (let gx = 0; gx < GRID; gx++)
      for (let gy = 0; gy < GRID; gy++)
        ctx.fillRect(gx * TILE + TILE / 2 - 0.5, gy * TILE + TILE / 2 - 0.5, 1, 1);

    // ── areas ──────────────────────────────────────────────────────────
    Object.entries(areas).forEach(([name, area]) => {
      const px      = area.x * TILE;
      const py      = area.y * TILE;
      const pw      = area.w * TILE;
      const ph      = area.h * TILE;
      const st      = AREA_STYLES[name] ?? DEFAULT_STYLE;
      const hovered = hoveredArea.current === name;
      const inside  = agentsInArea(agents, area);
      const busy    = inside.length > 0;

      // filled bg
      ctx.fillStyle = st.fill;
      rrect(ctx, px + 1, py + 1, pw - 2, ph - 2, 5);
      ctx.fill();

      // activity glow when agents present
      if (busy) {
        const g = ctx.createRadialGradient(
          px + pw / 2, py + ph / 2, 0,
          px + pw / 2, py + ph / 2, Math.max(pw, ph) * 0.65
        );
        g.addColorStop(0, st.border + "22");
        g.addColorStop(1, "transparent");
        ctx.fillStyle = g;
        rrect(ctx, px + 1, py + 1, pw - 2, ph - 2, 5);
        ctx.fill();
      }

      // hover tint
      if (hovered) {
        ctx.fillStyle = st.border + "18";
        rrect(ctx, px + 1, py + 1, pw - 2, ph - 2, 5);
        ctx.fill();
      }

      // border
      ctx.strokeStyle = hovered ? st.border + "dd"
        : busy         ? st.border + "88"
        :                st.border + "44";
      ctx.lineWidth   = hovered ? 1.5 : 0.75;
      rrect(ctx, px + 1, py + 1, pw - 2, ph - 2, 5);
      ctx.stroke();

      // icon + label — only if area is tall/wide enough
      if (pw >= 24 && ph >= 22) {
        const cx = px + pw / 2;
        const cy = py + ph / 2;

        // emoji icon
        ctx.globalAlpha  = hovered ? 1 : busy ? 0.8 : 0.5;
        ctx.font         = `${st.iconSize}px serif`;
        ctx.textAlign    = "center";
        ctx.textBaseline = "middle";
        ctx.fillStyle    = st.labelColor;
        ctx.fillText(st.icon, cx, cy - 7);
        ctx.globalAlpha  = 1;

        // name label
        const label    = prettyName(name);
        const fontSize = Math.max(7, Math.min(9, pw / label.length * 1.05));
        ctx.font          = `500 ${fontSize}px -apple-system, sans-serif`;
        ctx.textAlign     = "center";
        ctx.textBaseline  = "alphabetic";
        ctx.fillStyle     = hovered ? st.labelColor
          : busy           ? st.labelColor + "cc"
          :                  st.labelColor + "77";
        ctx.fillText(label, cx, cy + 9, pw - 8);
      }

      // agent count badge (top-right)
      if (inside.length > 0) {
        const bx = px + pw - 3;
        const by = py + 3;
        ctx.fillStyle = st.border + "cc";
        rrect(ctx, bx - 13, by, 14, 12, 3);
        ctx.fill();
        ctx.font          = "600 7.5px -apple-system, sans-serif";
        ctx.textAlign     = "center";
        ctx.textBaseline  = "middle";
        ctx.fillStyle     = "#fff";
        ctx.fillText(String(inside.length), bx - 6, by + 6);
      }
    });

    // ── agent connections (speaking) ───────────────────────────────────
    Object.values(agents).forEach((agent) => {
      if (!agent.speaking_to) return;
      const target = Object.values(agents).find((a) => a.name === agent.speaking_to);
      if (!target) return;
      ctx.beginPath();
      ctx.moveTo(agent.x * TILE + TILE / 2, agent.y * TILE + TILE / 2);
      ctx.lineTo(target.x * TILE + TILE / 2, target.y * TILE + TILE / 2);
      ctx.strokeStyle = "rgba(175,169,236,.3)";
      ctx.lineWidth   = 1;
      ctx.setLineDash([3, 4]);
      ctx.stroke();
      ctx.setLineDash([]);
    });

    // ── agents ─────────────────────────────────────────────────────────
    Object.values(agents).forEach((agent) => {
      const ax         = agent.x * TILE + TILE / 2;
      const ay         = agent.y * TILE + TILE / 2;
      const isSelected = agent.id === selectedId;
      const isSpeaking = !!agent.speaking;
      const r          = isSelected ? 7 : 5.5;

      // selection rings
      if (isSelected) {
        ctx.beginPath(); ctx.arc(ax, ay, r + 5, 0, Math.PI * 2);
        ctx.strokeStyle = agent.color + "44"; ctx.lineWidth = 1; ctx.stroke();
        ctx.beginPath(); ctx.arc(ax, ay, r + 3, 0, Math.PI * 2);
        ctx.strokeStyle = agent.color + "99"; ctx.lineWidth = 1.5; ctx.stroke();
      }
      if (isSpeaking) {
        ctx.beginPath(); ctx.arc(ax, ay, r + 3, 0, Math.PI * 2);
        ctx.strokeStyle = agent.color + "55"; ctx.lineWidth = 1; ctx.stroke();
      }

      // glow
      const g = ctx.createRadialGradient(ax, ay, 0, ax, ay, r * 2.8);
      g.addColorStop(0, agent.color + "44"); g.addColorStop(1, agent.color + "00");
      ctx.beginPath(); ctx.arc(ax, ay, r * 2.8, 0, Math.PI * 2);
      ctx.fillStyle = g; ctx.fill();

      // dot
      ctx.beginPath(); ctx.arc(ax, ay, r, 0, Math.PI * 2);
      ctx.fillStyle = agent.color; ctx.fill();

      // highlight
      ctx.beginPath(); ctx.arc(ax - r * .25, ay - r * .25, r * .35, 0, Math.PI * 2);
      ctx.fillStyle = "rgba(255,255,255,.38)"; ctx.fill();

      // name label
      const showName = isSelected || Object.keys(agents).length <= 12;
      if (showName) {
        ctx.font = "500 8.5px -apple-system, sans-serif";
        ctx.textAlign = "center"; ctx.textBaseline = "alphabetic";
        ctx.fillStyle = agent.color + "ee";
        ctx.fillText(agent.name.split(" ")[0], ax, ay - r - 4);
      }

      // speech bubble
      if (agent.speaking) {
        const txt = agent.speaking.slice(0, 28) + (agent.speaking.length > 28 ? "…" : "");
        ctx.font  = "8.5px -apple-system, sans-serif";
        const tw  = ctx.measureText(txt).width;
        const bw  = tw + 12; const bh = 15;
        const bxR = Math.max(2, Math.min(CANVAS_W - bw - 2, ax - bw / 2));
        const byT = ay - r - bh - 8;
        ctx.fillStyle = "rgba(12,12,32,.95)"; rrect(ctx, bxR, byT, bw, bh, 4); ctx.fill();
        ctx.strokeStyle = agent.color + "88"; ctx.lineWidth = .75;
        rrect(ctx, bxR, byT, bw, bh, 4); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(ax - 3, byT + bh); ctx.lineTo(ax + 3, byT + bh);
        ctx.lineTo(ax, byT + bh + 4); ctx.closePath();
        ctx.fillStyle = "rgba(12,12,32,.95)"; ctx.fill();
        ctx.fillStyle = "rgba(232,230,250,.92)";
        ctx.textAlign = "center"; ctx.textBaseline = "middle";
        ctx.fillText(txt, bxR + bw / 2, byT + bh / 2);
      }
    });
  }, [agents, areas, selectedId]);

  useEffect(() => { draw(); }, [draw]);

  // ── interaction ───────────────────────────────────────────────────────────

  function scaled(e: React.MouseEvent<HTMLCanvasElement>) {
    const cv   = canvasRef.current!;
    const rect = cv.getBoundingClientRect();
    return {
      mx: (e.clientX - rect.left) * (CANVAS_W / rect.width),
      my: (e.clientY - rect.top)  * (CANVAS_H / rect.height),
      rx: e.clientX - rect.left,
      ry: e.clientY - rect.top,
    };
  }

  function areaAt(mx: number, my: number): string | null {
    for (const [name, area] of Object.entries(areas)) {
      if (mx >= area.x * TILE && mx <= (area.x + area.w) * TILE &&
          my >= area.y * TILE && my <= (area.y + area.h) * TILE)
        return name;
    }
    return null;
  }

  function agentAt(mx: number, my: number): AgentState | null {
    let best: AgentState | null = null; let bestD = 10;
    Object.values(agents).forEach((a) => {
      const d = Math.hypot(a.x * TILE + TILE / 2 - mx, a.y * TILE + TILE / 2 - my);
      if (d < bestD) { bestD = d; best = a; }
    });
    return best;
  }

  function handleMouseMove(e: React.MouseEvent<HTMLCanvasElement>) {
    const { mx, my, rx, ry } = scaled(e);
    const area = areaAt(mx, my);
    if (area !== hoveredArea.current) {
      hoveredArea.current = area;
      draw();
      if (area) {
        const ad = areas[area];
        setTip({
          visible:     true,
          x:           rx + 14,
          y:           ry - 44,
          areaName:    prettyName(area),
          agentCount:  agentsInArea(agents, ad).length,
          description: ad.description ?? prettyName(area),
        });
      } else {
        setTip((t) => ({ ...t, visible: false }));
      }
    }
  }

  function handleLeave() {
    hoveredArea.current = null;
    setTip((t) => ({ ...t, visible: false }));
    draw();
  }

  function handleClick(e: React.MouseEvent<HTMLCanvasElement>) {
    const { mx, my } = scaled(e);
    const hit = agentAt(mx, my);
    if (hit) onAgentClick(hit.id);
  }

  return (
    <div style={{ position: "relative", width: "100%", display: "inline-block" }}>
      <canvas
        ref={canvasRef}
        width={CANVAS_W} height={CANVAS_H}
        onMouseMove={handleMouseMove}
        onMouseLeave={handleLeave}
        onClick={handleClick}
        style={{ width: "100%", height: "auto", cursor: "crosshair", display: "block", borderRadius: 10, border: "0.5px solid rgba(127,119,221,.15)" }}
      />

      {/* hover tooltip */}
      {tip.visible && (
        <div style={{ position: "absolute", left: tip.x, top: tip.y, background: "rgba(10,10,28,.97)", border: "0.5px solid rgba(127,119,221,.3)", borderRadius: 8, padding: "7px 12px", pointerEvents: "none", zIndex: 50, maxWidth: 200 }}>
          <div style={{ fontSize: 12, fontWeight: 500, color: "#AFA9EC", marginBottom: 2 }}>{tip.areaName}</div>
          <div style={{ fontSize: 11, color: "rgba(175,169,236,.5)", lineHeight: 1.45, marginBottom: tip.agentCount > 0 ? 4 : 0, whiteSpace: "normal" }}>{tip.description}</div>
          {tip.agentCount > 0 && (
            <div style={{ fontSize: 10, color: "#4ecba0", display: "flex", alignItems: "center", gap: 4 }}>
              <div style={{ width: 5, height: 5, borderRadius: "50%", background: "#4ecba0" }} />
              {tip.agentCount} agent{tip.agentCount > 1 ? "s" : ""} here
            </div>
          )}
        </div>
      )}

      {/* legend */}
      <div style={{ marginTop: 8, display: "flex", gap: 10, flexWrap: "wrap", fontSize: 10, color: "rgba(127,119,221,.38)", padding: "0 2px" }}>
        {[
          { color: "#BA7517", label: "Cafe / market" },
          { color: "#3B6D11", label: "Park"          },
          { color: "#185FA5", label: "Library"       },
          { color: "#534AB7", label: "Town square"   },
          { color: "#712B13", label: "Homes"         },
          { color: "#0F6E56", label: "School / community" },
        ].map((l) => (
          <div key={l.label} style={{ display: "flex", alignItems: "center", gap: 4 }}>
            <div style={{ width: 8, height: 8, borderRadius: 2, background: l.color + "66", border: `0.5px solid ${l.color}` }} />
            {l.label}
          </div>
        ))}
        <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
          <div style={{ width: 8, height: 8, borderRadius: "50%", background: "rgba(175,169,236,.6)" }} />
          Agent · click to inspect
        </div>
      </div>
    </div>
  );
}
