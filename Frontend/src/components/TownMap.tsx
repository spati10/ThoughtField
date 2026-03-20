// ThoughtField — frontend/src/components/TownMap.tsx
// Prompt 9 of 10.
//
// Canvas 2D renderer for the live town map.
// Draws the 40×40 tile grid, named areas, moving agent dots,
// and speech bubbles. Re-renders every time agents prop changes.
//
// Performance note: uses requestAnimationFrame via useEffect deps on agents.
// At 25 agents ticking every 2s, this redraws ~0.5× per second — very cheap.

"use client";

import { useEffect, useRef, useCallback } from "react";
import type { AgentState } from "@/hooks/useSimStore";

const TILE      = 14;     // px per tile
const GRID      = 40;     // tiles per side
const CANVAS_W  = TILE * GRID;   // 560px
const CANVAS_H  = TILE * GRID;   // 560px

interface Area {
  x: number; y: number;
  w: number; h: number;
  color: string;
  description?: string;
}

interface Props {
  agents:        Record<string, AgentState>;
  areas:         Record<string, Area>;
  selectedId:    string | null;
  onAgentClick:  (id: string) => void;
}

export default function TownMap({ agents, areas, selectedId, onAgentClick }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    ctx.clearRect(0, 0, CANVAS_W, CANVAS_H);

    // ----------------------------------------------------------------
    // Background
    // ----------------------------------------------------------------
    ctx.fillStyle = "#0f0f14";
    ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);

    // Subtle grid lines
    ctx.strokeStyle = "rgba(255,255,255,0.03)";
    ctx.lineWidth   = 0.5;
    for (let gx = 0; gx <= GRID; gx++) {
      ctx.beginPath();
      ctx.moveTo(gx * TILE, 0);
      ctx.lineTo(gx * TILE, CANVAS_H);
      ctx.stroke();
    }
    for (let gy = 0; gy <= GRID; gy++) {
      ctx.beginPath();
      ctx.moveTo(0, gy * TILE);
      ctx.lineTo(CANVAS_W, gy * TILE);
      ctx.stroke();
    }

    // ----------------------------------------------------------------
    // Areas
    // ----------------------------------------------------------------
    Object.entries(areas).forEach(([name, area]) => {
      const px = area.x * TILE;
      const py = area.y * TILE;
      const pw = area.w * TILE;
      const ph = area.h * TILE;

      // Fill with area color at low opacity
      ctx.fillStyle = area.color + "28";
      _roundRect(ctx, px, py, pw, ph, 4);
      ctx.fill();

      // Border
      ctx.strokeStyle = area.color + "70";
      ctx.lineWidth   = 0.75;
      _roundRect(ctx, px, py, pw, ph, 4);
      ctx.stroke();

      // Label — centered in area
      const label = name.replace(/_/g, " ");
      ctx.fillStyle   = area.color + "cc";
      ctx.font        = `${Math.max(7, Math.min(10, area.w * 1.8))}px sans-serif`;
      ctx.textAlign   = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(
        label,
        px + pw / 2,
        py + ph / 2,
        pw - 4,
      );
    });

    // ----------------------------------------------------------------
    // Agents
    // ----------------------------------------------------------------
    const agentList = Object.values(agents);

    agentList.forEach((agent) => {
      const ax = agent.x * TILE + TILE / 2;
      const ay = agent.y * TILE + TILE / 2;
      const isSelected = agent.id === selectedId;
      const radius     = isSelected ? 7 : 5;

      // Selection ring
      if (isSelected) {
        ctx.beginPath();
        ctx.arc(ax, ay, radius + 3, 0, Math.PI * 2);
        ctx.strokeStyle = agent.color;
        ctx.lineWidth   = 1.5;
        ctx.stroke();
      }

      // Agent dot
      ctx.beginPath();
      ctx.arc(ax, ay, radius, 0, Math.PI * 2);
      ctx.fillStyle = agent.color;
      ctx.fill();

      // White inner highlight
      ctx.beginPath();
      ctx.arc(ax - 1, ay - 1, radius * 0.35, 0, Math.PI * 2);
      ctx.fillStyle = "rgba(255,255,255,0.4)";
      ctx.fill();

      // Speech bubble
      if (agent.speaking) {
        const rawText  = agent.speaking.slice(0, 32) + (agent.speaking.length > 32 ? "…" : "");
        const fontSize = 8;
        ctx.font = `${fontSize}px sans-serif`;
        const tw  = ctx.measureText(rawText).width;
        const bw  = tw + 10;
        const bh  = 13;
        const bx  = ax - bw / 2;
        const by  = ay - radius - bh - 6;

        // Bubble background
        ctx.fillStyle = "rgba(255,255,255,0.95)";
        _roundRect(ctx, bx, by, bw, bh, 3);
        ctx.fill();

        // Bubble tail
        ctx.beginPath();
        ctx.moveTo(ax - 3, by + bh);
        ctx.lineTo(ax + 3, by + bh);
        ctx.lineTo(ax, by + bh + 4);
        ctx.closePath();
        ctx.fillStyle = "rgba(255,255,255,0.95)";
        ctx.fill();

        // Text
        ctx.fillStyle    = "#111";
        ctx.textAlign    = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(rawText, ax, by + bh / 2);
      }
    });

    // ----------------------------------------------------------------
    // Agent name labels (only when selected or very few agents)
    // ----------------------------------------------------------------
    if (agentList.length <= 8 || selectedId) {
      agentList.forEach((agent) => {
        if (agent.id !== selectedId && agentList.length > 8) return;
        const ax = agent.x * TILE + TILE / 2;
        const ay = agent.y * TILE + TILE / 2 + 10;
        const firstName = agent.name.split(" ")[0];
        ctx.font         = "7px sans-serif";
        ctx.fillStyle    = agent.color + "dd";
        ctx.textAlign    = "center";
        ctx.textBaseline = "top";
        ctx.fillText(firstName, ax, ay);
      });
    }
  }, [agents, areas, selectedId]);

  useEffect(() => {
    draw();
  }, [draw]);

  // Handle click — find nearest agent within 10px
  function handleClick(e: React.MouseEvent<HTMLCanvasElement>) {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect  = canvas.getBoundingClientRect();
    const scaleX = CANVAS_W / rect.width;
    const scaleY = CANVAS_H / rect.height;
    const mx    = (e.clientX - rect.left) * scaleX;
    const my    = (e.clientY - rect.top)  * scaleY;

    let closest: AgentState | null = null;
    let closestDist = 12;   // px threshold

    Object.values(agents).forEach((agent) => {
      const ax   = agent.x * TILE + TILE / 2;
      const ay   = agent.y * TILE + TILE / 2;
      const dist = Math.hypot(mx - ax, my - ay);
      if (dist < closestDist) {
        closest     = agent;
        closestDist = dist;
      }
    });

    if (closest) onAgentClick((closest as AgentState).id);
  }

  return (
    <canvas
      ref={canvasRef}
      width={CANVAS_W}
      height={CANVAS_H}
      onClick={handleClick}
      style={{
        width:        "100%",
        height:       "auto",
        cursor:       "crosshair",
        borderRadius: "8px",
        border:       "0.5px solid rgba(255,255,255,0.1)",
        display:      "block",
      }}
    />
  );
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function _roundRect(
  ctx: CanvasRenderingContext2D,
  x: number, y: number,
  w: number, h: number,
  r: number,
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