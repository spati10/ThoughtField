// ThoughtField — frontend/src/lib/types.ts
// Shared TypeScript types used across pages and components.
// Import from here instead of redefining inline.

// ---------------------------------------------------------------------------
// Agent
// ---------------------------------------------------------------------------

export interface AgentState {
  id:             string;
  name:           string;
  x:              number;
  y:              number;
  color:          string;
  occupation:     string;
  faction:        string | null;
  current_action: string;
  speaking:       string | null;
  speaking_to:    string | null;
}

export interface AgentPersona {
  id:                string;
  name:              string;
  age:               number;
  occupation:        string;
  faction:           string | null;
  economic_status:   string;
  traits:            string[];
  beliefs:           string[];
  goals:             string[];
  stake_in_scenario: string;
  relationships:     Record<string, string>;
  seed_memories:     string[];
  home_location:     string;
  work_location:     string;
  color:             string;
}

export interface AgentMemory {
  id:            string;
  content:       string;
  type:          "observation" | "reflection" | "plan";
  timestamp:     number;
  importance:    number;
  last_accessed: number;
}

// ---------------------------------------------------------------------------
// World
// ---------------------------------------------------------------------------

export interface WorldArea {
  x:           number;
  y:           number;
  w:           number;
  h:           number;
  color:       string;
  objects?:    string[];
  capacity?:   number;
  description?: string;
}

export interface WorldMap {
  width:   number;
  height:  number;
  areas:   Record<string, WorldArea>;
  connections?: [string, string][];
}

// ---------------------------------------------------------------------------
// Simulation events (live feed)
// ---------------------------------------------------------------------------

export interface SimEvent {
  id:        string;        // uuid assigned client-side
  type:      "speech" | "action" | "injected" | "system";
  agent:     string;
  color:     string;
  content:   string;
  to?:       string;
  faction?:  string | null;
  timestamp: number;        // Date.now()
}

// ---------------------------------------------------------------------------
// Simulation stats
// ---------------------------------------------------------------------------

export interface SimStats {
  total_agents: number;
  speaking_now: number;
  factions:     Record<string, number>;
}

// ---------------------------------------------------------------------------
// Simulation status
// ---------------------------------------------------------------------------

export type SimStatus =
  | "idle"
  | "initializing"
  | "running"
  | "done"
  | "error"
  | "cancelled";

export interface SimStatusResponse {
  sim_id:   string;
  status:   SimStatus;
  progress: number;
  sim_time: string | null;
  sim_day:  number | null;
  n_agents: number | null;
  error:    string | null;
}

// ---------------------------------------------------------------------------
// Simulation start
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

// ---------------------------------------------------------------------------
// Report
// ---------------------------------------------------------------------------

export interface AlternativeScenario {
  scenario:    string;
  probability: number;
  requires:    string;
}

export interface ReportData {
  predicted_outcome:     string;
  confidence:            number;
  key_drivers:           string[];
  alternative_scenarios: AlternativeScenario[];
  sentiment_trajectory:  "escalating" | "stabilizing" | "improving";
  time_horizon:          string;
  uncertainty_notes:     string;
  key_agents:            string[];
  faction_dynamics:      Record<string, string>;
  simulation_summary:    string;
  question:              string;
  n_agents:              number;
  n_snapshots:           number;
  sim_id:                string;
  _error?:               boolean;
}

export interface ReportResponse {
  sim_id:   string;
  status:   string;
  report:   ReportData | null;
  cached?:  boolean;
  message?: string;
  progress?: number;
}