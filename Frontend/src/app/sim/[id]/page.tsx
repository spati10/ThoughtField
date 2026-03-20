// ThoughtField — frontend/src/app/sim/[id]/page.tsx
// Prompt 9 of 10.
//
// The live simulation page. Three-column layout:
//   Left  220px — AgentPanel (scrollable agent list)
//   Center       — TownMap canvas + SimClock top bar
//   Right 260px  — EventFeed + InjectEvent
//
// Connects to WebSocket on mount. Navigates to /report/[id] when done.
// Dark theme throughout: #0f0f14 background, rgba panels.

"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter, useParams } from "next/navigation";
import axios from "axios";

import { useSimSocket }             from "@/hooks/useSimSocket";
import useSimStore                  from "@/hooks/useSimStore";
import TownMap                      from "@/components/TownMap";
import { AgentPanel }               from "@/components/AgentPanel";
import { EventFeed }                from "@/components/EventFeed";
import { InjectEvent }              from "@/components/InjectEvent";
import { SimClock }                 from "@/components/SimClock";

const API = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
interface Area {
  x: number; y: number;
  w: number; h: number;
  color: string;
}

interface WorldMap {
  areas: Record<string, Area>;
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------
export default function SimPage() {
  const params = useParams();
  const simId  = params?.id as string;
  const router = useRouter();

  // Zustand store
  const {
    agents, simTime, simDay, progress, status,
    events, stats, connected, selectedAgentId,
    selectAgent, addInjectedEvent,
  } = useSimStore();

  // World map (loaded once from API)
  const [worldMap, setWorldMap] = useState<WorldMap | null>(null);

  // Connect WebSocket
  useSimSocket(simId);

  // Load world map on mount
  useEffect(() => {
    if (!simId) return;
    axios
      .get<WorldMap>(`${API}/api/simulate/${simId}/world`)
      .then((res) => setWorldMap(res.data))
      .catch((err) => console.error("Failed to load world map:", err));
  }, [simId]);

  // Navigate to report when simulation is done
  useEffect(() => {
    if (status === "done") {
      const timer = setTimeout(() => {
        router.push(`/report/${simId}`);
      }, 2000);   // brief delay so user sees the "done" status
      return () => clearTimeout(timer);
    }
  }, [status, simId, router]);

  const handleAgentClick = useCallback((id: string) => {
    selectAgent(id === selectedAgentId ? null : id);
  }, [selectedAgentId, selectAgent]);

  const handleEventInjected = useCallback((text: string) => {
    addInjectedEvent(text);
  }, [addInjectedEvent]);

  // Selected agent detail
  const selectedAgent = selectedAgentId ? agents[selectedAgentId] : null;

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------
  return (
    <div style={{
      display:         "flex",
      flexDirection:   "column",
      height:          "100vh",
      background:      "#0f0f14",
      color:           "rgba(255,255,255,0.8)",
      fontFamily:      "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
      overflow:        "hidden",
    }}>

      {/* ---- Top bar: SimClock ---- */}
      <SimClock
        simTime={simTime}
        simDay={simDay}
        progress={progress}
        status={status}
        connected={connected}
        nAgents={Object.keys(agents).length}
        stats={stats}
      />

      {/* ---- Done banner ---- */}
      {status === "done" && (
        <div style={{
          padding:     "8px 16px",
          background:  "rgba(29,158,117,0.12)",
          border:      "0.5px solid rgba(29,158,117,0.3)",
          color:       "#1D9E75",
          fontSize:    12,
          textAlign:   "center",
        }}>
          Simulation complete — generating prediction report…
        </div>
      )}

      {/* ---- Main three-column layout ---- */}
      <div style={{
        flex:          1,
        display:       "flex",
        overflow:      "hidden",
        gap:           0,
      }}>

        {/* ==== LEFT: Agent Panel ==== */}
        <div style={{
          width:        220,
          flexShrink:   0,
          borderRight:  "0.5px solid rgba(255,255,255,0.08)",
          overflowY:    "auto",
          display:      "flex",
          flexDirection:"column",
        }}>
          <AgentPanel
            agents={agents}
            selectedId={selectedAgentId}
            onSelect={handleAgentClick}
          />
        </div>

        {/* ==== CENTER: Town Map + optional agent detail ==== */}
        <div style={{
          flex:          1,
          display:       "flex",
          flexDirection: "column",
          overflow:      "hidden",
          padding:       12,
          gap:           12,
        }}>
          {/* Map */}
          <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", minHeight: 0 }}>
            {worldMap ? (
              <TownMap
                agents={agents}
                areas={worldMap.areas}
                selectedId={selectedAgentId}
                onAgentClick={handleAgentClick}
              />
            ) : (
              <div style={{ color: "rgba(255,255,255,0.2)", fontSize: 13 }}>
                Loading world map…
              </div>
            )}
          </div>

          {/* Selected agent detail card */}
          {selectedAgent && (
            <div style={{
              background:   "rgba(255,255,255,0.04)",
              border:       `0.5px solid ${selectedAgent.color}44`,
              borderRadius: 8,
              padding:      "10px 14px",
              flexShrink:   0,
            }}>
              <div style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
                <div style={{
                  width: 32, height: 32,
                  borderRadius: "50%",
                  background: selectedAgent.color + "33",
                  border: `1.5px solid ${selectedAgent.color}`,
                  display: "flex", alignItems: "center", justifyContent: "center",
                  fontSize: 11, fontWeight: 500, color: selectedAgent.color,
                  flexShrink: 0,
                }}>
                  {selectedAgent.name.split(" ").map((n) => n[0]).join("").slice(0, 2)}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 500, color: "rgba(255,255,255,0.9)", marginBottom: 2 }}>
                    {selectedAgent.name}
                  </div>
                  <div style={{ fontSize: 11, color: "rgba(255,255,255,0.4)" }}>
                    {selectedAgent.occupation}
                    {selectedAgent.faction ? ` · ${selectedAgent.faction}` : ""}
                  </div>
                  <div style={{
                    marginTop: 6,
                    fontSize: 11.5,
                    color: "rgba(255,255,255,0.6)",
                    fontStyle: "italic",
                  }}>
                    {selectedAgent.current_action}
                  </div>
                  {selectedAgent.speaking && (
                    <div style={{
                      marginTop: 5,
                      padding: "4px 8px",
                      background: selectedAgent.color + "18",
                      borderLeft: `2px solid ${selectedAgent.color}`,
                      borderRadius: "0 4px 4px 0",
                      fontSize: 11.5,
                      color: "rgba(255,255,255,0.7)",
                    }}>
                      "{selectedAgent.speaking}"
                    </div>
                  )}
                </div>
                <button
                  onClick={() => selectAgent(null)}
                  style={{
                    background: "transparent",
                    border: "none",
                    color: "rgba(255,255,255,0.3)",
                    cursor: "pointer",
                    fontSize: 14,
                    lineHeight: 1,
                    padding: 0,
                  }}
                >
                  ×
                </button>
              </div>
            </div>
          )}
        </div>

        {/* ==== RIGHT: Event Feed + Inject ====  */}
        <div style={{
          width:        260,
          flexShrink:   0,
          borderLeft:   "0.5px solid rgba(255,255,255,0.08)",
          display:      "flex",
          flexDirection:"column",
          overflow:     "hidden",
        }}>
          {/* Event feed takes all available space */}
          <div style={{ flex: 1, overflow: "hidden" }}>
            <EventFeed
              events={events}
              simTime={simTime}
              simDay={simDay}
            />
          </div>

          {/* Inject event at bottom */}
          {status === "running" && (
            <InjectEvent
              simId={simId}
              onInjected={handleEventInjected}
            />
          )}
        </div>

      </div>
    </div>
  );
}