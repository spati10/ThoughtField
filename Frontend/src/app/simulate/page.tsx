"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";

const API = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

// ─── example seeds ────────────────────────────────────────────────────────────

const EXAMPLES = [
  {
    label:    "University protest",
    seed:     `University admin cut arts and humanities funding by 40%. Students staged a walkout on Monday. The Faculty Senate passed a no-confidence vote against Provost Linda Chen, citing lack of consultation. University president Dr. Mark Ellis defended the cuts as financially necessary, pointing to a $12M budget deficit. The student union has called for a full strike by Friday if negotiations don't begin. Alumni donors are reportedly reconsidering a $5M pledge over the controversy.`,
    question: "What happens in the next 7 days?",
  },
  {
    label:    "City rezoning",
    seed:     `City council voted 7-2 to rezone the historic waterfront district for luxury high-rise development. Long-time residents, many of whom are elderly or low-income, face displacement. Local businesses say they cannot afford the projected rent increases. A grassroots coalition called "Save Our Shore" has formed and gathered 4,000 petition signatures in 48 hours. The developer, Meridian Group, has donated $200,000 to three council members' campaigns.`,
    question: "Will residents successfully resist the development?",
  },
  {
    label:    "Tech layoffs",
    seed:     `Axiom Technologies announced 15% workforce reduction via a company-wide email sent at 4:47 PM on a Friday. 2,300 employees lost access to their systems within the hour. The same week, SEC filings revealed the CEO received a $40M bonus. A senior engineer posted internal salary data on LinkedIn showing pay disparity across demographics. The post went viral with 180,000 engagements. Two VP-level employees have already publicly resigned.`,
    question: "How does the workforce respond over the next two weeks?",
  },
];

// ─── Logo ─────────────────────────────────────────────────────────────────────

function Logo({ size = 24 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" fill="none">
      <line x1="24" y1="24" x2="11"   y2="11"  stroke="#534AB7" strokeWidth="1.5" strokeLinecap="round" />
      <line x1="24" y1="24" x2="38.5" y2="10"  stroke="#534AB7" strokeWidth="2"   strokeLinecap="round" />
      <line x1="24" y1="24" x2="36"   y2="40"  stroke="#534AB7" strokeWidth="1.5" strokeLinecap="round" />
      <line x1="11" y1="11" x2="24"   y2="4.5" stroke="#3C3489" strokeWidth="1"   strokeLinecap="round" />
      <line x1="24" y1="4.5" x2="38.5"y2="10"  stroke="#3C3489" strokeWidth="1"   strokeLinecap="round" />
      <circle cx="11"   cy="11"  r="3.5" fill="#AFA9EC" />
      <circle cx="38.5" cy="10"  r="4"   fill="#AFA9EC" />
      <circle cx="36"   cy="40"  r="3.5" fill="#AFA9EC" />
      <circle cx="24"   cy="24"  r="6"   fill="#7F77DD" />
    </svg>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function SimulatePage() {
  const router = useRouter();

  const [seed,     setSeed]     = useState("");
  const [question, setQuestion] = useState("");
  const [nAgents,  setNAgents]  = useState(20);
  const [simDays,  setSimDays]  = useState(3);
  const [loading,  setLoading]  = useState(false);
  const [error,    setError]    = useState<string | null>(null);
  const [hintIdx,  setHintIdx]  = useState(0);

  // rotate placeholder hint
  useEffect(() => {
    const t = setInterval(() => setHintIdx((i) => (i + 1) % EXAMPLES.length), 4000);
    return () => clearInterval(t);
  }, []);

  function fillExample(i: number) {
    setSeed(EXAMPLES[i].seed);
    setQuestion(EXAMPLES[i].question);
    setError(null);
  }

  async function handleRun() {
    if (!seed.trim() || !question.trim() || loading) return;
    setLoading(true);
    setError(null);

    try {
      const res = await fetch(`${API}/api/simulate`, {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({
          seed:     seed.trim(),
          question: question.trim(),
          n_agents: nAgents,
          sim_days: simDays,
        }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.detail || `Server error ${res.status}`);
      }

      const data = await res.json();
      router.push(`/sim/${data.sim_id}`);
    } catch (e: unknown) {
      setError(
        e instanceof Error
          ? e.message
          : "Could not reach the backend. Is it running on port 8000?"
      );
      setLoading(false);
    }
  }

  const canRun   = seed.trim().length >= 20 && question.trim().length >= 5 && !loading;
  const estCost  = (nAgents * simDays * 0.012).toFixed(2);
  const estMins  = Math.round(simDays * 2.4);

  // ── styles ──────────────────────────────────────────────────────────────────
  const inp: React.CSSProperties = {
    width:        "100%",
    background:   "rgba(127,119,221,.06)",
    border:       "0.5px solid rgba(127,119,221,.15)",
    borderRadius: 10,
    color:        "rgba(232,230,250,.88)",
    fontSize:     14,
    fontFamily:   "inherit",
    outline:      "none",
    boxSizing:    "border-box",
    transition:   "border-color .15s",
  };

  const label: React.CSSProperties = {
    display:       "block",
    fontSize:      10,
    fontWeight:    500,
    color:         "rgba(127,119,221,.5)",
    letterSpacing: ".1em",
    textTransform: "uppercase",
    marginBottom:  8,
  };

  return (
    <div style={{ minHeight: "100vh", background: "#08081a", color: "rgba(232,230,250,.88)", fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif", display: "flex", flexDirection: "column" }}>

      {/* ── NAV ────────────────────────────────────────────────────────── */}
      <nav style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "13px 24px", borderBottom: "0.5px solid rgba(127,119,221,.12)", background: "rgba(8,8,26,.94)" }}>
        <button
          onClick={() => router.push("/")}
          style={{ display: "flex", alignItems: "center", gap: 9, background: "none", border: "none", cursor: "pointer", color: "rgba(232,230,250,.85)", fontSize: 16, fontWeight: 300, letterSpacing: ".08em", fontFamily: "inherit", padding: 0 }}
        >
          <Logo />
          ThoughtField
        </button>
        <div style={{ fontSize: 12, color: "rgba(127,119,221,.4)" }}>
          New simulation
        </div>
      </nav>

      {/* ── MAIN ───────────────────────────────────────────────────────── */}
      <div style={{ flex: 1, display: "flex", alignItems: "flex-start", justifyContent: "center", padding: "48px 24px 80px" }}>
        <div style={{ width: "100%", maxWidth: 620, display: "flex", flexDirection: "column", gap: 28 }}>

          {/* heading */}
          <div>
            <h1 style={{ fontSize: "clamp(22px,4vw,32px)", fontWeight: 300, color: "rgba(232,230,250,.94)", marginBottom: 6, letterSpacing: "-.01em" }}>
              Set up your simulation
            </h1>
            <p style={{ fontSize: 13.5, color: "rgba(175,169,236,.5)", lineHeight: 1.6 }}>
              Paste any real-world text below — news article, policy document, or story. ThoughtField will generate a cast of AI agents and simulate what happens next.
            </p>
          </div>

          {/* ── seed textarea ─────────────────────────────────────────── */}
          <div>
            <label style={label}>Seed text</label>
            <textarea
              value={seed}
              onChange={(e) => setSeed(e.target.value)}
              placeholder={`Paste any text — news article, policy doc, social thread, story…\n\nExample: ${EXAMPLES[hintIdx].seed.slice(0, 100)}…`}
              rows={7}
              style={{
                ...inp,
                padding:    "14px 16px",
                lineHeight: 1.65,
                resize:     "vertical",
                minHeight:  140,
                borderColor: seed.length > 0 ? "rgba(127,119,221,.28)" : "rgba(127,119,221,.14)",
              }}
            />

            {/* example buttons */}
            <div style={{ display: "flex", gap: 6, marginTop: 8, flexWrap: "wrap", alignItems: "center" }}>
              <span style={{ fontSize: 11, color: "rgba(127,119,221,.35)" }}>Try an example:</span>
              {EXAMPLES.map((ex, i) => (
                <button
                  key={i}
                  onClick={() => fillExample(i)}
                  style={{ fontSize: 11, padding: "3px 11px", border: "0.5px solid rgba(127,119,221,.2)", borderRadius: 20, background: "transparent", color: "rgba(175,169,236,.55)", cursor: "pointer", fontFamily: "inherit" }}
                >
                  {ex.label}
                </button>
              ))}
            </div>
          </div>

          {/* ── prediction question ───────────────────────────────────── */}
          <div>
            <label style={label}>Prediction question</label>
            <input
              type="text"
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") handleRun(); }}
              placeholder="What happens in the next 7 days?"
              style={{
                ...inp,
                padding:     "11px 14px",
                borderColor: question.length > 0 ? "rgba(127,119,221,.28)" : "rgba(127,119,221,.14)",
              }}
            />
          </div>

          {/* ── sliders ───────────────────────────────────────────────── */}
          <div style={{ background: "rgba(13,13,26,.8)", border: "0.5px solid rgba(127,119,221,.12)", borderRadius: 12, padding: "20px 22px", display: "flex", flexDirection: "column", gap: 18 }}>
            <div style={{ fontSize: 10, fontWeight: 500, color: "rgba(127,119,221,.45)", letterSpacing: ".1em", textTransform: "uppercase" }}>Configuration</div>

            {/* agents slider */}
            <div>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                <label style={{ ...label, marginBottom: 0 }}>Agents</label>
                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <span style={{ fontSize: 20, fontWeight: 300, color: "#AFA9EC", fontVariantNumeric: "tabular-nums" }}>{nAgents}</span>
                  <span style={{ fontSize: 11, color: "rgba(127,119,221,.35)" }}>agents</span>
                </div>
              </div>
              <input
                type="range"
                min={5} max={50} step={1}
                value={nAgents}
                onChange={(e) => setNAgents(Number(e.target.value))}
                style={{ width: "100%", accentColor: "#7F77DD" }}
              />
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 10, color: "rgba(127,119,221,.28)", marginTop: 4 }}>
                <span>5 · fast</span>
                <span>50 ·slower</span>
              </div>
            </div>

            {/* days slider */}
            <div>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                <label style={{ ...label, marginBottom: 0 }}>Simulation days</label>
                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <span style={{ fontSize: 20, fontWeight: 300, color: "#4ecba0", fontVariantNumeric: "tabular-nums" }}>{simDays}</span>
                  <span style={{ fontSize: 11, color: "rgba(127,119,221,.35)" }}>day{simDays > 1 ? "s" : ""}</span>
                </div>
              </div>
              <input
                type="range"
                min={1} max={7} step={1}
                value={simDays}
                onChange={(e) => setSimDays(Number(e.target.value))}
                style={{ width: "100%", accentColor: "#1D9E75" }}
              />
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 10, color: "rgba(127,119,221,.28)", marginTop: 4 }}>
                <span>1 day</span>
                <span>7 days</span>
              </div>
            </div>

            {/* cost estimate row */}
            <div style={{ display: "flex", gap: 24, paddingTop: 4, borderTop: "0.5px solid rgba(127,119,221,.08)" }}>
              <div>
                <div style={{ fontSize: 10, color: "rgba(127,119,221,.35)", marginBottom: 2 }}>Estimated cost</div>
                <div style={{ fontSize: 14, fontWeight: 500, color: "rgba(232,230,250,.7)" }}>${estCost} USD</div>
              </div>
              <div>
                <div style={{ fontSize: 10, color: "rgba(127,119,221,.35)", marginBottom: 2 }}>Real time</div>
                <div style={{ fontSize: 14, fontWeight: 500, color: "rgba(232,230,250,.7)" }}>~{estMins} min</div>
              </div>
              <div>
                <div style={{ fontSize: 10, color: "rgba(127,119,221,.35)", marginBottom: 2 }}>Sim ticks</div>
                <div style={{ fontSize: 14, fontWeight: 500, color: "rgba(232,230,250,.7)" }}>{simDays * 144}</div>
              </div>
            </div>
          </div>

          {/* ── error ─────────────────────────────────────────────────── */}
          {error && (
            <div style={{ padding: "11px 14px", background: "rgba(226,75,74,.1)", border: "0.5px solid rgba(226,75,74,.3)", borderRadius: 8, fontSize: 13, color: "#E24B4A", lineHeight: 1.5 }}>
              {error}
            </div>
          )}

          {/* ── run button ────────────────────────────────────────────── */}
          <button
            onClick={handleRun}
            disabled={!canRun}
            style={{
              padding:       "16px 0",
              background:    canRun ? "#6e65afff" : "rgba(127,119,221,.06)",
              border:        `0.5px solid ${canRun ? "rgba(127,119,221,.6)" : "rgba(127,119,221,.12)"}`,
              borderRadius:  12,
              color:         canRun ? "rgba(232,230,250,.95)" : "rgba(127,119,221,.3)",
              fontSize:      15,
              fontWeight:    500,
              cursor:        canRun ? "pointer" : "not-allowed",
              fontFamily:    "inherit",
              letterSpacing: ".01em",
              transition:    "all .15s",
              display:       "flex",
              alignItems:    "center",
              justifyContent:"center",
              gap:           10,
            }}
          >
            {loading ? (
              <>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" style={{ animation: "spin 1s linear infinite" }}>
                  <circle cx="12" cy="12" r="10" stroke="rgba(175,169,236,.4)" strokeWidth="2" />
                  <path d="M12 2a10 10 0 0 1 10 10" stroke="#AFA9EC" strokeWidth="2" strokeLinecap="round" />
                </svg>
                Extracting world &amp; generating {nAgents} personas…
              </>
            ) : (
              <>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                  <polygon points="6,4 20,12 6,20" fill="rgba(232,230,250,.9)" />
                </svg>
                Run Simulation
              </>
            )}
          </button>

          {/* ── loading detail ────────────────────────────────────────── */}
          {loading && (
            <div style={{ textAlign: "center", fontSize: 12, color: "rgba(127,119,221,.38)", lineHeight: 1.9 }}>
              Step 1 — Calling gpt-4o to extract world state from your seed text<br />
              Step 2 — Generating {nAgents} diverse agent personas with beliefs &amp; memories<br />
              Step 3 — Launching simulation engine (~10–20 seconds total)
            </div>
          )}

          {/* ── tips ─────────────────────────────────────────────────── */}
          {!loading && (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px,1fr))", gap: 10 }}>
              {[
                { tip: "More agents",   detail: "Start with 10–15 during dev to keep costs low. Use 25+ for final runs." },
                { tip: "More days",     detail: "3 days shows how situations evolve. 1 day is great for quick snapshots." },
                { tip: "Richer seed",   detail: "More detail in the seed = more specific personas = more realistic behavior." },
              ].map((t) => (
                <div key={t.tip} style={{ padding: "11px 14px", background: "rgba(13,13,26,.6)", border: "0.5px solid rgba(127,119,221,.1)", borderRadius: 10 }}>
                  <div style={{ fontSize: 11, fontWeight: 500, color: "#AFA9EC", marginBottom: 4 }}>{t.tip}</div>
                  <div style={{ fontSize: 11, color: "rgba(127,119,221,.38)", lineHeight: 1.55 }}>{t.detail}</div>
                </div>
              ))}
            </div>
          )}

        </div>
      </div>

      <style>{`
        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
      `}</style>
    </div>
  );
}