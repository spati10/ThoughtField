"""
ThoughtField — backend/app/report/reporter.py
----------------------------------------------
Prompt 8 of 10.

The ReportAgent. The last cognitive step in ThoughtField.

After the simulation ends, this module reads everything that happened —
every agent's memories, every reflection they formed, the full timeline
of events — and synthesizes it into a structured prediction report.

This is what separates ThoughtField from a toy. The simulation isn't
just a visualization. It's evidence. The ReportAgent treats it as such:
reading the agents like witnesses, the event timeline like a case file,
and the reflections like expert testimony — then writing a verdict.

What it reads from Redis:
  sim:{id}:question       → the user's original prediction question
  sim:{id}:history        → list of up to 1000 tick snapshots (JSON)
  sim:{id}:agents_final   → every agent's persona + memories + reflections
  sim:{id}:world_state    → the extracted world state from the seed text
  sim:{id}:injected_events → any events the user injected mid-simulation

What it returns (and caches as sim:{id}:report):
  predicted_outcome       → 2–3 sentence clear prediction
  confidence              → float 0–1
  key_drivers             → list of 3–5 causal factors
  alternative_scenarios   → list of {scenario, probability, requires}
  sentiment_trajectory    → "escalating" | "stabilizing" | "improving"
  time_horizon            → "within X days / weeks"
  uncertainty_notes       → what could invalidate this prediction
  key_agents              → which agents drove the outcome most
  faction_dynamics        → how each faction ended up positioned
  simulation_summary      → 3–4 sentence narrative of what happened
"""

import json
import logging
import os
import sys
import os
sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))
from openai import AsyncOpenAI

logger = logging.getLogger(__name__)
client = AsyncOpenAI()

REPORT_MODEL = os.getenv("REPORT_MODEL", "gpt-4o")

_SYSTEM = (
    "You are an expert geopolitical and social analyst. "
    "You have just observed a detailed multi-agent social simulation. "
    "Your job is to synthesize what you observed into a rigorous prediction report. "
    "Return ONLY valid JSON. No markdown fences, no preamble, no commentary."
)


# ---------------------------------------------------------------------------
# Main report generation function
# ---------------------------------------------------------------------------

async def generate_report(sim_id: str) -> dict:
    """
    Read the full simulation history and generate a structured prediction report.

    This is called by api/report.py after the simulation status is 'done'.
    The result is cached by the API layer — this function only runs once per sim.

    Args:
        sim_id: The simulation UUID.

    Returns:
        A rich dict containing the prediction, confidence, key drivers,
        alternative scenarios, and a narrative summary of what happened.
        On any failure, returns a safe fallback dict with _error=True.
    """
    from engine.simulation import get_redis
    redis = await get_redis()

    # ------------------------------------------------------------------
    # Load all data from Redis
    # ------------------------------------------------------------------
    question      = await _load_str(redis, f"sim:{sim_id}:question",      fallback="What will happen?")
    world_raw     = await _load_str(redis, f"sim:{sim_id}:world_state",    fallback="{}")
    agents_raw    = await _load_str(redis, f"sim:{sim_id}:agents_final",   fallback="[]")
    injected_raw  = await _load_list(redis, f"sim:{sim_id}:injected_events", limit=20)

    world_state   = _safe_json(world_raw,  {})
    agents_data   = _safe_json(agents_raw, [])

    # Load timeline snapshots (stored newest-first in Redis list, so reverse)
    history_raw   = await redis.lrange(f"sim:{sim_id}:history", 0, 199)
    snapshots     = []
    for raw in reversed(history_raw):   # oldest first
        snap = _safe_json(raw, None)
        if snap:
            snapshots.append(snap)

    logger.info(
        f"[reporter:{sim_id}] Loaded — "
        f"{len(snapshots)} snapshots, "
        f"{len(agents_data)} agents, "
        f"{len(injected_raw)} injected events"
    )

    # ------------------------------------------------------------------
    # Build the evidence package for the LLM
    # ------------------------------------------------------------------
    timeline_text       = _build_timeline(snapshots)
    agent_summary_text  = _build_agent_summary(agents_data)
    reflection_text     = _build_reflections(agents_data)
    faction_text        = _build_faction_analysis(agents_data)
    injected_text       = _build_injected_events(injected_raw)
    world_text          = _build_world_context(world_state)

    # ------------------------------------------------------------------
    # Build the report prompt
    # ------------------------------------------------------------------
    prompt = f"""You observed a {len(snapshots)}-step social simulation.

ORIGINAL QUESTION:
"{question}"

WORLD CONTEXT (extracted from seed text):
{world_text}

SIMULATION TIMELINE (sample of key moments):
{timeline_text}

INJECTED EVENTS (user-triggered world events mid-simulation):
{injected_text}

AGENT BEHAVIOR SUMMARY (what key agents did and said):
{agent_summary_text}

AGENT REFLECTIONS (higher-level insights agents formed over time):
{reflection_text}

FACTION DYNAMICS (how each group ended up):
{faction_text}

Based on everything above, generate a prediction report as a single JSON object:
{{
  "predicted_outcome": "A clear 2-3 sentence prediction that directly answers the original question. Be specific — name likely actors, timelines, and outcomes.",

  "confidence": 0.72,

  "key_drivers": [
    "Factor 1 — specific causal mechanism observed in the simulation",
    "Factor 2 — another driver with evidence from agent behavior",
    "Factor 3 — a third factor",
    "Factor 4 (optional)",
    "Factor 5 (optional)"
  ],

  "alternative_scenarios": [
    {{
      "scenario": "What could happen instead, and why",
      "probability": 0.20,
      "requires": "What would need to be true for this to occur"
    }},
    {{
      "scenario": "A second alternative outcome",
      "probability": 0.12,
      "requires": "Triggering condition"
    }}
  ],

  "sentiment_trajectory": "escalating",

  "time_horizon": "within 5-7 days",

  "uncertainty_notes": "What factors could invalidate this prediction — missing information, volatile actors, external shocks",

  "key_agents": ["Name of most influential agent", "Second most influential"],

  "faction_dynamics": {{
    "faction_name": "How this faction ended up positioned and why"
  }},

  "simulation_summary": "3-4 sentence narrative of what actually happened in the simulation — the arc of events, how tensions evolved, what the agents collectively did."
}}

Rules:
- confidence must be a float between 0.0 and 1.0
- All probabilities in alternative_scenarios must sum to less than (1 - confidence)
- sentiment_trajectory must be exactly one of: "escalating", "stabilizing", "improving"
- Be analytical, not hedging — take a position based on the evidence
- key_agents must be actual names from the simulation, not generic descriptions
- faction_dynamics keys must be actual faction names from the world context"""

    # ------------------------------------------------------------------
    # Call the LLM
    # ------------------------------------------------------------------
    try:
        response = await client.chat.completions.create(
            model=REPORT_MODEL,
            temperature=0.3,    # low temp — we want analytical precision, not creativity
            messages=[
                {"role": "system", "content": _SYSTEM},
                {"role": "user",   "content": prompt},
            ],
        )
        raw = response.choices[0].message.content or ""
    except Exception as e:
        logger.error(f"[reporter:{sim_id}] OpenAI API error: {e}")
        return _fallback_report(question, str(e))

    # ------------------------------------------------------------------
    # Parse and validate
    # ------------------------------------------------------------------
    cleaned = raw.strip()
    if cleaned.startswith("```"):
        lines   = cleaned.splitlines()
        inner   = lines[1:-1] if lines[-1].strip() == "```" else lines[1:]
        cleaned = "\n".join(inner).strip()

    try:
        report = json.loads(cleaned)
    except json.JSONDecodeError as e:
        logger.error(f"[reporter:{sim_id}] JSON parse failed: {e}\nRaw: {raw[:300]}")
        return _fallback_report(question, f"Parse error: {e}")

    # Validate and clamp numeric fields
    report = _validate_report(report, question)

    # Attach metadata
    report["sim_id"]     = sim_id
    report["question"]   = question
    report["n_agents"]   = len(agents_data)
    report["n_snapshots"]= len(snapshots)

    logger.info(
        f"[reporter:{sim_id}] Report generated — "
        f"confidence={report.get('confidence', 0):.2f}, "
        f"trajectory={report.get('sentiment_trajectory')}"
    )
    return report


# ---------------------------------------------------------------------------
# Evidence builders — convert raw Redis data into LLM-readable text
# ---------------------------------------------------------------------------

def _build_timeline(snapshots: list[dict]) -> str:
    """
    Sample the simulation timeline at regular intervals.
    Extracts speech events and action events to show the narrative arc.
    Caps at ~40 lines to avoid bloating the prompt.
    """
    if not snapshots:
        return "  (no timeline data)"

    # Sample evenly: take ~40 snapshots spread across the full run
    total = len(snapshots)
    step  = max(1, total // 40)
    sampled = snapshots[::step][:40]

    lines = []
    for snap in sampled:
        day      = snap.get("sim_day", "?")
        time_str = snap.get("sim_time", "?")
        events   = snap.get("events", [])

        for event in events[:3]:    # max 3 events per tick in timeline
            agent   = event.get("agent", "Unknown")
            content = event.get("content", "")
            etype   = event.get("type", "action")
            target  = event.get("to", "")

            if etype == "speech" and target:
                lines.append(f"  Day {day} {time_str}: {agent} → {target}: \"{content[:80]}\"")
            elif etype == "injected":
                lines.append(f"  Day {day} {time_str}: [WORLD EVENT] {content[:80]}")
            elif etype == "action" and content not in ("wandering quietly", "idle", "pausing, lost in thought"):
                lines.append(f"  Day {day} {time_str}: {agent}: {content[:80]}")

    return "\n".join(lines[:60]) if lines else "  (no significant events recorded)"


def _build_agent_summary(agents_data: list[dict]) -> str:
    """
    Summarize each agent's final state and their last 3 observations.
    Caps at 8 agents to avoid prompt overflow.
    """
    if not agents_data:
        return "  (no agent data)"

    lines = []
    # Prioritize agents with the most memories (most active)
    sorted_agents = sorted(
        agents_data,
        key=lambda a: len(a.get("memories", [])),
        reverse=True,
    )

    for agent_data in sorted_agents[:8]:
        persona  = agent_data.get("persona", {})
        memories = agent_data.get("memories", [])
        name     = persona.get("name", "Unknown")
        occ      = persona.get("occupation", "resident")
        faction  = persona.get("faction", "independent")
        final    = agent_data.get("final_action", "unknown")

        lines.append(f"\n  {name} ({occ}, {faction}):")
        lines.append(f"    Final action: {final}")

        # Last 3 observation-type memories
        obs = [m for m in memories if m.get("type") == "observation"][-3:]
        for m in obs:
            lines.append(f"    - {m['content'][:100]}")

    return "\n".join(lines) if lines else "  (no agent summaries available)"


def _build_reflections(agents_data: list[dict]) -> str:
    """
    Collect all agent reflections — these are the highest-signal data points.
    Reflections represent synthesized insights, not raw observations.
    Caps at 20 total reflections.
    """
    if not agents_data:
        return "  (no reflections)"

    all_reflections = []
    for agent_data in agents_data:
        persona = agent_data.get("persona", {})
        name    = persona.get("name", "Unknown")
        refs    = agent_data.get("reflections", [])
        # Also get reflections from memories list
        mem_refs = [
            m for m in agent_data.get("memories", [])
            if m.get("type") == "reflection"
        ]
        combined = refs + mem_refs

        for r in combined[-2:]:    # last 2 reflections per agent
            content = r.get("content", "") if isinstance(r, dict) else str(r)
            if content.strip():
                all_reflections.append(f"  {name}: \"{content[:120]}\"")

    if not all_reflections:
        return "  (no reflections formed during simulation)"

    return "\n".join(all_reflections[:20])


def _build_faction_analysis(agents_data: list[dict]) -> str:
    """
    Group agents by faction and summarize each faction's collective behavior.
    """
    if not agents_data:
        return "  (no faction data)"

    factions: dict[str, list[dict]] = {}
    for agent_data in agents_data:
        faction = agent_data.get("persona", {}).get("faction") or "independent"
        factions.setdefault(faction, []).append(agent_data)

    lines = []
    for faction_name, members in factions.items():
        names = [m.get("persona", {}).get("name", "?") for m in members[:4]]
        final_actions = [
            m.get("final_action", "unknown")
            for m in members
            if m.get("final_action") not in ("idle", "wandering quietly", None)
        ]

        lines.append(f"\n  {faction_name} ({len(members)} members: {', '.join(names)}):")
        if final_actions:
            # Show most common final actions
            unique_actions = list(dict.fromkeys(final_actions))[:3]
            lines.append(f"    End state: {'; '.join(unique_actions[:80])}")

        # Faction-level reflection summary
        faction_reflections = []
        for m in members:
            refs = [
                r.get("content", "") if isinstance(r, dict) else str(r)
                for r in m.get("reflections", [])[-1:]
            ]
            faction_reflections.extend(refs)

        if faction_reflections:
            lines.append(f"    Collective sentiment: {faction_reflections[0][:100]}")

    return "\n".join(lines) if lines else "  (no faction analysis available)"


def _build_injected_events(injected_raw: list[str]) -> str:
    """Format injected world events for the prompt."""
    if not injected_raw:
        return "  (no events were injected)"

    lines = []
    for raw in injected_raw:
        event = _safe_json(raw, {})
        if isinstance(event, dict):
            content = event.get("content", str(event))
        else:
            content = str(event)
        lines.append(f"  - {content[:120]}")

    return "\n".join(lines)


def _build_world_context(world_state: dict) -> str:
    """Format the world context extracted from the seed text."""
    if not world_state:
        return "  (no world context available)"

    lines = [
        f"  Setting: {world_state.get('setting', 'unknown')}",
        f"  Summary: {world_state.get('summary', 'unknown')[:200]}",
        f"  Tension level: {world_state.get('tension_level', 0.5):.1f} / 1.0",
        f"  Power dynamics: {world_state.get('power_dynamics', 'unknown')}",
    ]

    tensions = world_state.get("tensions", [])
    if tensions:
        lines.append("  Key tensions:")
        for t in tensions[:4]:
            lines.append(f"    - {t}")

    factions = world_state.get("factions", [])
    if factions:
        lines.append("  Factions:")
        for f in factions[:5]:
            lines.append(f"    - {f.get('name','?')}: {f.get('stance','?')}")

    return "\n".join(lines)


# ---------------------------------------------------------------------------
# Validation
# ---------------------------------------------------------------------------

def _validate_report(report: dict, question: str) -> dict:
    """Backfill missing fields and clamp numeric values."""
    report.setdefault("predicted_outcome",  "Outcome could not be determined from simulation data.")
    report.setdefault("confidence",         0.5)
    report.setdefault("key_drivers",        ["Insufficient simulation data"])
    report.setdefault("alternative_scenarios", [])
    report.setdefault("sentiment_trajectory",  "stabilizing")
    report.setdefault("time_horizon",          "unknown timeframe")
    report.setdefault("uncertainty_notes",     "Simulation data may be incomplete.")
    report.setdefault("key_agents",            [])
    report.setdefault("faction_dynamics",      {})
    report.setdefault("simulation_summary",    "Simulation completed.")

    # Clamp confidence
    try:
        report["confidence"] = max(0.0, min(1.0, float(report["confidence"])))
    except (TypeError, ValueError):
        report["confidence"] = 0.5

    # Ensure sentiment_trajectory is one of the three valid values
    valid_trajectories = {"escalating", "stabilizing", "improving"}
    if report.get("sentiment_trajectory") not in valid_trajectories:
        report["sentiment_trajectory"] = "stabilizing"

    # Clamp alternative scenario probabilities
    for scenario in report.get("alternative_scenarios", []):
        try:
            scenario["probability"] = max(0.0, min(0.99, float(scenario.get("probability", 0.1))))
        except (TypeError, ValueError):
            scenario["probability"] = 0.1

    return report


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

async def _load_str(redis, key: str, fallback: str = "") -> str:
    try:
        val = await redis.get(key)
        return val if val else fallback
    except Exception:
        return fallback


async def _load_list(redis, key: str, limit: int = 50) -> list[str]:
    try:
        return await redis.lrange(key, 0, limit - 1)
    except Exception:
        return []


def _safe_json(raw, fallback):
    if not raw:
        return fallback
    try:
        return json.loads(raw)
    except (json.JSONDecodeError, TypeError):
        return fallback


def _fallback_report(question: str, error: str) -> dict:
    return {
        "predicted_outcome":    "Report generation failed. The simulation data was collected but could not be synthesized. Try GET /api/report/{id} again.",
        "confidence":           0.0,
        "key_drivers":          ["Report generation failed"],
        "alternative_scenarios":[],
        "sentiment_trajectory": "stabilizing",
        "time_horizon":         "unknown",
        "uncertainty_notes":    f"Error: {error}",
        "key_agents":           [],
        "faction_dynamics":     {},
        "simulation_summary":   "Could not generate summary.",
        "question":             question,
        "_error":               True,
        "_error_detail":        error,
    }


# ---------------------------------------------------------------------------
# Quick test — run directly: python reporter.py
# (requires a completed simulation in Redis)
# ---------------------------------------------------------------------------
if __name__ == "__main__":
    import asyncio
    import sys, os
    sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))

    async def main():
        sim_id = sys.argv[1] if len(sys.argv) > 1 else None
        if not sim_id:
            print("Usage: python reporter.py <sim_id>")
            print("       (sim_id must be a completed simulation in Redis)")
            return

        print(f"ThoughtField — ReportAgent\nGenerating report for sim: {sim_id}\n")
        report = await generate_report(sim_id)

        print(f"PREDICTED OUTCOME")
        print(f"  {report['predicted_outcome']}\n")
        print(f"CONFIDENCE: {report['confidence']*100:.0f}%")
        print(f"TRAJECTORY: {report['sentiment_trajectory']}")
        print(f"TIME HORIZON: {report['time_horizon']}\n")
        print(f"KEY DRIVERS:")
        for d in report.get("key_drivers", []):
            print(f"  - {d}")
        print(f"\nALTERNATIVE SCENARIOS:")
        for s in report.get("alternative_scenarios", []):
            print(f"  [{s['probability']*100:.0f}%] {s['scenario']}")
        print(f"\nSIMULATION SUMMARY:")
        print(f"  {report['simulation_summary']}")
        print(f"\nUNCERTAINTY:")
        print(f"  {report['uncertainty_notes']}")

    asyncio.run(main())