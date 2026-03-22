"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import HeroBackground from "@/components/HeroBackground";

// ─── constants ────────────────────────────────────────────────────────────────

const TICKER_PHRASES = [
  'Isabella → John: "Have you heard what the admin announced?"',
  'Carlos reflected: "I think the administration will never negotiate."',
  'Maya formed alliance with 4 independent agents on Day 2.',
  'Ahmed → Priya: "Are you joining the protest tomorrow?"',
  'Faculty Senate agent voted no-confidence after 8 observations.',
  'Protest emerged on Day 3 — nobody was programmed to protest.',
  'New world event: "Police arrived at the main entrance."',
  '14 agents changed their daily plan after the announcement.',
  "Zara reflected: \"I don't trust the official statement anymore.\"",
  'Emma → Felix: "Something feels very different today."',
];

const PREDICT_EXAMPLES = [
  'Seed: "University admin cut arts funding by 40%. Faculty voted no-confidence." → Prediction: Student strike by day 3, emergency board meeting day 5. Confidence: 74%.',
  'Seed: "City council approved luxury waterfront rezoning. Residents furious." → Prediction: Grassroots coalition successfully delays permits through sustained media pressure. Confidence: 68%.',
  'Seed: "Tech company laid off 15% via email. CEO $40M bonus leaked same week." → Prediction: Viral LinkedIn thread triggers board inquiry within 11 days. Confidence: 71%.',
  'Seed: "Government proposed healthcare premium increases of 22%." → Prediction: Opposition forms cross-party coalition; bill stalls in committee. Confidence: 63%.',
  'Seed: "First 80 chapters of a novel." → Prediction: Characters resolve central conflict through an unexpected alliance. Confidence: 58%.',
  'Seed: "Policy X introduced. Hypothesis: minority community disproportionately affected." → Run 10 simulations to measure variance and sensitivity to enforcement parameters.',
];

const PREDICT_CARDS = [
  { label: "Social conflict", color: "#AFA9EC", title: "Labor & protest dynamics",         desc: "University funding cuts, union strikes, faculty walkouts. Who escalates? Who defects? What does management do on day 4?" },
  { label: "Community",       color: "#4ecba0", title: "Urban development disputes",        desc: "Rezoning battles, gentrification pressure, permit fights. How does a neighborhood organize against a city council vote?" },
  { label: "Corporate",       color: "#e0a040", title: "Workforce & crisis response",       desc: "Layoffs, leadership scandals, salary leaks. How does internal sentiment shift? When do resignations spike?" },
  { label: "Political",       color: "#f08aaa", title: "Policy & public opinion",           desc: "New legislation, controversial policy rollouts. How do different demographics respond? Where does opposition coalesce?" },
  { label: "Creative",        color: "#9FE1CB", title: "Fictional world completion",        desc: "Feed the first 80 chapters of a novel. Let agents who ARE the characters live forward. What ending emerges?" },
  { label: "Research",        color: "#AFA9EC", title: "Social science hypothesis testing", desc: "Test what-if scenarios before committing resources. Run the same seed 5 times with different injected events." },
];

// ─── Logo SVG ─────────────────────────────────────────────────────────────────

function Logo({ size = 26 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" fill="none">
      <line x1="24" y1="24" x2="11"   y2="11"  stroke="#534AB7" strokeWidth="1.5" strokeLinecap="round" />
      <line x1="24" y1="24" x2="38.5" y2="10"  stroke="#534AB7" strokeWidth="2"   strokeLinecap="round" />
      <line x1="24" y1="24" x2="36"   y2="40"  stroke="#534AB7" strokeWidth="1.5" strokeLinecap="round" />
      <line x1="24" y1="24" x2="11.5" y2="39"  stroke="#534AB7" strokeWidth="1"   strokeLinecap="round" />
      <line x1="11" y1="11" x2="24"   y2="4.5" stroke="#3C3489" strokeWidth="1"   strokeLinecap="round" />
      <line x1="24" y1="4.5" x2="38.5"y2="10"  stroke="#3C3489" strokeWidth="1"   strokeLinecap="round" />
      <circle cx="11"   cy="11"  r="3.5" fill="#AFA9EC" />
      <circle cx="24"   cy="4.5" r="3"   fill="#AFA9EC" />
      <circle cx="38.5" cy="10"  r="4"   fill="#AFA9EC" />
      <circle cx="36"   cy="40"  r="3.5" fill="#AFA9EC" />
      <circle cx="11.5" cy="39"  r="3"   fill="#534AB7" />
      <circle cx="24"   cy="24"  r="6"   fill="#7F77DD" />
    </svg>
  );
}

// ─── Auth modal ───────────────────────────────────────────────────────────────

function AuthModal({
  open,
  tab,
  onClose,
}: {
  open: boolean;
  tab: "login" | "signup";
  onClose: () => void;
}) {
  const [activeTab, setActiveTab] = useState<"login" | "signup">(tab);
  const [email,    setEmail]    = useState("");
  const [password, setPassword] = useState("");
  const [name,     setName]     = useState("");

  useEffect(() => { setActiveTab(tab); }, [tab]);

  if (!open) return null;

  const inp: React.CSSProperties = {
    width: "100%", padding: "11px 14px",
    background: "rgba(127,119,221,.06)",
    border: "0.5px solid rgba(127,119,221,.2)",
    borderRadius: 8, color: "rgba(232,230,250,.9)",
    fontSize: 13.5, fontFamily: "inherit",
    outline: "none", marginBottom: 12,
    boxSizing: "border-box",
  };

  return (
    <div
      onClick={onClose}
      style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.78)", zIndex: 300, display: "flex", alignItems: "center", justifyContent: "center", padding: "0 20px" }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{ background: "#0d0d1a", border: "0.5px solid rgba(127,119,221,.28)", borderRadius: 16, padding: 32, width: "100%", maxWidth: 400 }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
          <span style={{ fontSize: 16, fontWeight: 500, color: "rgba(232,230,250,.92)" }}>Welcome to ThoughtField</span>
          <button onClick={onClose} style={{ background: "none", border: "none", color: "rgba(175,169,236,.45)", cursor: "pointer", fontSize: 22, lineHeight: 1, padding: 0 }}>×</button>
        </div>

        <div style={{ display: "flex", borderBottom: "0.5px solid rgba(127,119,221,.15)", marginBottom: 22 }}>
          {(["login", "signup"] as const).map((t) => (
            <button
              key={t}
              onClick={() => setActiveTab(t)}
              style={{ padding: "9px 20px", fontSize: 13, border: "none", background: "transparent", cursor: "pointer", fontFamily: "inherit", color: activeTab === t ? "#AFA9EC" : "rgba(127,119,221,.38)", borderBottom: activeTab === t ? "2px solid #7F77DD" : "2px solid transparent", marginBottom: -0.5 }}
            >
              {t === "login" ? "Sign in" : "Create account"}
            </button>
          ))}
        </div>

        {activeTab === "login" ? (
          <div>
            <input style={inp} type="email"    placeholder="Email address" value={email}    onChange={(e) => setEmail(e.target.value)}    />
            <input style={inp} type="password" placeholder="Password"      value={password} onChange={(e) => setPassword(e.target.value)} />
            <button style={{ width: "100%", padding: "12px 0", background: "#534AB7", border: "none", borderRadius: 8, color: "rgba(232,230,250,.95)", fontSize: 14, fontWeight: 500, cursor: "pointer", fontFamily: "inherit", marginBottom: 16 }}>Sign in</button>
            <div style={{ textAlign: "center", fontSize: 12, color: "rgba(127,119,221,.38)", marginBottom: 10 }}>or continue with</div>
            <div style={{ display: "flex", gap: 8 }}>
              {["Google", "GitHub"].map((p) => (
                <button key={p} style={{ flex: 1, padding: "9px 0", background: "transparent", border: "0.5px solid rgba(127,119,221,.2)", borderRadius: 8, color: "rgba(175,169,236,.7)", fontSize: 12, cursor: "pointer", fontFamily: "inherit" }}>{p}</button>
              ))}
            </div>
          </div>
        ) : (
          <div>
            <input style={inp} type="text"     placeholder="Full name"        value={name}     onChange={(e) => setName(e.target.value)}     />
            <input style={inp} type="email"    placeholder="Email address"    value={email}    onChange={(e) => setEmail(e.target.value)}    />
            <input style={inp} type="password" placeholder="Password (min 8)" value={password} onChange={(e) => setPassword(e.target.value)} />
            <button style={{ width: "100%", padding: "12px 0", background: "#534AB7", border: "none", borderRadius: 8, color: "rgba(232,230,250,.95)", fontSize: 14, fontWeight: 500, cursor: "pointer", fontFamily: "inherit", marginBottom: 12 }}>Create account</button>
            <div style={{ textAlign: "center", fontSize: 11, color: "rgba(127,119,221,.3)" }}>By signing up you agree to our terms. We don't sell your data.</div>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function LandingPage() {
  const router = useRouter();

  const [tickerText,    setTickerText]    = useState(TICKER_PHRASES[0]);
  const [authOpen,      setAuthOpen]      = useState(false);
  const [authTab,       setAuthTab]       = useState<"login" | "signup">("login");
  const [predictIdx,    setPredictIdx]    = useState(0);
  const [predictFading, setPredictFading] = useState(false);

  useEffect(() => {
    let i = 0;
    const t = setInterval(() => {
      i = (i + 1) % TICKER_PHRASES.length;
      setTickerText(TICKER_PHRASES[i]);
    }, 3200);
    return () => clearInterval(t);
  }, []);

  function openAuth(tab: "login" | "signup") {
    setAuthTab(tab);
    setAuthOpen(true);
  }

  function selectPredict(i: number) {
    setPredictFading(true);
    setTimeout(() => { setPredictIdx(i); setPredictFading(false); }, 200);
  }

  // style tokens
  const divider:  React.CSSProperties = { height: "0.5px", background: "rgba(127,119,221,.1)", margin: "0 24px" };
  const section:  React.CSSProperties = { padding: "80px 24px", maxWidth: 900, margin: "0 auto" };
  const pill:     React.CSSProperties = { display: "inline-block", fontSize: 10, fontWeight: 500, letterSpacing: ".1em", textTransform: "uppercase", padding: "4px 12px", borderRadius: 20, background: "rgba(127,119,221,.1)", border: "0.5px solid rgba(127,119,221,.25)", color: "#AFA9EC", marginBottom: 16 };
  const h2:       React.CSSProperties = { fontSize: "clamp(22px,3.5vw,34px)", fontWeight: 300, letterSpacing: "-.005em", lineHeight: 1.3, color: "rgba(232,230,250,.9)", marginBottom: 14 };
  const body:     React.CSSProperties = { fontSize: 15, lineHeight: 1.75, color: "rgba(175,169,236,.62)" };
  const card:     React.CSSProperties = { background: "rgba(13,13,26,.88)", border: "0.5px solid rgba(127,119,221,.12)", borderRadius: 14, padding: "20px 22px" };
  const btnCta:   React.CSSProperties = { display: "inline-flex", alignItems: "center", gap: 10, padding: "15px 34px", background: "#534AB7", border: "none", borderRadius: 50, color: "rgba(232,230,250,.95)", fontSize: 15, fontWeight: 500, cursor: "pointer", fontFamily: "inherit" };
  const btnGhost: React.CSSProperties = { display: "inline-flex", alignItems: "center", gap: 8, padding: "13px 24px", background: "transparent", border: "0.5px solid rgba(127,119,221,.25)", borderRadius: 50, color: "#AFA9EC", fontSize: 13.5, cursor: "pointer", fontFamily: "inherit" };

  return (
    <div style={{ background: "#08081a", color: "rgba(232,230,250,.88)", fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif", minHeight: "100vh", overflowX: "hidden" }}>

      {/* NAV */}
      <nav style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "14px 28px", borderBottom: "0.5px solid rgba(127,119,221,.12)", background: "rgba(8,8,26,.92)", position: "sticky", top: 0, zIndex: 100 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 17, fontWeight: 300, letterSpacing: ".08em", color: "rgba(232,230,250,.92)" }}>
          <Logo />
          ThoughtField
        </div>
        <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
          <button onClick={() => openAuth("login")}  style={{ ...btnGhost, padding: "8px 18px", fontSize: 12 }}>Sign in</button>
          <button onClick={() => openAuth("signup")} style={{ ...btnCta,  padding: "8px 20px", fontSize: 12, borderRadius: 20 }}>Sign up</button>
        </div>
      </nav>

      {/* HERO */}
      <div style={{ position: "relative", overflow: "hidden", minHeight: "88vh", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "80px 24px" }}>
        <HeroBackground agentCount={50} opacity={0.85} />

        <div style={{ position: "relative", zIndex: 2, textAlign: "center", maxWidth: 660 }}>
          <div style={pill}>Stanford Generative Agents Architecture</div>
          <h1 style={{ fontSize: "clamp(30px,5vw,52px)", fontWeight: 300, letterSpacing: "-.02em", lineHeight: 1.15, color: "rgba(232,230,250,.95)", marginBottom: 18 }}>
            A living world made of<br />
            <span style={{ color: "#AFA9EC" }}>AI minds</span> — predicting<br />
            what happens next
          </h1>
          <p style={{ ...body, maxWidth: 460, margin: "0 auto 36px" }}>
            Paste any news article, policy document, or social event. ThoughtField generates Multiple diverse agents with real memories and beliefs — and lets them live, argue, and react. The emergent behavior predicts the future.
          </p>
          <div style={{ display: "flex", gap: 14, justifyContent: "center", flexWrap: "wrap" }}>
            <button style={btnCta} onClick={() => router.push("/simulate")}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                <polygon points="6,4 20,12 6,20" fill="rgba(232,230,250,.9)" />
              </svg>
              Run a simulation
            </button>
            <button style={btnGhost} onClick={() => document.getElementById("how-it-works")?.scrollIntoView({ behavior: "smooth" })}>
              See how it works
            </button>
          </div>
        </div>

        {/* live ticker */}
        <div style={{ position: "relative", zIndex: 2, marginTop: 48, background: "rgba(8,8,26,.78)", border: "0.5px solid rgba(127,119,221,.15)", borderRadius: 20, padding: "7px 18px", fontSize: 11.5, color: "rgba(175,169,236,.55)", display: "flex", alignItems: "center", gap: 10, maxWidth: "90vw" }}>
          <div style={{ width: 5, height: 5, borderRadius: "50%", background: "#1D9E75", flexShrink: 0 }} />
          <span style={{ whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{tickerText}</span>
        </div>
      </div>

      <div style={divider} />

      {/* WHAT IS IT */}
      <div style={section}>
        <div style={pill}>What is ThoughtField</div>
        <h2 style={h2}>Not a prediction model. A living society.</h2>
        <p style={{ ...body, maxWidth: 600, marginBottom: 40 }}>
          Traditional forecasting uses statistical patterns. ThoughtField builds a world - drops AI people into it — and watches what emerges. The prediction is not computed. It is observed.
        </p>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: 16 }}>
          {[
            { dot: "#7F77DD", title: "Multi-agent simulation",  desc: "Multiple agents run in parallel. Each has a unique persona, occupation, beliefs, and faction alignment generated directly from your seed text." },
            { dot: "#1D9E75", title: "Emergent behavior",        desc: "Nobody programs the protest. The alliance. The rumor cascade. These emerge from individual agents making thousands of small decisions." },
            { dot: "#D85A30", title: "Structured prediction",    desc: "A ReportAgent synthesizes all memories and reflections into a prediction with confidence score, key drivers, and alternative scenarios." },
          ].map((c) => (
            <div key={c.title} style={card}>
              <div style={{ width: 8, height: 8, borderRadius: "50%", background: c.dot, marginBottom: 14 }} />
              <div style={{ fontSize: 15, fontWeight: 500, color: "rgba(232,230,250,.85)", marginBottom: 6 }}>{c.title}</div>
              <div style={{ fontSize: 13, lineHeight: 1.7, color: "rgba(175,169,236,.55)" }}>{c.desc}</div>
            </div>
          ))}
        </div>
      </div>

      <div style={divider} />

      {/* HOW AGENTS WORK */}
      <div style={section} id="how-it-works">
        <div style={pill}>How agents work</div>
        <h2 style={h2}>Three cognitive layers</h2>
        <p style={{ ...body, maxWidth: 560, marginBottom: 36 }}>
          Every agent implements the Stanford Generative Agents architecture — the same system used to simulate Smallville, a virtual town of 25 AI residents.
        </p>
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          {[
            { num: "1", color: "#7F77DD", title: "Memory stream",   body: "Every observation, conversation, and reflection is stored in a vector database. Retrieval is scored by recency × importance × relevance. An agent who witnessed a betrayal 2 days ago retrieves that memory when they meet the betrayer again — even if 200 other things happened since.", code: "score = recency + importance/10 + cosine_similarity(query, memory)" },
            { num: "2", color: "#1D9E75", title: "Reflection engine", body: "When enough high-importance observations accumulate, agents pause and synthesize. Raw observations become insights that reshape every future decision. An agent who has seen enough injustice starts planning differently.", code: "trigger when: sum(importance, last 20 memories) >= 100" },
            { num: "3", color: "#BA7517", title: "Planning layer",  body: "Every morning agents generate a full hourly day plan based on their persona and recent memories. Plans break when injected world events are significant enough to force a replan. The deviation from plan is where drama lives.", code: "tick: perceive → retrieve → decide → move → speak → remember → reflect?" },
          ].map((layer) => (
            <div key={layer.num} style={{ ...card, borderLeft: `2px solid ${layer.color}`, borderRadius: "0 10px 10px 0", display: "flex", gap: 18, alignItems: "flex-start" }}>
              <div style={{ flexShrink: 0, width: 30, height: 30, borderRadius: "50%", background: `${layer.color}18`, border: `0.5px solid ${layer.color}44`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, fontWeight: 500, color: layer.color }}>{layer.num}</div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 15, fontWeight: 500, color: "rgba(232,230,250,.85)", marginBottom: 6 }}>{layer.title}</div>
                <div style={{ fontSize: 13, lineHeight: 1.7, color: "rgba(175,169,236,.55)", marginBottom: 10 }}>{layer.body}</div>
                <div style={{ fontFamily: "'Courier New', monospace", fontSize: 10.5, color: "rgba(127,119,221,.45)", background: "rgba(127,119,221,.05)", borderRadius: 6, padding: "6px 10px" }}>{layer.code}</div>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div style={divider} />

      {/* WHAT CAN IT PREDICT */}
      <div style={section}>
        <div style={pill}>Real world use cases</div>
        <h2 style={h2}>What can ThoughtField predict?</h2>
        <p style={{ ...body, maxWidth: 540, marginBottom: 28 }}>
          Any scenario where human behavior is the deciding factor. ThoughtField excels where traditional models fail — complex social dynamics with no clean historical data.
        </p>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: 10, marginBottom: 14 }}>
          {PREDICT_CARDS.map((c, i) => (
            <div
              key={c.title}
              onClick={() => selectPredict(i)}
              style={{ ...card, cursor: "pointer", borderColor: i === predictIdx ? "rgba(127,119,221,.45)" : "rgba(127,119,221,.1)", background: i === predictIdx ? "rgba(22,22,44,.98)" : "rgba(13,13,26,.88)", transition: "all .18s" }}
            >
              <div style={{ fontSize: 10, fontWeight: 500, color: c.color, letterSpacing: ".07em", textTransform: "uppercase", marginBottom: 6 }}>{c.label}</div>
              <div style={{ fontSize: 14, fontWeight: 500, color: "rgba(232,230,250,.8)", marginBottom: 5 }}>{c.title}</div>
              <div style={{ fontSize: 12, lineHeight: 1.6, color: "rgba(175,169,236,.5)" }}>{c.desc}</div>
            </div>
          ))}
        </div>
        <div style={{ padding: "14px 18px", background: "rgba(127,119,221,.06)", border: "0.5px solid rgba(127,119,221,.2)", borderRadius: 10, fontSize: 13, color: "rgba(175,169,236,.72)", lineHeight: 1.7, opacity: predictFading ? 0 : 1, transition: "opacity .2s" }}>
          <span style={{ fontWeight: 500, color: "#AFA9EC" }}>Example: </span>
          {PREDICT_EXAMPLES[predictIdx]}
        </div>
      </div>

      <div style={divider} />

      {/* PRODUCT FLOW */}
      <div style={{ ...section, padding: "60px 24px" }}>
        <div style={pill}>Product flow</div>
        <h2 style={{ ...h2, textAlign: "center", marginBottom: 40 }}>From seed to prediction in minutes</h2>
        <div style={{ display: "flex", alignItems: "center", overflowX: "auto", gap: 0 }}>
          {[
            { n: "1", title: "Paste seed",    sub: "Any article, doc, or story",        green: false },
            null,
            { n: "2", title: "Agents spawn",  sub: "LLM generates 25 diverse personas", green: false },
            null,
            { n: "3", title: "World runs",    sub: "Watch agents live in real time",     green: false },
            null,
            { n: "4", title: "Inject events", sub: '"Police arrived at the protest"',   green: false },
            null,
            { n: "5", title: "Read report",   sub: "Confidence score + key drivers",    green: true  },
          ].map((step, i) =>
            step === null ? (
              <div key={i} style={{ width: 32, textAlign: "center", color: "rgba(127,119,221,.22)", fontSize: 20, flexShrink: 0 }}>›</div>
            ) : (
              <div key={i} style={{ flex: 1, minWidth: 100, textAlign: "center", padding: "0 8px" }}>
                <div style={{ width: 42, height: 42, borderRadius: "50%", background: step.green ? "rgba(29,158,117,.12)" : "rgba(127,119,221,.1)", border: `0.5px solid ${step.green ? "rgba(29,158,117,.3)" : "rgba(127,119,221,.2)"}`, display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 10px", fontSize: 16, color: step.green ? "#4ecba0" : "#AFA9EC" }}>
                  {step.n}
                </div>
                <div style={{ fontSize: 12, fontWeight: 500, color: "rgba(232,230,250,.7)", marginBottom: 4 }}>{step.title}</div>
                <div style={{ fontSize: 11, color: "rgba(127,119,221,.38)" }}>{step.sub}</div>
              </div>
            )
          )}
        </div>
      </div>

      <div style={divider} />

      {/* BIG CTA */}
      <div style={{ padding: "100px 24px", textAlign: "center" }}>
        <div style={pill}>Ready to simulate?</div>
        <h2 style={{ ...h2, marginBottom: 12 }}>See your scenario come alive</h2>
        <p style={{ ...body, maxWidth: 400, margin: "0 auto 36px" }}>
          Paste any news story. Watch  AI minds react, argue, and evolve. Get a prediction report in minutes.
        </p>
        <div style={{ display: "flex", gap: 14, justifyContent: "center", flexWrap: "wrap" }}>
          <button style={btnCta} onClick={() => router.push("/simulate")}>
            Start simulating
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
              <path d="M5 12h14M12 5l7 7-7 7" stroke="rgba(232,230,250,.8)" strokeWidth="1.5" strokeLinecap="round" fill="none" />
            </svg>
          </button>
          <a href="https://github.com/spati10/ThoughtField" target="_blank" rel="noopener noreferrer">
            <button style={btnGhost}>
              <svg width="15" height="15" viewBox="0 0 24 24" fill="rgba(175,169,236,.7)">
                <path d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.531 1.032 1.531 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844a9.59 9.59 0 012.504.337c1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.02 10.02 0 0022 12.017C22 6.484 17.522 2 12 2z" />
              </svg>
              View on GitHub
            </button>
          </a>
        </div>
      </div>

      {/* FOOTER */}
      <div style={{ borderTop: "0.5px solid rgba(127,119,221,.1)", padding: "28px 28px", display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 12 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12, color: "rgba(127,119,221,.32)" }}>
          <Logo size={18} />
          ThoughtField · MIT License · Built on Stanford Generative Agents
        </div>
        <div style={{ display: "flex", gap: 20, fontSize: 12, color: "rgba(127,119,221,.32)" }}>
          <a href="https://arxiv.org/abs/2304.03442" target="_blank" rel="noopener noreferrer" style={{ color: "inherit" }}>Paper ↗</a>
          <a href="https://github.com/spati10/ThoughtField" target="_blank" rel="noopener noreferrer" style={{ color: "inherit" }}>GitHub ↗</a>
          <span style={{ cursor: "pointer" }} onClick={() => openAuth("login")}>Sign in</span>
        </div>
      </div>

      {/* AUTH MODAL */}
      <AuthModal open={authOpen} tab={authTab} onClose={() => setAuthOpen(false)} />

    </div>
  );
}