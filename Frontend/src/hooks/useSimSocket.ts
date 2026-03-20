// ThoughtField — frontend/src/hooks/useSimSocket.ts
// Prompt 9 of 10.
//
// WebSocket hook that connects to /ws/sim/{simId} and pipes
// every message into the Zustand store. Auto-reconnects on disconnect.

import { useEffect, useRef } from "react";
import useSimStore from "./useSimStore";

const WS_BASE = process.env.NEXT_PUBLIC_WS_URL || "ws://localhost:8000";
const RECONNECT_DELAY_MS = 2000;

export function useSimSocket(simId: string | null) {
  const wsRef    = useRef<WebSocket | null>(null);
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const {
    setAgents, setSimTime, setDay, setProgress,
    setStatus, setConnected, setStats, addEvent,
  } = useSimStore();

  useEffect(() => {
    if (!simId) return;

    let cancelled = false;

    function connect() {
      if (cancelled) return;

      const ws = new WebSocket(`${WS_BASE}/ws/sim/${simId}`);
      wsRef.current = ws;

      ws.onopen = () => {
        if (cancelled) { ws.close(); return; }
        setConnected(true);
      };

      ws.onclose = () => {
        setConnected(false);
        if (!cancelled) {
          timerRef.current = setTimeout(connect, RECONNECT_DELAY_MS);
        }
      };

      ws.onerror = () => ws.close();

      ws.onmessage = (evt) => {
        if (cancelled) return;
        try {
          const data = JSON.parse(evt.data as string);
          handleMessage(data);
        } catch {
          // ignore malformed frames
        }
      };
    }

    function handleMessage(data: Record<string, unknown>) {
      // Agents positions & state
      if (data.agents && typeof data.agents === "object") {
        setAgents(data.agents as Parameters<typeof setAgents>[0]);
      }

      // Sim clock
      if (typeof data.sim_time === "string") setSimTime(data.sim_time);
      if (typeof data.sim_day  === "number") setDay(data.sim_day);
      if (typeof data.progress === "number") setProgress(data.progress);

      // Status
      if (typeof data.status === "string") {
        setStatus(data.status as Parameters<typeof setStatus>[0]);
      }

      // Stats
      if (data.stats && typeof data.stats === "object") {
        setStats(data.stats as Parameters<typeof setStats>[0]);
      }

      // Events from this tick
      if (Array.isArray(data.events)) {
        (data.events as Record<string, unknown>[]).forEach((e) => {
          addEvent({
            type:    (e.type as "speech" | "action" | "injected") || "action",
            agent:   (e.agent  as string) || "unknown",
            color:   (e.color  as string) || "#888780",
            content: (e.content as string) || "",
            to:      (e.to as string | undefined),
            faction: (e.faction as string | undefined),
          });
        });
      }

      // God-mode injected event banner
      if (data.type === "god_mode" && typeof data.injected_event === "string") {
        addEvent({
          type:    "injected",
          agent:   "World Event",
          color:   "#E24B4A",
          content: data.injected_event as string,
        });
      }
    }

    connect();

    return () => {
      cancelled = true;
      setConnected(false);
      if (timerRef.current) clearTimeout(timerRef.current);
      wsRef.current?.close();
    };
  }, [simId]); // eslint-disable-line react-hooks/exhaustive-deps

  return { ws: wsRef.current };
}