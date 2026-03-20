// ThoughtField — frontend/src/components/ReportView.tsx
// Reusable report display component extracted from app/report/[id]/page.tsx.
// Import this wherever you want to render a ReportData object.
// The report/[id]/page.tsx handles fetching; this handles display.

"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { ReportData } from "@/lib/types";

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function ConfidenceArc({ value }: { value: number }) {
  const pct    = Math.max(0, Math.min(1, value));
  const r      = 52;
  const cx     = 70;
  const cy     = 70;
  const startA = -210;
  const endA   = startA + pct * 240;

  function polar(angleDeg: number) {
    const rad = (angleDeg * Math.PI) / 180;
    return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) };
  }

  const trackEnd = polar(startA + 240);
  const arcStart = polar(startA);
  const arcEnd   = polar(endA);
  const large    = pct * 240 > 180 ? 1 : 0;

  const color =
    pct >= 0.7 ? "#1D9E75" :
    pct >= 0.4 ? "#BA7517" :
                 "#E24B4A";

  return (
    <svg width={140} height={90} viewBox="0 0 140 90">
      <path
        d={`M ${polar(startA).x} ${polar(startA).y} A ${r} ${r} 0 1 1 ${trackEnd.x} ${trackEnd.y}`}
        fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth={8} strokeLinecap="round"
      />
      {pct > 0 && (
        <path
          d={`M ${arcStart.x} ${arcStart.y} A ${r} ${r} 0 ${large} 1 ${arcEnd.x} ${arcEnd.y}`}
          fill="none" stroke={color} strokeWidth={8} strokeLinecap="round"
        />
      )}
      <text x={cx} y={cy + 4} textAnchor="middle" dominantBaseline="middle"
        fill={color} fontSize={20} fontWeight={500} fontFamily="-apple-system,sans-serif">
        {Math.round(pct * 100)}%
      </text>
      <text x={cx} y={cy + 22} textAnchor="middle"
        fill="rgba(255,255,255,0.3)" fontSize={9} fontFamily="-apple-system,sans-serif">
        confidence
      </text>
    </svg>
  );
}

function ProbBar({ value }: { value: number }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
      <div style={{ flex: 1, height: 3, background: "rgba(255,255,255,0.08)", borderRadius: 2 }}>
        <div style={{
          height: "100%", width: `${Math.round(value * 100)}%`,
          background: "#BA7517", borderRadius: 2, transition: "width 0.6s ease",
        }} />
      </div>
      <span style={{ fontSize: 11, color: "rgba(255,255,255,0.35)", minWidth: 28, textAlign: "right" }}>
        {Math.round(value * 100)}%
      </span>
    </div>
  );
}

function TrajectoryBadge({ value }: { value: string }) {
  const map: Record<string, { color: string; bg: string }> = {
    escalating:  { color: "#E24B4A", bg: "rgba(226,75,74,0.12)"  },
    stabilizing: { color: "#BA7517", bg: "rgba(186,117,23,0.12)" },
    improving:   { color: "#1D9E75", bg: "rgba(29,158,117,0.12)" },
  };
  const c = map[value] ?? map.stabilizing;
  const label = value.charAt(0).toUpperCase() + value.slice(1);
  return (
    <div style={{
      display: "inline-flex", alignItems: "center", gap: 6,
      padding: "4px 12px", borderRadius: 20, background: c.bg,
      border: `0.5px solid ${c.color}44`,
    }}>
      <div style={{ width: 6, height: 6, borderRadius: "50%", background: c.color }} />
      <span style={{ fontSize: 12, fontWeight: 500, color: c.color }}>{label}</span>
    </div>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div style={{
      fontSize: 10, fontWeight: 500, color: "rgba(255,255,255,0.25)",
      letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: 12,
    }}>
      {children}
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 28 }}>
      <SectionLabel>{title}</SectionLabel>
      {children}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main ReportView component
// ---------------------------------------------------------------------------

interface Props {
  report:   ReportData;
  simId:    string;
  onNew?:   () => void;   // override navigation; defaults to router.push("/")
}

export default function ReportView({ report, simId, onNew }: Props) {
  const router   = useRouter();
  const [copied, setCopied]   = useState(false);
  const [expanded, setExpanded] = useState<Record<number, boolean>>({});

  function handleNew() {
    if (onNew) onNew();
    else router.push("/");
  }

  function copyText() {
    const lines = [
      "ThoughtField Prediction Report",
      `Question: ${report.question}`,
      "",
      "PREDICTED OUTCOME",
      report.predicted_outcome,
      "",
      `Confidence: ${Math.round(report.confidence * 100)}%`,
      `Trajectory: ${report.sentiment_trajectory}`,
      `Time horizon: ${report.time_horizon}`,
      "",
      "KEY DRIVERS",
      ...report.key_drivers.map((d) => `• ${d}`),
      "",
      "ALTERNATIVE SCENARIOS",
      ...report.alternative_scenarios.map(
        (s) => `• [${Math.round(s.probability * 100)}%] ${s.scenario}`
      ),
      "",
      "UNCERTAINTY",
      report.uncertainty_notes,
      "",
      "SIMULATION SUMMARY",
      report.simulation_summary,
    ];
    navigator.clipboard.writeText(lines.join("\n")).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  // ---- shared card style ----
  const card: React.CSSProperties = {
    padding: "10px 14px",
    background: "rgba(255,255,255,0.03)",
    border: "0.5px solid rgba(255,255,255,0.08)",
    borderRadius: 8,
  };

  return (
    <div style={{ color: "rgba(255,255,255,0.85)", fontFamily: "-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif" }}>

      {/* ---- Top bar ---- */}
      <div style={{
        display: "flex", alignItems: "center", justifyContent: "space-between",
        padding: "12px 32px", borderBottom: "0.5px solid rgba(255,255,255,0.08)",
        background: "rgba(255,255,255,0.02)", marginBottom: 0,
      }}>
        <span style={{ fontSize: 13, fontWeight: 500, color: "rgba(255,255,255,0.5)" }}>
          ThoughtField
        </span>
        <div style={{ display: "flex", gap: 10 }}>
          <button onClick={copyText} style={{
            padding: "6px 14px", background: "transparent",
            border: "0.5px solid rgba(255,255,255,0.15)", borderRadius: 6,
            color: "rgba(255,255,255,0.5)", cursor: "pointer", fontFamily: "inherit", fontSize: 12,
          }}>
            {copied ? "Copied ✓" : "Copy report"}
          </button>
          <button onClick={handleNew} style={{
            padding: "6px 14px", background: "transparent",
            border: "0.5px solid rgba(255,255,255,0.15)", borderRadius: 6,
            color: "rgba(255,255,255,0.5)", cursor: "pointer", fontFamily: "inherit", fontSize: 12,
          }}>
            New simulation
          </button>
        </div>
      </div>

      {/* ---- Content ---- */}
      <div style={{ maxWidth: 700, margin: "0 auto", padding: "40px 24px 60px" }}>

        {/* Question */}
        <div style={{ fontSize: 11, fontWeight: 500, color: "rgba(255,255,255,0.25)", letterSpacing: "0.07em", textTransform: "uppercase", marginBottom: 8 }}>Question</div>
        <div style={{ fontSize: 15, color: "rgba(255,255,255,0.6)", marginBottom: 32, fontStyle: "italic" }}>
          "{report.question}"
        </div>

        {/* ---- Hero card ---- */}
        <div style={{
          background: "rgba(255,255,255,0.03)",
          border: "0.5px solid rgba(255,255,255,0.1)",
          borderRadius: 12, padding: "24px 28px", marginBottom: 32,
          display: "flex", gap: 28, alignItems: "flex-start", flexWrap: "wrap",
        }}>
          <div style={{ flex: 1, minWidth: 220 }}>
            <SectionLabel>Predicted outcome</SectionLabel>
            <div style={{ fontSize: 16, lineHeight: 1.65, color: "rgba(255,255,255,0.9)", marginBottom: 16 }}>
              {report.predicted_outcome}
            </div>
            <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
              <TrajectoryBadge value={report.sentiment_trajectory} />
              <span style={{ fontSize: 12, color: "rgba(255,255,255,0.3)" }}>{report.time_horizon}</span>
            </div>
          </div>
          <ConfidenceArc value={report.confidence} />
        </div>

        {/* Simulation summary */}
        <Section title="What happened in the simulation">
          <div style={{
            fontSize: 13.5, lineHeight: 1.75, color: "rgba(255,255,255,0.55)",
            padding: "14px 16px", background: "rgba(255,255,255,0.03)",
            borderRadius: 8, borderLeft: "2px solid rgba(255,255,255,0.1)",
          }}>
            {report.simulation_summary}
          </div>
        </Section>

        {/* Key drivers */}
        <Section title="Key drivers">
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {report.key_drivers.map((driver, i) => (
              <div key={i} style={{ ...card, display: "flex", gap: 12, alignItems: "flex-start" }}>
                <div style={{
                  width: 20, height: 20, borderRadius: 4, flexShrink: 0, marginTop: 1,
                  background: "rgba(127,119,221,0.15)", border: "0.5px solid rgba(127,119,221,0.3)",
                  color: "#AFA9EC", fontSize: 10, fontWeight: 500,
                  display: "flex", alignItems: "center", justifyContent: "center",
                }}>
                  {i + 1}
                </div>
                <div style={{ fontSize: 13, lineHeight: 1.6, color: "rgba(255,255,255,0.7)" }}>
                  {driver}
                </div>
              </div>
            ))}
          </div>
        </Section>

        {/* Alternative scenarios */}
        {report.alternative_scenarios.length > 0 && (
          <Section title="Alternative scenarios">
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {report.alternative_scenarios.map((s, i) => (
                <div
                  key={i}
                  style={{ ...card, cursor: "pointer" }}
                  onClick={() => setExpanded((p) => ({ ...p, [i]: !p[i] }))}
                >
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12, marginBottom: 8 }}>
                    <div style={{ fontSize: 13, color: "rgba(255,255,255,0.7)", flex: 1 }}>{s.scenario}</div>
                    <span style={{ fontSize: 11, color: "rgba(255,255,255,0.3)", flexShrink: 0 }}>
                      {expanded[i] ? "▲" : "▼"}
                    </span>
                  </div>
                  <ProbBar value={s.probability} />
                  {expanded[i] && s.requires && (
                    <div style={{
                      marginTop: 10, padding: "8px 10px",
                      background: "rgba(255,255,255,0.04)", borderRadius: 6,
                      fontSize: 12, color: "rgba(255,255,255,0.4)", lineHeight: 1.6,
                    }}>
                      Requires: {s.requires}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </Section>
        )}

        {/* Faction dynamics */}
        {Object.keys(report.faction_dynamics).length > 0 && (
          <Section title="Faction dynamics">
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {Object.entries(report.faction_dynamics).map(([faction, desc]) => (
                <div key={faction} style={card}>
                  <div style={{ fontSize: 11, fontWeight: 500, color: "rgba(255,255,255,0.4)", marginBottom: 4 }}>
                    {faction}
                  </div>
                  <div style={{ fontSize: 13, color: "rgba(255,255,255,0.65)", lineHeight: 1.6 }}>{desc}</div>
                </div>
              ))}
            </div>
          </Section>
        )}

        {/* Key agents */}
        {report.key_agents.length > 0 && (
          <Section title="Most influential agents">
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              {report.key_agents.map((name) => (
                <div key={name} style={{
                  padding: "5px 12px",
                  background: "rgba(29,158,117,0.1)",
                  border: "0.5px solid rgba(29,158,117,0.25)",
                  borderRadius: 20, fontSize: 12, color: "#1D9E75",
                }}>
                  {name}
                </div>
              ))}
            </div>
          </Section>
        )}

        {/* Uncertainty */}
        <Section title="Uncertainty notes">
          <div style={{
            padding: "12px 14px",
            background: "rgba(186,117,23,0.06)",
            border: "0.5px solid rgba(186,117,23,0.2)",
            borderRadius: 8, fontSize: 13,
            color: "rgba(255,255,255,0.5)", lineHeight: 1.7,
          }}>
            {report.uncertainty_notes}
          </div>
        </Section>

        {/* Meta */}
        <div style={{
          fontSize: 11, color: "rgba(255,255,255,0.15)",
          display: "flex", gap: 20,
          paddingTop: 12, borderTop: "0.5px solid rgba(255,255,255,0.06)",
          flexWrap: "wrap",
        }}>
          <span>{report.n_agents} agents</span>
          <span>{report.n_snapshots} simulation steps</span>
          <span>sim id: {simId?.slice(0, 8)}</span>
        </div>

      </div>
    </div>
  );
}