// ThoughtField — frontend/src/app/report/[id]/page.tsx
// Prompt 10 of 10.
//
// The prediction report page. Final destination of every simulation.
// Polls GET /api/report/{id} until the report is ready, then displays:
//
//   - Simulation summary narrative
//   - Predicted outcome (large, prominent)
//   - Confidence arc gauge (SVG)
//   - Sentiment trajectory badge
//   - Key drivers (cards)
//   - Alternative scenarios (expandable, with probability bars)
//   - Faction dynamics
//   - Key agents
//   - Uncertainty notes
//
// Two CTAs at the bottom: "New Simulation" and "Copy report text"

"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter, useParams } from "next/navigation";
import api, { type ReportData } from "@/lib/api";

// ---------------------------------------------------------------------------
// Poll interval — checks every 5s while waiting for report generation
// ---------------------------------------------------------------------------
const POLL_MS = 5000;

// ---------------------------------------------------------------------------
// Confidence Arc — SVG arc gauge showing 0–100%
// ---------------------------------------------------------------------------
function ConfidenceArc({ value }: { value: number }) {
  const pct    = Math.max(0, Math.min(1, value));
  const deg    = pct * 240;      // arc sweeps 240°
  const r      = 52;
  const cx     = 70;
  const cy     = 70;
  const startA = -210;           // degrees — bottom-left
  const endA   = startA + deg;

  function polarToXY(angleDeg: number, radius: number) {
    const rad = (angleDeg * Math.PI) / 180;
    return {
      x: cx + radius * Math.cos(rad),
      y: cy + radius * Math.sin(rad),
    };
  }

  const start  = polarToXY(startA, r);
  const end    = polarToXY(endA, r);
  const large  = deg > 180 ? 1 : 0;

  const trackStart = polarToXY(startA, r);
  const trackEnd   = polarToXY(startA + 240, r);

  const color =
    pct >= 0.7 ? "#1D9E75" :
    pct >= 0.4 ? "#BA7517" :
                 "#E24B4A";

  return (
    <svg width={140} height={90} viewBox="0 0 140 90">
      {/* Track */}
      <path
        d={`M ${trackStart.x} ${trackStart.y} A ${r} ${r} 0 1 1 ${trackEnd.x} ${trackEnd.y}`}
        fill="none"
        stroke="rgba(255,255,255,0.08)"
        strokeWidth={8}
        strokeLinecap="round"
      />
      {/* Value arc */}
      {pct > 0 && (
        <path
          d={`M ${start.x} ${start.y} A ${r} ${r} 0 ${large} 1 ${end.x} ${end.y}`}
          fill="none"
          stroke={color}
          strokeWidth={8}
          strokeLinecap="round"
        />
      )}
      {/* Center text */}
      <text
        x={cx} y={cy + 4}
        textAnchor="middle"
        dominantBaseline="middle"
        fill={color}
        fontSize={20}
        fontWeight={500}
        fontFamily="-apple-system, sans-serif"
      >
        {Math.round(pct * 100)}%
      </text>
      <text
        x={cx} y={cy + 22}
        textAnchor="middle"
        fill="rgba(255,255,255,0.3)"
        fontSize={9}
        fontFamily="-apple-system, sans-serif"
      >
        confidence
      </text>
    </svg>
  );
}

// ---------------------------------------------------------------------------
// Probability bar — for alternative scenarios
// ---------------------------------------------------------------------------
function ProbBar({ value }: { value: number }) {
  const pct = Math.round(value * 100);
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
      <div style={{
        flex:         1,
        height:       3,
        background:   "rgba(255,255,255,0.08)",
        borderRadius: 2,
      }}>
        <div style={{
          height:       "100%",
          width:        `${pct}%`,
          background:   "#BA7517",
          borderRadius: 2,
          transition:   "width 0.6s ease",
        }} />
      </div>
      <span style={{ fontSize: 11, color: "rgba(255,255,255,0.35)", minWidth: 28, textAlign: "right" }}>
        {pct}%
      </span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Trajectory badge
// ---------------------------------------------------------------------------
function TrajectoryBadge({ value }: { value: string }) {
  const config: Record<string, { color: string; bg: string; label: string }> = {
    escalating:  { color: "#E24B4A", bg: "rgba(226,75,74,0.12)",  label: "Escalating" },
    stabilizing: { color: "#BA7517", bg: "rgba(186,117,23,0.12)", label: "Stabilizing" },
    improving:   { color: "#1D9E75", bg: "rgba(29,158,117,0.12)", label: "Improving" },
  };
  const c = config[value] || config.stabilizing;
  return (
    <div style={{
      display:      "inline-flex",
      alignItems:   "center",
      gap:          6,
      padding:      "4px 12px",
      borderRadius: 20,
      background:   c.bg,
      border:       `0.5px solid ${c.color}44`,
    }}>
      <div style={{ width: 6, height: 6, borderRadius: "50%", background: c.color }} />
      <span style={{ fontSize: 12, fontWeight: 500, color: c.color }}>
        {c.label}
      </span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Section wrapper
// ---------------------------------------------------------------------------
function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 28 }}>
      <div style={{
        fontSize:      10,
        fontWeight:    500,
        color:         "rgba(255,255,255,0.25)",
        letterSpacing: "0.08em",
        textTransform: "uppercase",
        marginBottom:  12,
      }}>
        {title}
      </div>
      {children}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main report page
// ---------------------------------------------------------------------------
export default function ReportPage() {
  const params = useParams();
  const simId  = params?.id as string;
  const router = useRouter();

  const [report,  setReport]  = useState<ReportData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState<string | null>(null);
  const [copied,  setCopied]  = useState(false);
  const [expanded, setExpanded] = useState<Record<number, boolean>>({});

  const fetchReport = useCallback(async () => {
    try {
      const res = await api.getReport(simId);

      if (res.status === "done" && res.report) {
        setReport(res.report);
        setLoading(false);
        return true;   // done
      }

      if (res.status === "error") {
        setError("Simulation failed. Please start a new one.");
        setLoading(false);
        return true;
      }

      return false;   // still running — keep polling
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Failed to load report";
      setError(msg);
      setLoading(false);
      return true;
    }
  }, [simId]);

  // Poll until report is ready
  useEffect(() => {
    let timer: NodeJS.Timeout;

    async function poll() {
      const done = await fetchReport();
      if (!done) {
        timer = setTimeout(poll, POLL_MS);
      }
    }

    poll();
    return () => clearTimeout(timer);
  }, [fetchReport]);

  function copyReport() {
    if (!report) return;
    const text = [
      `ThoughtField Prediction Report`,
      `Question: ${report.question}`,
      ``,
      `PREDICTED OUTCOME`,
      report.predicted_outcome,
      ``,
      `Confidence: ${Math.round(report.confidence * 100)}%`,
      `Trajectory: ${report.sentiment_trajectory}`,
      `Time horizon: ${report.time_horizon}`,
      ``,
      `KEY DRIVERS`,
      ...report.key_drivers.map((d) => `• ${d}`),
      ``,
      `ALTERNATIVE SCENARIOS`,
      ...report.alternative_scenarios.map(
        (s) => `• [${Math.round(s.probability * 100)}%] ${s.scenario}`
      ),
      ``,
      `UNCERTAINTY`,
      report.uncertainty_notes,
      ``,
      `SIMULATION SUMMARY`,
      report.simulation_summary,
    ].join("\n");

    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  // ---------------------------------------------------------------------------
  // Loading state
  // ---------------------------------------------------------------------------
  if (loading) {
    return (
      <div style={{
        minHeight:      "100vh",
        background:     "#0f0f14",
        display:        "flex",
        alignItems:     "center",
        justifyContent: "center",
        flexDirection:  "column",
        gap:            16,
        fontFamily:     "-apple-system, sans-serif",
        color:          "rgba(255,255,255,0.4)",
      }}>
        <div style={{ fontSize: 13 }}>Generating prediction report…</div>
        <div style={{ fontSize: 11, color: "rgba(255,255,255,0.2)", textAlign: "center", lineHeight: 1.8 }}>
          ReportAgent is reading {" "}all agent memories and reflections.<br />
          This takes ~15–20 seconds.
        </div>
        <div style={{
          marginTop:    12,
          width:        200,
          height:       2,
          background:   "rgba(255,255,255,0.06)",
          borderRadius: 1,
          overflow:     "hidden",
        }}>
          <div style={{
            height:     "100%",
            width:      "40%",
            background: "#7F77DD",
            borderRadius: 1,
            animation:  "slide 1.5s ease-in-out infinite alternate",
          }} />
        </div>
        <style>{`@keyframes slide { from { margin-left: 0 } to { margin-left: 60% } }`}</style>
      </div>
    );
  }

  // ---------------------------------------------------------------------------
  // Error state
  // ---------------------------------------------------------------------------
  if (error || !report) {
    return (
      <div style={{
        minHeight: "100vh", background: "#0f0f14",
        display: "flex", alignItems: "center", justifyContent: "center",
        fontFamily: "-apple-system, sans-serif",
      }}>
        <div style={{ textAlign: "center", maxWidth: 400 }}>
          <div style={{ fontSize: 14, color: "#E24B4A", marginBottom: 12 }}>
            {error || "Report not available"}
          </div>
          <button
            onClick={() => router.push("/")}
            style={{
              padding: "10px 24px", background: "transparent",
              border: "0.5px solid rgba(255,255,255,0.2)", borderRadius: 8,
              color: "rgba(255,255,255,0.6)", cursor: "pointer",
              fontFamily: "inherit", fontSize: 13,
            }}
          >
            Start new simulation
          </button>
        </div>
      </div>
    );
  }

  // ---------------------------------------------------------------------------
  // Full report
  // ---------------------------------------------------------------------------
  return (
    <div style={{
      minHeight:   "100vh",
      background:  "#0f0f14",
      color:       "rgba(255,255,255,0.85)",
      fontFamily:  "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
      padding:     "0 0 60px",
    }}>

      {/* ---- Top bar ---- */}
      <div style={{
        display:      "flex",
        alignItems:   "center",
        justifyContent: "space-between",
        padding:      "12px 32px",
        borderBottom: "0.5px solid rgba(255,255,255,0.08)",
        background:   "rgba(255,255,255,0.02)",
      }}>
        <span style={{ fontSize: 13, fontWeight: 500, color: "rgba(255,255,255,0.5)" }}>
          ThoughtField
        </span>
        <div style={{ display: "flex", gap: 10 }}>
          <button
            onClick={copyReport}
            style={{
              padding: "6px 14px", background: "transparent",
              border: "0.5px solid rgba(255,255,255,0.15)", borderRadius: 6,
              color: "rgba(255,255,255,0.5)", cursor: "pointer",
              fontFamily: "inherit", fontSize: 12,
            }}
          >
            {copied ? "Copied ✓" : "Copy report"}
          </button>
          <button
            onClick={() => router.push("/")}
            style={{
              padding: "6px 14px", background: "transparent",
              border: "0.5px solid rgba(255,255,255,0.15)", borderRadius: 6,
              color: "rgba(255,255,255,0.5)", cursor: "pointer",
              fontFamily: "inherit", fontSize: 12,
            }}
          >
            New simulation
          </button>
        </div>
      </div>

      {/* ---- Content ---- */}
      <div style={{ maxWidth: 700, margin: "0 auto", padding: "40px 24px" }}>

        {/* Question */}
        <div style={{
          fontSize:    11,
          fontWeight:  500,
          color:       "rgba(255,255,255,0.25)",
          letterSpacing: "0.07em",
          textTransform: "uppercase",
          marginBottom: 8,
        }}>
          Question
        </div>
        <div style={{
          fontSize:    15,
          color:       "rgba(255,255,255,0.6)",
          marginBottom: 32,
          fontStyle:   "italic",
        }}>
          "{report.question}"
        </div>

        {/* ---- Hero: outcome + gauge + trajectory ---- */}
        <div style={{
          background:   "rgba(255,255,255,0.03)",
          border:       "0.5px solid rgba(255,255,255,0.1)",
          borderRadius: 12,
          padding:      "24px 28px",
          marginBottom: 32,
          display:      "flex",
          gap:          28,
          alignItems:   "flex-start",
          flexWrap:     "wrap",
        }}>
          <div style={{ flex: 1, minWidth: 220 }}>
            <div style={{
              fontSize:    10,
              fontWeight:  500,
              color:       "rgba(255,255,255,0.25)",
              letterSpacing: "0.07em",
              textTransform: "uppercase",
              marginBottom: 12,
            }}>
              Predicted outcome
            </div>
            <div style={{
              fontSize:   16,
              lineHeight: 1.65,
              color:      "rgba(255,255,255,0.9)",
              marginBottom: 16,
            }}>
              {report.predicted_outcome}
            </div>
            <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
              <TrajectoryBadge value={report.sentiment_trajectory} />
              <span style={{ fontSize: 12, color: "rgba(255,255,255,0.3)" }}>
                {report.time_horizon}
              </span>
            </div>
          </div>
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 4 }}>
            <ConfidenceArc value={report.confidence} />
          </div>
        </div>

        {/* ---- Simulation summary ---- */}
        <Section title="What happened in the simulation">
          <div style={{
            fontSize:     13.5,
            lineHeight:   1.75,
            color:        "rgba(255,255,255,0.55)",
            padding:      "14px 16px",
            background:   "rgba(255,255,255,0.03)",
            borderRadius: 8,
            borderLeft:   "2px solid rgba(255,255,255,0.1)",
          }}>
            {report.simulation_summary}
          </div>
        </Section>

        {/* ---- Key drivers ---- */}
        <Section title="Key drivers">
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {report.key_drivers.map((driver, i) => (
              <div
                key={i}
                style={{
                  display:      "flex",
                  gap:          12,
                  alignItems:   "flex-start",
                  padding:      "10px 14px",
                  background:   "rgba(255,255,255,0.03)",
                  border:       "0.5px solid rgba(255,255,255,0.08)",
                  borderRadius: 8,
                }}
              >
                <div style={{
                  width:       20, height: 20,
                  borderRadius: 4,
                  background:  "rgba(127,119,221,0.15)",
                  border:      "0.5px solid rgba(127,119,221,0.3)",
                  color:       "#AFA9EC",
                  fontSize:    10,
                  fontWeight:  500,
                  display:     "flex",
                  alignItems:  "center",
                  justifyContent: "center",
                  flexShrink:  0,
                  marginTop:   1,
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

        {/* ---- Alternative scenarios ---- */}
        {report.alternative_scenarios.length > 0 && (
          <Section title="Alternative scenarios">
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {report.alternative_scenarios.map((scenario, i) => (
                <div
                  key={i}
                  style={{
                    padding:      "12px 14px",
                    background:   "rgba(255,255,255,0.03)",
                    border:       "0.5px solid rgba(255,255,255,0.08)",
                    borderRadius: 8,
                    cursor:       "pointer",
                  }}
                  onClick={() => setExpanded((prev) => ({ ...prev, [i]: !prev[i] }))}
                >
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12, marginBottom: 8 }}>
                    <div style={{ fontSize: 13, color: "rgba(255,255,255,0.7)", flex: 1 }}>
                      {scenario.scenario}
                    </div>
                    <span style={{ fontSize: 11, color: "rgba(255,255,255,0.3)", flexShrink: 0 }}>
                      {expanded[i] ? "▲" : "▼"}
                    </span>
                  </div>
                  <ProbBar value={scenario.probability} />
                  {expanded[i] && scenario.requires && (
                    <div style={{
                      marginTop:  10,
                      padding:    "8px 10px",
                      background: "rgba(255,255,255,0.04)",
                      borderRadius: 6,
                      fontSize:   12,
                      color:      "rgba(255,255,255,0.4)",
                      lineHeight: 1.6,
                    }}>
                      Requires: {scenario.requires}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </Section>
        )}

        {/* ---- Faction dynamics ---- */}
        {Object.keys(report.faction_dynamics).length > 0 && (
          <Section title="Faction dynamics">
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {Object.entries(report.faction_dynamics).map(([faction, description]) => (
                <div
                  key={faction}
                  style={{
                    padding: "10px 14px",
                    background: "rgba(255,255,255,0.03)",
                    border: "0.5px solid rgba(255,255,255,0.08)",
                    borderRadius: 8,
                  }}
                >
                  <div style={{ fontSize: 11, fontWeight: 500, color: "rgba(255,255,255,0.4)", marginBottom: 4 }}>
                    {faction}
                  </div>
                  <div style={{ fontSize: 13, color: "rgba(255,255,255,0.65)", lineHeight: 1.6 }}>
                    {description}
                  </div>
                </div>
              ))}
            </div>
          </Section>
        )}

        {/* ---- Key agents ---- */}
        {report.key_agents.length > 0 && (
          <Section title="Most influential agents">
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              {report.key_agents.map((name) => (
                <div
                  key={name}
                  style={{
                    padding:      "5px 12px",
                    background:   "rgba(29,158,117,0.1)",
                    border:       "0.5px solid rgba(29,158,117,0.25)",
                    borderRadius: 20,
                    fontSize:     12,
                    color:        "#1D9E75",
                  }}
                >
                  {name}
                </div>
              ))}
            </div>
          </Section>
        )}

        {/* ---- Uncertainty ---- */}
        <Section title="Uncertainty notes">
          <div style={{
            padding:      "12px 14px",
            background:   "rgba(186,117,23,0.06)",
            border:       "0.5px solid rgba(186,117,23,0.2)",
            borderRadius: 8,
            fontSize:     13,
            color:        "rgba(255,255,255,0.5)",
            lineHeight:   1.7,
          }}>
            {report.uncertainty_notes}
          </div>
        </Section>

        {/* ---- Meta ---- */}
        <div style={{
          fontSize:   11,
          color:      "rgba(255,255,255,0.15)",
          display:    "flex",
          gap:        20,
          paddingTop: 12,
          borderTop:  "0.5px solid rgba(255,255,255,0.06)",
          flexWrap:   "wrap",
        }}>
          <span>{report.n_agents} agents</span>
          <span>{report.n_snapshots} simulation steps</span>
          <span>sim id: {report.sim_id?.slice(0, 8)}</span>
        </div>

      </div>
    </div>
  );
}