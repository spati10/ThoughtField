
"use client";
 
interface ClockProps {
  simTime:  string;
  simDay:   number;
  progress: number;
  status:   string;
  connected: boolean;
  nAgents?: number;
  stats?: { speaking_now: number; factions: Record<string, number> } | null;
}
 
export function SimClock({
  simTime, simDay, progress, status, connected, nAgents, stats,
}: ClockProps) {
  const statusColor =
    status === "running"      ? "#1D9E75" :
    status === "done!"         ? "#378ADD" :
    status === "error!"        ? "#E24B4A" :
    status === "initializing" ? "#BA7517" :
    "rgba(255,255,255,0.3)";
 
  return (
    <div style={{
      display:        "flex",
      alignItems:     "center",
      gap:            16,
      padding:        "8px 16px",
      borderBottom:   "0.5px solid rgba(255,255,255,0.08)",
      background:     "rgba(255,255,255,0.02)",
      flexWrap:       "wrap",
    }}>
      {/* Product name */}
      <span style={{
        fontSize: 13,
        fontWeight: 500,
        color: "rgba(255,255,255,0.9)",
        letterSpacing: "0.02em",
      }}>
        ThoughtField
      </span>
 
      {/* Divider */}
      <div style={{ width: 1, height: 14, background: "rgba(255,255,255,0.1)" }} />
 
      {/* Day + time */}
      <span style={{ fontSize: 12, color: "rgba(255,255,255,0.55)", fontVariantNumeric: "tabular-nums" }}>
        Day {simDay} · {simTime || "—"}
      </span>
 
      {/* Status badge */}
      <div style={{
        display: "flex", alignItems: "center", gap: 5,
        padding: "2px 8px",
        borderRadius: 12,
        background: statusColor + "18",
        border: `0.5px solid ${statusColor}44`,
      }}>
        <div style={{
          width: 5, height: 5, borderRadius: "50%",
          background: statusColor,
          animation: status === "running" ? "pulse 2s ease-in-out infinite" : "none",
        }} />
        <span style={{ fontSize: 10.5, color: statusColor, fontWeight: 500 }}>
          {status}
        </span>
      </div>
 
      {/* Connection indicator */}
      <div style={{
        width: 6, height: 6, borderRadius: "50%",
        background: connected ? "#1D9E75" : "#888780",
        title: connected ? "Connected" : "Disconnected",
      }} />
 
      {/* Stats */}
      {stats && (
        <span style={{ fontSize: 11, color: "rgba(255,255,255,0.3)", marginLeft: "auto" }}>
          {nAgents} agents · {stats.speaking_now} speaking
        </span>
      )}
 
      {/* Progress bar */}
      <div style={{
        width: "100%",
        height: 2,
        background: "rgba(255,255,255,0.08)",
        borderRadius: 1,
      }}>
        <div style={{
          height: "100%",
          width: `${Math.round(progress)}%`,
          background: statusColor,
          borderRadius: 1,
          transition: "width 0.5s ease",
        }} />
      </div>
 
      <style>{`
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50%       { opacity: 0.4; }
        }
      `}</style>
    </div>
  );
}
 
