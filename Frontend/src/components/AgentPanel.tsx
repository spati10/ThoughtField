"use client";
 
import type { AgentState } from "@/hooks/useSimStore";
 
interface Props {
  agents:     Record<string, AgentState>;
  selectedId: string | null;
  onSelect:   (id: string) => void;
}
 
export function AgentPanel({ agents, selectedId, onSelect }: Props) {
  const list = Object.values(agents).sort((a, b) =>
    a.name.localeCompare(b.name)
  );
 
  return (
    <div style={{ height: "100%", display: "flex", flexDirection: "column" }}>
      {/* Header */}
      <div style={{
        padding: "10px 12px 8px",
        borderBottom: "0.5px solid rgba(255,255,255,0.08)",
        fontSize: 11,
        fontWeight: 500,
        color: "rgba(255,255,255,0.35)",
        letterSpacing: "0.07em",
        textTransform: "uppercase",
      }}>
        Agents · {list.length}
      </div>
 
      {/* List */}
      <div style={{ flex: 1, overflowY: "auto" }}>
        {list.map((agent) => {
          const isSelected = agent.id === selectedId;
          return (
            <div
              key={agent.id}
              onClick={() => onSelect(agent.id)}
              style={{
                padding:       "8px 12px",
                cursor:        "pointer",
                borderBottom:  "0.5px solid rgba(255,255,255,0.04)",
                background:    isSelected ? "rgba(255,255,255,0.06)" : "transparent",
                transition:    "background 0.1s",
              }}
            >
              {/* Name row */}
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 3 }}>
                <div style={{
                  width: 8, height: 8,
                  borderRadius: "50%",
                  background: agent.color,
                  flexShrink: 0,
                  boxShadow: agent.speaking ? `0 0 6px ${agent.color}` : "none",
                  transition: "box-shadow 0.3s",
                }} />
                <span style={{
                  fontSize: 12.5,
                  fontWeight: 500,
                  color: "rgba(255,255,255,0.85)",
                  whiteSpace: "nowrap",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                }}>
                  {agent.name}
                </span>
                {agent.faction && (
                  <span style={{
                    fontSize: 9,
                    padding: "1px 5px",
                    borderRadius: 8,
                    background: agent.color + "22",
                    color: agent.color,
                    border: `0.6px solid ${agent.color}44`,
                    whiteSpace: "nowrap",
                    marginLeft: "auto",
                    flexShrink: 0,
                  }}>
                    {agent.faction.split(" ").slice(0, 2).join(" ")}
                  </span>
                )}
              </div>
 
              {/* Action */}
              <div style={{
                fontSize: 11,
                color: "rgba(255,255,255,0.38)",
                paddingLeft: 16,
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              }}>
                {agent.current_action || "idle"}
              </div>
 
              {/* Speech bubble if speaking */}
              {agent.speaking && (
                <div style={{
                  marginTop: 5,
                  marginLeft: 16,
                  padding: "4px 8px",
                  background: "rgba(255,255,255,0.06)",
                  borderRadius: 6,
                  fontSize: 11,
                  color: "rgba(255,255,255,0.65)",
                  fontStyle: "italic",
                  borderLeft: `2px solid ${agent.color}`,
                }}>
                  "{agent.speaking.slice(0, 60)}{agent.speaking.length > 60 ? "…" : ""}"
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
