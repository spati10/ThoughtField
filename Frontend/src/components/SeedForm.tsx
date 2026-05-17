

"use client";

import { useState, useEffect } from "react";
import type { SimulateRequest } from "@/lib/types";

const EXAMPLE_SEEDS = [
  `University admin cut arts funding by 40%. Students staged a walkout.
Faculty Senate passed a no-confidence vote against the Provost.
Student union threatening full strike by Friday.`,
  `City council voted to rezone the waterfront for luxury development.
Long-time residents and local businesses face displacement.
A grassroots coalition formed to block the permits.`,
  `Tech company announced 15% layoffs via a Friday email.
Senior engineers posted salary data publicly on LinkedIn.
The CEO's $40M bonus was reported the same week.`,
];

const EXAMPLE_QUESTIONS = [
  "What happens in the next 7 days?",
  "Will the community successfully resist the development?",
  "How does the workforce respond over the next two weeks?",
];

interface Props {
  onSubmit:  (req: SimulateRequest) => Promise<void>;
  loading:   boolean;
  error:     string | null;
}

export default function SeedForm({ onSubmit, loading, error }: Props) {
  const [seed,     setSeed]     = useState("");
  const [question, setQuestion] = useState("");
  const [nAgents,  setNAgents]  = useState(20);
  const [simDays,  setSimDays]  = useState(3);
  const [seedIdx,  setSeedIdx]  = useState(0);

  useEffect(() => {
    const t = setInterval(
      () => setSeedIdx((i) => (i + 1) % EXAMPLE_SEEDS.length),
      4000
    );
    return () => clearInterval(t);
  }, []);

  function fillExample(i: number) {
    setSeed(EXAMPLE_SEEDS[i]);
    setQuestion(EXAMPLE_QUESTIONS[i]);
  }

  function handleSubmit() {
    if (!seed.trim() || !question.trim() || loading) return;
    onSubmit({ seed: seed.trim(), question: question.trim(), n_agents: nAgents, sim_days: simDays });
  }

  const canSubmit = seed.trim().length >= 20 && question.trim().length >= 5 && !loading;
  const estCost   = Math.round(nAgents * simDays * 0.012 * 100) / 100;
  const estMins   = Math.round(simDays * 2.4);

  // ---- shared input style ----
  const inputBase: React.CSSProperties = {
    width: "100%", background: "rgba(255,255,255,0.05)",
    border: "0.5px solid rgba(255,255,255,0.12)", borderRadius: 8,
    color: "rgba(255,255,255,0.85)", fontSize: 13.5,
    padding: "10px 14px", outline: "none", fontFamily: "inherit",
    transition: "border-color 0.15s", boxSizing: "border-box",
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 24, width: "100%" }}>

      {/* ---- Seed textarea ---- */}
      <div>
        <label style={{
          display: "block", fontSize: 11, fontWeight: 500,
          color: "rgba(255,255,255,0.35)", letterSpacing: "0.07em",
          textTransform: "uppercase", marginBottom: 8,
        }}>
          Seed text
        </label>
        <textarea
          value={seed}
          onChange={(e) => setSeed(e.target.value)}
          placeholder={`Paste any text — news article, policy doc, story…\n\nExample: ${EXAMPLE_SEEDS[seedIdx].slice(0, 80)}…`}
          rows={6}
          style={{
            ...inputBase,
            resize: "vertical", minHeight: 120, lineHeight: 1.65,
            borderColor: seed.length > 0 ? "rgba(255,255,255,0.2)" : "rgba(255,255,255,0.12)",
          }}
        />
        {/* Example buttons */}
        <div style={{ display: "flex", gap: 6, marginTop: 8, flexWrap: "wrap", alignItems: "center" }}>
          <span style={{ fontSize: 11, color: "rgba(255,255,255,0.2)" }}>Try:</span>
          {["University protest", "City rezoning", "Tech layoffs"].map((label, i) => (
            <button
              key={i}
              onClick={() => fillExample(i)}
              style={{
                fontSize: 11, padding: "3px 10px",
                border: "0.5px solid rgba(255,255,255,0.15)",
                borderRadius: 20, background: "transparent",
                color: "rgba(255,255,255,0.4)", cursor: "pointer", fontFamily: "inherit",
              }}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* ---- Question ---- */}
      <div>
        <label style={{
          display: "block", fontSize: 11, fontWeight: 500,
          color: "rgba(255,255,255,0.35)", letterSpacing: "0.07em",
          textTransform: "uppercase", marginBottom: 8,
        }}>
          Prediction question
        </label>
        <input
          type="text"
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") handleSubmit(); }}
          placeholder="What happens in the next 7 days?"
          style={{
            ...inputBase,
            borderColor: question.length > 0 ? "rgba(255,255,255,0.2)" : "rgba(255,255,255,0.12)",
          }}
        />
      </div>

      {/* ---- Sliders ---- */}
      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        <label style={{
          fontSize: 11, fontWeight: 500, color: "rgba(255,255,255,0.35)",
          letterSpacing: "0.07em", textTransform: "uppercase",
        }}>
          Configuration
        </label>

        {[
          { label: "Agents",   min: 5,  max: 50, step: 1, value: nAgents,  set: setNAgents,  accent: "#7F77DD" },
          { label: "Sim days", min: 1,  max: 7,  step: 1, value: simDays,  set: setSimDays,  accent: "#1D9E75" },
        ].map(({ label, min, max, step, value, set, accent }) => (
          <div key={label} style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <span style={{ fontSize: 12, color: "rgba(255,255,255,0.4)", minWidth: 72, whiteSpace: "nowrap" }}>
              {label}
            </span>
            <input
              type="range" min={min} max={max} step={step} value={value}
              onChange={(e) => set(Number(e.target.value))}
              style={{ flex: 1, accentColor: accent }}
            />
            <span style={{ fontSize: 13, fontWeight: 500, color: "rgba(255,255,255,0.7)", minWidth: 28, textAlign: "right" }}>
              {value}
            </span>
          </div>
        ))}

        <div style={{
          fontSize: 11.5, color: "rgba(255,255,255,0.2)",
          display: "flex", gap: 20, paddingLeft: 84,
        }}>
          <span>~${estCost} USD est.</span>
          <span>~{estMins} min real time</span>
        </div>
      </div>

      {/* ---- Error ---- */}
      {error && (
        <div style={{
          padding: "10px 14px",
          background: "rgba(226,75,74,0.1)",
          border: "0.5px solid rgba(226,75,74,0.3)",
          borderRadius: 8, fontSize: 12.5, color: "#E24B4A",
        }}>
          {error}
        </div>
      )}

      {/* ---- Submit ---- */}
      <button
        onClick={handleSubmit}
        disabled={!canSubmit}
        style={{
          padding: "14px 0",
          background: canSubmit ? "rgba(127,119,221,0.15)" : "rgba(255,255,255,0.04)",
          border: `0.5px solid ${canSubmit ? "rgba(127,119,221,0.5)" : "rgba(255,255,255,0.1)"}`,
          borderRadius: 10,
          color: canSubmit ? "#AFA9EC" : "rgba(255,255,255,0.2)",
          fontSize: 14, fontWeight: 500,
          cursor: canSubmit ? "pointer" : "not-allowed",
          fontFamily: "inherit", letterSpacing: "0.01em", transition: "all 0.15s",
        }}
      >
        {loading ? `Generating ${nAgents} personas…` : "Run Simulation →"}
      </button>

      {/* ---- Loading detail ---- */}
      {loading && (
        <div style={{
          textAlign: "center", fontSize: 11.5,
          color: "rgba(255,255,255,0.25)", lineHeight: 1.8,
        }}>
          Extracting world state from seed text…<br />
          Generating {nAgents} diverse agent personas…<br />
          Launching simulation engine. (~10–20 seconds)
        </div>
      )}
    </div>
  );
}
