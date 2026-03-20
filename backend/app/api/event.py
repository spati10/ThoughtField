"""
ThoughtField — backend/app/api/event.py
----------------------------------------
Prompt 7 of 10.

POST /api/event  — inject a live event into a running simulation

This is ThoughtField's "God mode". While the simulation is running,
the user can type any event into the frontend InjectEvent component
and push it to all agents simultaneously.

Every agent receives the event text in their injected_event field.
On their next tick(), they perceive it and react to it in character —
deviating from their current plan if the event is significant enough.

Examples:
  "The university president just resigned live on camera"
  "Police have arrived at the protest"
  "A video of admin misconduct went viral on social media"
  "The faculty union just announced a solidarity strike"

The event is consumed by each agent exactly once (cleared after tick).
"""

import logging
import sys
import os
sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from engine.simulation import get_redis

logger = logging.getLogger(__name__)
router = APIRouter()

# In-memory registry of active agent lists per sim
# Populated by simulate.py when a sim is launched
# Format: sim_id → list[Agent]
_sim_agents: dict[str, list] = {}


def register_agents(sim_id: str, agents: list):
    """
    Called by simulate.py to register agents for event injection.
    Must be called before POST /api/event will work.
    """
    _sim_agents[sim_id] = agents
    logger.debug(f"[sim:{sim_id}] {len(agents)} agents registered for event injection")


def deregister_agents(sim_id: str):
    """Clean up after simulation completes."""
    _sim_agents.pop(sim_id, None)


# ---------------------------------------------------------------------------
# Request / Response models
# ---------------------------------------------------------------------------

class EventRequest(BaseModel):
    sim_id:     str  = Field(..., description="Simulation ID to inject into")
    event_text: str  = Field(..., min_length=5, max_length=500,
                             description="The event to inject — be specific and dramatic")


class EventResponse(BaseModel):
    sim_id:      str
    event_text:  str
    agents_notified: int
    message:     str


# ---------------------------------------------------------------------------
# POST /api/event
# ---------------------------------------------------------------------------

@router.post("/event", response_model=EventResponse)
async def inject_event(req: EventRequest):
    """
    Inject a world event into all agents in a running simulation.

    Each agent receives the event_text in their injected_event field.
    On their next tick they will perceive and react to it in character.

    Returns 404 if sim_id is unknown.
    Returns 409 if the simulation is not currently running.
    """
    redis = await get_redis()

    # Verify simulation is running
    status = await redis.get(f"sim:{req.sim_id}:status")
    if not status:
        raise HTTPException(status_code=404, detail=f"Simulation '{req.sim_id}' not found")

    if status not in ("running", "initializing"):
        raise HTTPException(
            status_code=409,
            detail=f"Simulation is '{status}' — events can only be injected into running sims",
        )

    # Inject into all registered agents
    agents = _sim_agents.get(req.sim_id, [])
    count  = 0
    for agent in agents:
        agent.inject_event(req.event_text)
        count += 1

    # Also store in Redis so it appears in the event feed
    import json, time
    event_record = {
        "type":       "injected",
        "content":    req.event_text,
        "timestamp":  time.time(),
        "agent":      "God Mode",
        "color":      "#E24B4A",
    }
    await redis.lpush(
        f"sim:{req.sim_id}:injected_events",
        json.dumps(event_record),
    )

    # Publish to WebSocket so the frontend event feed shows it immediately
    await redis.publish(
        f"sim:{req.sim_id}:state",
        json.dumps({"injected_event": req.event_text, "type": "god_mode"}),
    )

    logger.info(
        f"[sim:{req.sim_id}] Event injected → {count} agents notified: "
        f"'{req.event_text[:60]}'"
    )

    return EventResponse(
        sim_id=req.sim_id,
        event_text=req.event_text,
        agents_notified=count,
        message=f"Event delivered to {count} agents. They will react on their next tick.",
    )


# ---------------------------------------------------------------------------
# GET /api/event/{sim_id}/history
# ---------------------------------------------------------------------------

@router.get("/event/{sim_id}/history")
async def get_injected_events(sim_id: str):
    """
    Return all events that have been injected into a simulation.
    Shown in the frontend InjectEvent panel as a history list.
    """
    import json
    redis = await get_redis()
    raw_events = await redis.lrange(f"sim:{sim_id}:injected_events", 0, 49)
    events = []
    for raw in raw_events:
        try:
            events.append(json.loads(raw))
        except Exception:
            pass
    return {"sim_id": sim_id, "events": events}