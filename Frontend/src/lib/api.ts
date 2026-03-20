// ThoughtField — frontend/src/lib/api.ts
// Prompt 10 of 10.
//
// Typed axios API client. All backend calls go through here.
// Import this in any page or component that needs to talk to the API.

import axios from "axios";

const BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

const http = axios.create({
  baseURL: BASE,
  timeout: 60_000,   // 60s — persona generation can be slow
});

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface SimulateRequest {
  seed:      string;
  question:  string;
  n_agents:  number;
  sim_days:  number;
}

export interface SimulateResponse {
  sim_id:   string;
  status:   string;
  n_agents: number;
  sim_days: number;
  message:  string;
}

export interface SimStatusResponse {
  sim_id:   string;
  status:   string;
  progress: number;
  sim_time: string | null;
  sim_day:  number | null;
  n_agents: number | null;
  error:    string | null;
}

export interface AlternativeScenario {
  scenario:    string;
  probability: number;
  requires:    string;
}

export interface ReportData {
  predicted_outcome:      string;
  confidence:             number;
  key_drivers:            string[];
  alternative_scenarios:  AlternativeScenario[];
  sentiment_trajectory:   "escalating" | "stabilizing" | "improving";
  time_horizon:           string;
  uncertainty_notes:      string;
  key_agents:             string[];
  faction_dynamics:       Record<string, string>;
  simulation_summary:     string;
  question:               string;
  n_agents:               number;
  n_snapshots:            number;
  sim_id:                 string;
  _error?:                boolean;
}

export interface ReportResponse {
  sim_id:  string;
  status:  string;
  report:  ReportData | null;
  cached?: boolean;
  message?: string;
}

export interface AgentPersona {
  id:                 string;
  name:               string;
  age:                number;
  occupation:         string;
  faction:            string | null;
  economic_status:    string;
  traits:             string[];
  beliefs:            string[];
  goals:              string[];
  stake_in_scenario:  string;
  color:              string;
  seed_memories:      string[];
}

// ---------------------------------------------------------------------------
// API functions
// ---------------------------------------------------------------------------

export const api = {

  /** Start a new simulation. Returns sim_id immediately. */
  async startSimulation(req: SimulateRequest): Promise<SimulateResponse> {
    const res = await http.post<SimulateResponse>("/api/simulate", req);
    return res.data;
  },

  /** Poll simulation status and progress. */
  async getStatus(simId: string): Promise<SimStatusResponse> {
    const res = await http.get<SimStatusResponse>(`/api/simulate/${simId}/status`);
    return res.data;
  },

  /** Get the prediction report. Returns null report if still running. */
  async getReport(simId: string): Promise<ReportResponse> {
    const res = await http.get<ReportResponse>(`/api/report/${simId}`);
    return res.data;
  },

  /** Get list of agent personas for a simulation. */
  async getAgents(simId: string): Promise<AgentPersona[]> {
    const res = await http.get<{ agents: AgentPersona[] }>(
      `/api/simulate/${simId}/agents`
    );
    return res.data.agents;
  },

  /** Inject a world event into a running simulation. */
  async injectEvent(simId: string, eventText: string): Promise<void> {
    await http.post("/api/event", { sim_id: simId, event_text: eventText });
  },

  /** Health check. */
  async health(): Promise<boolean> {
    try {
      await http.get("/health");
      return true;
    } catch {
      return false;
    }
  },
};

export default api;