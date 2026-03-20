"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";

const API = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

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

export default function HomePage() {
  const router = useRouter();

  const [seed,     setSeed]     = useState("");
  const [question, setQuestion] = useState("");
  const [nAgents,  setNAgents]  = useState(20);
  const [simDays,  setSimDays]  = useState(3);
  const [loading,  setLoading]  = useState(false);
  const [error,    setError]    = useState<string | null>(null);
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

  async function handleSubmit() {
    if (!seed.trim() || !question.trim() || loading) return;
    setLoading(true);
    setError(null);

    try {
      const res = await fetch(`${API}/api/simulate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          seed:     seed.trim(),
          question: question.trim(),
          n_agents: nAgents,
          sim_days: simDays,
        }),
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.detail || `Server error: ${res.status}`);
      }

      const data = await res.json();
      router.push(`/sim/${data.sim_id}`);
    } catch (e: unknown) {
      const msg =
        e instanceof Error
          ? e.message
          : "Failed to start simulation. Is the backend running on port 8000?";
      setError(msg);
      setLoading(false);
    }
  }

  const canSubmit =
    seed.trim().length >= 20 && question.trim().length >= 5 && !loading;

  const estCost = (nAgents * simDays * 0.012).toFixed(2);
  const estMins = Math.round(simDays * 2.4);

  return (
    <div
      style={{
        minHeight:      "100vh",
        background:     "#0f0f14",
        color:          "rgba(255,255,255,0.85)",
        fontFamily:     "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
        display:        "flex",
        flexDirection:  "column",
        alignItems:     "center",
        justifyContent: "center",
        padding:        "40px 20px",
      }}
    >
      <div
        style={{
          width:         "100%",
          maxWidth:      580,
          display:       "flex",
          flexDirection: "column",
          gap:           28,
        }}
      >
        {/* ---- Header ---- */}
        <div style={{ textAlign: "center" }}>
          <div
            style={{
              fontSize:      36,
              fontWeight:    500,
              color:         "rgba(255,255,255,0.95)",
              letterSpacing: "-0.02em",
              marginBottom:  8,
            }}
          >
            ThoughtField
          </div>
          <div
            style={{
              fontSize:   13,
              color:      "rgba(255,255,255,0.3)",
              lineHeight: 1.7,
            }}
          >
            Seed any text. Watch 25 living agents simulate a world.
            <br />
            Surface emergent behaviors. Predict what happens next.
          </div>
        </div>

        {/* ---- Seed textarea ---- */}
        <div>
          <label
            style={{
              display:       "block",
              fontSize:      11,
              fontWeight:    500,
              color:         "rgba(255,255,255,0.35)",
              letterSpacing: "0.07em",
              textTransform: "uppercase",
              marginBottom:  8,
            }}
          >
            Seed text
          </label>
          <textarea
            value={seed}
            onChange={(e) => setSeed(e.target.value)}
            placeholder={`Paste any text — news article, policy doc, story, social thread…\n\nExample: ${EXAMPLE_SEEDS[seedIdx].slice(0, 80)}…`}
            rows={6}
            style={{
              width:        "100%",
              background:   "rgba(255,255,255,0.05)",
              border:       `0.5px solid ${seed.length > 0 ? "rgba(255,255,255,0.2)" : "rgba(255,255,255,0.12)"}`,
              borderRadius: 10,
              color:        "rgba(255,255,255,0.85)",
              fontSize:     13.5,
              lineHeight:   1.65,
              padding:      "14px 16px",
              outline:      "none",
              resize:       "vertical",
              fontFamily:   "inherit",
              minHeight:    140,
              boxSizing:    "border-box",
              transition:   "border-color 0.15s",
            }}
          />

          {/* Example fill buttons */}
          <div
            style={{
              display:    "flex",
              gap:        6,
              marginTop:  8,
              flexWrap:   "wrap",
              alignItems: "center",
            }}
          >
            <span style={{ fontSize: 11, color: "rgba(255,255,255,0.2)" }}>
              Try:
            </span>
            {["University protest", "City rezoning", "Tech layoffs"].map(
              (label, i) => (
                <button
                  key={i}
                  onClick={() => fillExample(i)}
                  style={{
                    fontSize:     11,
                    padding:      "3px 10px",
                    border:       "0.5px solid rgba(255,255,255,0.15)",
                    borderRadius: 20,
                    background:   "transparent",
                    color:        "rgba(255,255,255,0.4)",
                    cursor:       "pointer",
                    fontFamily:   "inherit",
                  }}
                >
                  {label}
                </button>
              )
            )}
          </div>
        </div>

        {/* ---- Question ---- */}
        <div>
          <label
            style={{
              display:       "block",
              fontSize:      11,
              fontWeight:    500,
              color:         "rgba(255,255,255,0.35)",
              letterSpacing: "0.07em",
              textTransform: "uppercase",
              marginBottom:  8,
            }}
          >
            Prediction question
          </label>
          <input
            type="text"
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") handleSubmit();
            }}
            placeholder="What happens in the next 7 days?"
            style={{
              width:        "100%",
              background:   "rgba(255,255,255,0.05)",
              border:       `0.5px solid ${question.length > 0 ? "rgba(255,255,255,0.2)" : "rgba(255,255,255,0.12)"}`,
              borderRadius: 8,
              color:        "rgba(255,255,255,0.85)",
              fontSize:     13.5,
              padding:      "10px 14px",
              outline:      "none",
              fontFamily:   "inherit",
              boxSizing:    "border-box",
              transition:   "border-color 0.15s",
            }}
          />
        </div>

        {/* ---- Sliders ---- */}
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <label
            style={{
              fontSize:      11,
              fontWeight:    500,
              color:         "rgba(255,255,255,0.35)",
              letterSpacing: "0.07em",
              textTransform: "uppercase",
            }}
          >
            Configuration
          </label>

          {/* Agents */}
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <span
              style={{
                fontSize:   12,
                color:      "rgba(255,255,255,0.4)",
                minWidth:   80,
                whiteSpace: "nowrap",
              }}
            >
              Agents
            </span>
            <input
              type="range"
              min={5}
              max={50}
              step={1}
              value={nAgents}
              onChange={(e) => setNAgents(Number(e.target.value))}
              style={{ flex: 1, accentColor: "#7F77DD" }}
            />
            <span
              style={{
                fontSize:   13,
                fontWeight: 500,
                color:      "rgba(255,255,255,0.7)",
                minWidth:   28,
                textAlign:  "right",
              }}
            >
              {nAgents}
            </span>
          </div>

          {/* Sim days */}
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <span
              style={{
                fontSize:   12,
                color:      "rgba(255,255,255,0.4)",
                minWidth:   80,
                whiteSpace: "nowrap",
              }}
            >
              Sim days
            </span>
            <input
              type="range"
              min={1}
              max={7}
              step={1}
              value={simDays}
              onChange={(e) => setSimDays(Number(e.target.value))}
              style={{ flex: 1, accentColor: "#1D9E75" }}
            />
            <span
              style={{
                fontSize:   13,
                fontWeight: 500,
                color:      "rgba(255,255,255,0.7)",
                minWidth:   28,
                textAlign:  "right",
              }}
            >
              {simDays}
            </span>
          </div>

          {/* Estimates */}
          <div
            style={{
              fontSize:    11.5,
              color:       "rgba(255,255,255,0.2)",
              display:     "flex",
              gap:         20,
              paddingLeft: 92,
            }}
          >
            <span>~${estCost} USD est.</span>
            <span>~{estMins} min real time</span>
          </div>
        </div>

        {/* ---- Error ---- */}
        {error && (
          <div
            style={{
              padding:      "10px 14px",
              background:   "rgba(226,75,74,0.1)",
              border:       "0.5px solid rgba(226,75,74,0.3)",
              borderRadius: 8,
              fontSize:     12.5,
              color:        "#E24B4A",
              lineHeight:   1.5,
            }}
          >
            {error}
          </div>
        )}

        {/* ---- Submit ---- */}
        <button
          onClick={handleSubmit}
          disabled={!canSubmit}
          style={{
            padding:       "14px 0",
            background:    canSubmit
              ? "rgba(127,119,221,0.15)"
              : "rgba(255,255,255,0.04)",
            border:        `0.5px solid ${canSubmit ? "rgba(127,119,221,0.5)" : "rgba(255,255,255,0.1)"}`,
            borderRadius:  10,
            color:         canSubmit ? "#AFA9EC" : "rgba(255,255,255,0.2)",
            fontSize:      14,
            fontWeight:    500,
            cursor:        canSubmit ? "pointer" : "not-allowed",
            fontFamily:    "inherit",
            letterSpacing: "0.01em",
            transition:    "all 0.15s",
            width:         "100%",
          }}
        >
          {loading
            ? `Generating ${nAgents} personas…`
            : "Run Simulation →"}
        </button>

        {/* ---- Loading detail ---- */}
        {loading && (
          <div
            style={{
              textAlign:  "center",
              fontSize:   11.5,
              color:      "rgba(255,255,255,0.25)",
              lineHeight: 1.8,
            }}
          >
            Extracting world state from your seed text…
            <br />
            Generating {nAgents} diverse agent personas…
            <br />
            Launching the simulation engine. (~10–20 seconds)
          </div>
        )}

        {/* ---- Footer ---- */}
        <div
          style={{
            textAlign:  "center",
            fontSize:   11,
            color:      "rgba(255,255,255,0.15)",
            borderTop:  "0.5px solid rgba(255,255,255,0.06)",
            paddingTop: 20,
          }}
        >
          ThoughtField · Stanford Generative Agents architecture ·{" "}
          <a
            href="https://arxiv.org/abs/2304.03442"
            target="_blank"
            rel="noopener noreferrer"
            style={{ color: "rgba(255,255,255,0.25)", textDecoration: "none" }}
          >
            Paper ↗
          </a>
        </div>
      </div>
    </div>
  );
}