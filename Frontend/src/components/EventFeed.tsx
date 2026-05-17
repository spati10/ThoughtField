
"use client";
 
import { useEffect, useRef } from "react";
import type { SimEvent } from "@/hooks/useSimStore";
 
interface FeedProps {
  events:  SimEvent[];
  simTime: string;
  simDay:  number;
}
 
export function EventFeed({ events, simTime, simDay }: FeedProps) {
  const bottomRef = useRef<HTMLDivElement>(null);
 
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [events.length]);
 
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
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
      }}>
        <span>Live feed</span>
        <span style={{ color: "rgba(255,255,255,0.25)", fontSize: 10 }}>
          Day {simDay} · {simTime}
        </span>
      </div>
 
      {/* Feed */}
      <div style={{ flex: 1, overflowY: "auto", padding: "4px 0" }}>
        {events.length === 0 && (
          <div style={{
            padding: "20px 12px",
            fontSize: 12,
            color: "rgba(255,255,255,0.2)",
            textAlign: "center",
          }}>
            Waiting for agents to act…
          </div>
        )}
 
        {events.map((evt) => (
          <div
            key={evt.id}
            style={{
              padding: "6px 12px",
              borderBottom: "0.5px solid rgba(255,255,255,0.04)",
            }}
          >
            {evt.type === "injected" ? (
              // God-mode event — red banner
              <div style={{
                background: "rgba(226,75,74,0.12)",
                border: "0.5px solid rgba(226,75,74,0.3)",
                borderRadius: 6,
                padding: "5px 8px",
                fontSize: 11,
                color: "#E24B4A",
              }}>
                <span style={{ fontWeight: 500 }}>World event: </span>
                {evt.content}
              </div>
            ) : evt.type === "speech" ? (
              // Speech event
              <div>
                <div style={{ display: "flex", gap: 6, alignItems: "center", marginBottom: 3 }}>
                  <div style={{
                    width: 6, height: 6,
                    borderRadius: "50%",
                    background: evt.color,
                    flexShrink: 0,
                  }} />
                  <span style={{ fontSize: 11, fontWeight: 500, color: evt.color }}>
                    {evt.agent}
                  </span>
                  {evt.to && (
                    <>
                      <span style={{ fontSize: 10, color: "rgba(255,255,255,0.25)" }}>→</span>
                      <span style={{ fontSize: 11, color: "rgba(255,255,255,0.45)" }}>
                        {evt.to}
                      </span>
                    </>
                  )}
                </div>
                <div style={{
                  paddingLeft: 12,
                  fontSize: 11.5,
                  color: "rgba(255,255,255,0.7)",
                  fontStyle: "italic",
                  lineHeight: 1.5,
                }}>
                  "{evt.content}"
                </div>
              </div>
            ) : (
              // Action event
              <div style={{ display: "flex", gap: 6, alignItems: "flex-start" }}>
                <div style={{
                  width: 6, height: 6, marginTop: 4,
                  borderRadius: 1,
                  background: evt.color + "88",
                  flexShrink: 0,
                }} />
                <div>
                  <span style={{ fontSize: 11, color: evt.color + "cc" }}>
                    {evt.agent}
                  </span>
                  <span style={{ fontSize: 11, color: "rgba(255,255,255,0.35)" }}>
                    {" — "}{evt.content}
                  </span>
                </div>
              </div>
            )}
          </div>
        ))}
        <div ref={bottomRef} />
      </div>
    </div>
  );
}
