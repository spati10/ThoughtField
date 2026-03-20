"""
ThoughtField — backend/app/api/simulate.py
-------------------------------------------
Prompt 7 of 10.

POST /api/simulate  — start a new simulation
GET  /api/simulate/{sim_id}/status — poll progress

The POST endpoint is the main entry point for the entire product:
  1. Validate the request body
  2. Extract world knowledge from the seed text  (extractor.py)
  3. Generate N agent personas                   (personas.py)
  4. Build Agent objects                         (simulation.py:build_agents)
  5. Launch run_simulation() as a background task
  6. Return {sim_id, status: "running"} immediately

The frontend navigates to /sim/{sim_id} right after receiving this response.
The simulation streams state to that page via WebSocket (/ws/sim/{sim_id}).
"""

import logging
import uuid

import sys, os
sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))

from fastapi import APIRouter, BackgroundTasks, HTTPException
from pydantic import BaseModel, Field

from engine.simulation import run_simulation, build_agents
from db.redis_client import get_redis
from engine.world import load_world
from ingestion.extractor import extract_knowledge
from ingestion.personas import generate_personas

logger = logging.getLogger(__name__)
router = APIRouter()

# Active simulations: sim_id → asyncio.Task (for cancellation support)
_active_sims: dict[str, object] = {}


# ---------------------------------------------------------------------------
# Request / Response models
# ---------------------------------------------------------------------------

class SimulateRequest(BaseModel):
    seed:      str         = Field(...,   min_length=20,  description="Seed text — any article, doc, or story")
    question:  str         = Field(...,   min_length=5,   description="What should the simulation predict?")
    n_agents:  int         = Field(20,    ge=3,   le=50,  description="Number of agents (3–50)")
    sim_days:  int         = Field(3,     ge=1,   le=7,   description="Simulation days to run (1–7)")


class SimulateResponse(BaseModel):
    sim_id:   str
    status:   str
    n_agents: int
    sim_days: int
    message:  str


class StatusResponse(BaseModel):
    sim_id:    str
    status:    str           # "running" | "done" | "error" | "not_found"
    progress:  int           # 0–100
    sim_time:  str | None
    sim_day:   int | None
    n_agents:  int | None
    error:     str | None


# ---------------------------------------------------------------------------
# POST /api/simulate
# ---------------------------------------------------------------------------

@router.post("/simulate", response_model=SimulateResponse)
async def start_simulation(req: SimulateRequest, background_tasks: BackgroundTasks):
    """
    Launch a new ThoughtField simulation.

    Extracts knowledge, generates personas, builds agents, and fires
    the simulation engine as a background task. Returns immediately with
    a sim_id the frontend uses to connect via WebSocket.
    """
    sim_id = str(uuid.uuid4())
    logger.info(
        f"[sim:{sim_id}] New simulation request — "
        f"{req.n_agents} agents, {req.sim_days} days"
    )

    # ------------------------------------------------------------------
    # Step 1: Extract world knowledge from seed text
    # ------------------------------------------------------------------
    logger.info(f"[sim:{sim_id}] Extracting world knowledge...")
    try:
        world_state = await extract_knowledge(req.seed)
    except Exception as e:
        logger.error(f"[sim:{sim_id}] extract_knowledge failed: {e}")
        raise HTTPException(status_code=500, detail=f"World extraction failed: {e}")

    if world_state.get("_parse_error"):
        logger.warning(f"[sim:{sim_id}] extract_knowledge returned with parse error — continuing with fallback")

    # ------------------------------------------------------------------
    # Step 2: Generate agent personas
    # ------------------------------------------------------------------
    logger.info(f"[sim:{sim_id}] Generating {req.n_agents} personas...")
    try:
        personas = await generate_personas(req.seed, world_state, req.n_agents)
    except Exception as e:
        logger.error(f"[sim:{sim_id}] generate_personas failed: {e}")
        raise HTTPException(status_code=500, detail=f"Persona generation failed: {e}")

    logger.info(f"[sim:{sim_id}] Generated {len(personas)} personas")

    # ------------------------------------------------------------------
    # Step 3: Build Agent objects
    # ------------------------------------------------------------------
    world = load_world()
    try:
        agents = build_agents(personas, world)
    except Exception as e:
        logger.error(f"[sim:{sim_id}] build_agents failed: {e}")
        raise HTTPException(status_code=500, detail=f"Agent construction failed: {e}")

    # Store persona list and world state in Redis for the frontend
    redis = await get_redis()
    import json
    await redis.set(f"sim:{sim_id}:personas",    json.dumps(personas))
    await redis.set(f"sim:{sim_id}:world_state", json.dumps(world_state))
    await redis.set(f"sim:{sim_id}:world_map",   json.dumps(world))
    await redis.set(f"sim:{sim_id}:n_agents",    len(agents))
    await redis.set(f"sim:{sim_id}:question",    req.question)
    await redis.set(f"sim:{sim_id}:status",      "initializing")

    # ------------------------------------------------------------------
    # Step 4: Launch simulation as background task
    # ------------------------------------------------------------------
    background_tasks.add_task(
        _run_sim_safe,
        agents=agents,
        sim_id=sim_id,
        sim_days=req.sim_days,
        question=req.question,
        world=world,
    )

    logger.info(f"[sim:{sim_id}] Background task launched")

    return SimulateResponse(
        sim_id=sim_id,
        status="initializing",
        n_agents=len(agents),
        sim_days=req.sim_days,
        message=f"Simulation started. Connect to /ws/sim/{sim_id} for live updates.",
    )


async def _run_sim_safe(agents, sim_id, sim_days, question, world):
    """Wrapper that catches all exceptions so background task never silently dies."""
    try:
        await run_simulation(
            agents=agents,
            sim_id=sim_id,
            sim_days=sim_days,
            question=question,
            world_map=world,
        )
    except Exception as e:
        logger.error(f"[sim:{sim_id}] Unhandled simulation error: {e}")
        redis = await get_redis()
        await redis.set(f"sim:{sim_id}:status", "error")
        await redis.set(f"sim:{sim_id}:error",  str(e))


# ---------------------------------------------------------------------------
# GET /api/simulate/{sim_id}/status
# ---------------------------------------------------------------------------

@router.get("/simulate/{sim_id}/status", response_model=StatusResponse)
async def get_simulation_status(sim_id: str):
    """
    Poll simulation status and progress.

    Used by the frontend progress bar while waiting for the simulation
    to finish before showing the report. Also used to check if a sim
    is still running when a user revisits /sim/{sim_id}.
    """
    redis = await get_redis()

    status = await redis.get(f"sim:{sim_id}:status")
    if not status:
        return StatusResponse(
            sim_id=sim_id,
            status="not_found",
            progress=0,
            sim_time=None,
            sim_day=None,
            n_agents=None,
            error=None,
        )

    # Parse latest snapshot for sim_time and sim_day
    sim_time = None
    sim_day  = None
    latest_raw = await redis.get(f"sim:{sim_id}:latest")
    if latest_raw:
        try:
            import json
            latest = json.loads(latest_raw)
            sim_time = latest.get("sim_time")
            sim_day  = latest.get("sim_day")
        except Exception:
            pass

    progress_raw = await redis.get(f"sim:{sim_id}:progress")
    n_agents_raw = await redis.get(f"sim:{sim_id}:n_agents")
    error        = await redis.get(f"sim:{sim_id}:error")

    return StatusResponse(
        sim_id=sim_id,
        status=status,
        progress=int(progress_raw or 0),
        sim_time=sim_time,
        sim_day=sim_day,
        n_agents=int(n_agents_raw) if n_agents_raw else None,
        error=error,
    )


# ---------------------------------------------------------------------------
# GET /api/simulate/{sim_id}/agents
# ---------------------------------------------------------------------------

@router.get("/simulate/{sim_id}/agents")
async def get_sim_agents(sim_id: str):
    """
    Return the list of agent personas for a simulation.
    Used by the frontend AgentPanel to show agent cards and profile pages.
    """
    import json
    redis = await get_redis()
    raw = await redis.get(f"sim:{sim_id}:personas")
    if not raw:
        raise HTTPException(status_code=404, detail="Simulation not found")
    return {"sim_id": sim_id, "agents": json.loads(raw)}


# ---------------------------------------------------------------------------
# GET /api/simulate/{sim_id}/world
# ---------------------------------------------------------------------------

@router.get("/simulate/{sim_id}/world")
async def get_sim_world(sim_id: str):
    """
    Return the world map for a simulation.
    Used by TownMap.tsx to render the tile grid areas.
    """
    import json
    redis = await get_redis()
    raw = await redis.get(f"sim:{sim_id}:world_map")
    if not raw:
        # Fall back to default world
        return load_world()
    return json.loads(raw)