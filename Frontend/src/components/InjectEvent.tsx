// InjectEvent — God mode input at bottom of right sidebar
// ============================================================================
 
"use client";
 
import { useState } from "react";
import axios from "axios";
 
const API = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
 
interface InjectProps {
  simId: string;
  onInjected: (text: string) => void;
}
 
export function InjectEvent({ simId, onInjected }: InjectProps) {
  const [text,    setText]    = useState("");
  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState<string | null>(null);
 
  async function handleInject() {
    if (!text.trim() || loading) return;
    setLoading(true);
    setError(null);
    try {
      await axios.post(`${API}/api/event`, {
        sim_id:     simId,
        event_text: text.trim(),
      });
      onInjected(text.trim());
      setText("");
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Injection failed";
      setError(msg);
    } finally {
      setLoading(false);
    }
  }
 
  return (
    <div style={{
      padding: "10px 12px",
      borderTop: "0.5px solid rgba(255,255,255,0.08)",
    }}>
      <div style={{
        fontSize: 10,
        fontWeight: 500,
        color: "rgba(255,255,255,0.3)",
        letterSpacing: "0.07em",
        textTransform: "uppercase",
        marginBottom: 6,
      }}>
        Inject event
      </div>
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) handleInject();
        }}
        placeholder="Describe a world event… (⌘↵ to send)"
        rows={2}
        style={{
          width: "100%",
          resize: "none",
          background: "rgba(255,255,255,0.05)",
          border: "0.5px solid rgba(255,255,255,0.1)",
          borderRadius: 6,
          color: "rgba(255,255,255,0.8)",
          fontSize: 11.5,
          padding: "6px 8px",
          outline: "none",
          fontFamily: "inherit",
          marginBottom: 6,
        }}
      />
      {error && (
        <div style={{ fontSize: 11, color: "#E24B4A", marginBottom: 4 }}>{error}</div>
      )}
      <button
        onClick={handleInject}
        disabled={!text.trim() || loading}
        style={{
          width: "100%",
          padding: "6px 0",
          background: text.trim() && !loading
            ? "rgba(226,75,74,0.15)"
            : "rgba(255,255,255,0.04)",
          border: `0.5px solid ${text.trim() && !loading ? "rgba(226,75,74,0.4)" : "rgba(255,255,255,0.1)"}`,
          borderRadius: 6,
          color: text.trim() && !loading
            ? "#E24B4A"
            : "rgba(255,255,255,0.25)",
          fontSize: 11.5,
          cursor: text.trim() && !loading ? "pointer" : "not-allowed",
          fontFamily: "inherit",
        }}
      >
        {loading ? "Sending…" : "Send to all agents"}
      </button>
    </div>
  );
}