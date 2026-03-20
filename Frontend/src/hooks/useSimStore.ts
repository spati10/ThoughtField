// ThoughtField — frontend/src/hooks/useSimStore.ts
// Prompt 9 of 10.
//
// Zustand global store for the live simulation state.
// Single source of truth for everything the frontend displays.
// Updated by useSimSocket every time a WebSocket message arrives.

import { create } from "zustand";

export interface AgentState {
  id: string;
  name: string;
  x: number;
  y: number;
  color: string;
  occupation: string;
  faction: string | null;
  current_action: string;
  speaking: string | null;
  speaking_to: string | null;
}

export interface SimEvent {
  id: string;           // uuid assigned client-side
  type: "speech" | "action" | "injected" | "system";
  agent: string;
  color: string;
  content: string;
  to?: string;
  faction?: string | null;
  timestamp: number;    // Date.now()
}

export interface SimStats {
  total_agents: number;
  speaking_now: number;
  factions: Record<string, number>;
}

interface SimStore {
  // Core state
  agents: Record<string, AgentState>;
  simTime: string;
  simDay: number;
  progress: number;
  status: "idle" | "initializing" | "running" | "done" | "error" | "cancelled";
  events: SimEvent[];
  stats: SimStats | null;
  connected: boolean;

  // Selected agent (for AgentPanel detail view)
  selectedAgentId: string | null;

  // Injected event history (shown in InjectEvent panel)
  injectedEvents: string[];

  // Setters
  setAgents: (agents: Record<string, AgentState>) => void;
  setSimTime: (t: string) => void;
  setDay: (d: number) => void;
  setProgress: (p: number) => void;
  setStatus: (s: SimStore["status"]) => void;
  setConnected: (c: boolean) => void;
  setStats: (s: SimStats) => void;
  addEvent: (e: Omit<SimEvent, "id" | "timestamp">) => void;
  addInjectedEvent: (text: string) => void;
  selectAgent: (id: string | null) => void;
  reset: () => void;
}

const MAX_EVENTS = 80;

const useSimStore = create<SimStore>((set) => ({
  agents: {},
  simTime: "",
  simDay: 1,
  progress: 0,
  status: "idle",
  events: [],
  stats: null,
  connected: false,
  selectedAgentId: null,
  injectedEvents: [],

  setAgents:    (agents)    => set({ agents }),
  setSimTime:   (simTime)   => set({ simTime }),
  setDay:       (simDay)    => set({ simDay }),
  setProgress:  (progress)  => set({ progress }),
  setStatus:    (status)    => set({ status }),
  setConnected: (connected) => set({ connected }),
  setStats:     (stats)     => set({ stats }),

  addEvent: (e) =>
    set((state) => ({
      events: [
        ...state.events.slice(-(MAX_EVENTS - 1)),
        {
          ...e,
          id: Math.random().toString(36).slice(2),
          timestamp: Date.now(),
        },
      ],
    })),

  addInjectedEvent: (text) =>
    set((state) => ({
      injectedEvents: [...state.injectedEvents.slice(-19), text],
    })),

  selectAgent: (selectedAgentId) => set({ selectedAgentId }),

  reset: () =>
    set({
      agents: {},
      simTime: "",
      simDay: 1,
      progress: 0,
      status: "idle",
      events: [],
      stats: null,
      connected: false,
      selectedAgentId: null,
      injectedEvents: [],
    }),
}));

export default useSimStore;