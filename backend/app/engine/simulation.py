"""
ThoughtField — backend/app/engine/simulation.py
------------------------------------------------
Prompt 6 of 10.

The simulation engine. This is what runs when a user clicks "Run Simulation".

It:
  1. Takes the agents built from personas.py + agent.py
  2. Runs them all in parallel every SIM_TICK_SECONDS real seconds
  3. Advances the SimClock by SIM_TICK_MINUTES each iteration
  4. Publishes the world state to Redis pub/sub every tick
  5. Stores a snapshot history for the ReportAgent (Prompt 8)
  6. Handles morning replanning, day transitions, and graceful shutdown

The main loop runs as an asyncio background task launched by
POST /api/simulate (Prompt 7). It writes to Redis and clients
receive live updates over the WebSocket (ws.py, also Prompt 7).

Redis keys used:
  sim:{id}:status    → "running" | "done" | "error"
  sim:{id}:progress  → int 0–100
  sim:{id}:latest    → JSON of most recent world snapshot
  sim:{id}:history   → Redis list of JSON snapshots (capped at 1000)
  sim:{id}:question  → the user's prediction question (set by api/simulate.py)
  sim:{id}:agents_final → JSON of all agents' final state + memories (for reporter)
  sim:{id}:state     → Redis pub/sub channel for WebSocket streaming
"""

import asyncio
import json
import logging
import os
import time
import redis
import redis.asyncio as aioredis
import sys
import os
sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))
from agents.agent import Agent
from engine.clock import SimClock
from engine.world import load_world, get_random_start_positions

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Configuration (overridable via .env)
# ---------------------------------------------------------------------------
REDIS_URL          = os.getenv("REDIS_URL", "redis://localhost:6379")
SIM_TICK_SECONDS   = float(os.getenv("SIM_TICK_SECONDS",   "2.0"))
HISTORY_CAP        = int(os.getenv("SIM_HISTORY_CAP",      "1000"))
SNAPSHOT_EVERY     = int(os.getenv("SIM_SNAPSHOT_EVERY",   "1"))    # store every N ticks
MORNING_HOUR       = 6    # agents replan at this sim hour

# Ticks per sim-day (24 hours × 60 min / SIM_TICK_MINUTES)
# Default: 24 * 60 / 10 = 144 ticks per day
from engine.clock import SIM_TICK_MINUTES
TICKS_PER_DAY = (24 * 60) // SIM_TICK_MINUTES


# ---------------------------------------------------------------------------
# Redis singleton
# ---------------------------------------------------------------------------
from db.redis_client import get_redis


# ---------------------------------------------------------------------------
# Main simulation runner
# ---------------------------------------------------------------------------

async def run_simulation(
    agents: list[Agent],
    sim_id: str,
    sim_days: int,
    question: str,
    world_map: dict | None = None,
) -> None:
    """
    Run the full ThoughtField simulation for sim_days days.

    This is launched as an asyncio background task by api/simulate.py.
    It writes state to Redis every tick and exits when done (or on error).

    Args:
        agents:    List of initialized Agent instances.
        sim_id:    Unique simulation ID (UUID string).
        sim_days:  Number of sim-days to run (1 sim-day = ~2.4 real minutes).
        question:  The user's prediction question (stored for reporter.py).
        world_map: Optional custom world dict. Uses DEFAULT_WORLD if None.
    """
    redis     = await get_redis()
    clock     = SimClock()
    world     = world_map or load_world()
    total_ticks = sim_days * TICKS_PER_DAY

    logger.info(
        f"[sim:{sim_id}] Starting — {len(agents)} agents, "
        f"{sim_days} days ({total_ticks} ticks)"
    )

    # Write metadata
    await redis.set(f"sim:{sim_id}:status",   "running")
    await redis.set(f"sim:{sim_id}:question",  question)
    await redis.set(f"sim:{sim_id}:total_ticks", total_ticks)

    # ------------------------------------------------------------------
    # Initialize all agents (seed memories + first daily plan)
    # ------------------------------------------------------------------
    logger.info(f"[sim:{sim_id}] Initializing {len(agents)} agents...")
    init_start = time.time()

    await asyncio.gather(*[
        agent.initialize(clock.time_str())
        for agent in agents
    ])

    logger.info(
        f"[sim:{sim_id}] All agents initialized in "
        f"{time.time() - init_start:.1f}s"
    )

    # ------------------------------------------------------------------
    # Main tick loop
    # ------------------------------------------------------------------
    tick_num = 0

    try:
        while tick_num < total_ticks:
            tick_start = time.time()

            # --------------------------------------------------------------
            # Build shared world state (read-only snapshot for this tick)
            # --------------------------------------------------------------
            world_state = _build_world_state(agents, world)

            # --------------------------------------------------------------
            # Morning replan: new sim-day AND morning hour
            # --------------------------------------------------------------
            if clock.is_new_day() and clock.is_morning():
                logger.info(
                    f"[sim:{sim_id}] Day {clock.day} morning — "
                    f"replanning {len(agents)} agents"
                )
                await asyncio.gather(*[
                    agent.initialize(clock.time_str())
                    for agent in agents
                ])

            # --------------------------------------------------------------
            # All agents tick in parallel
            # --------------------------------------------------------------
            try:
                await asyncio.gather(*[
                    agent.tick(world_state, clock.time_str())
                    for agent in agents
                ])
            except Exception as e:
                logger.error(f"[sim:{sim_id}] Tick {tick_num} gather error: {e}")
                # Don't abort — continue with next tick

            # --------------------------------------------------------------
            # Build and publish snapshot
            # --------------------------------------------------------------
            snapshot = _build_snapshot(agents, clock, tick_num, total_ticks)
            snap_json = json.dumps(snapshot)

            # Publish to WebSocket subscribers
            await redis.publish(f"sim:{sim_id}:state", snap_json)

            # Store latest state (for new WebSocket connections)
            await redis.set(f"sim:{sim_id}:latest", snap_json)

            # Store in history list (capped)
            if tick_num % SNAPSHOT_EVERY == 0:
                await redis.lpush(f"sim:{sim_id}:history", snap_json)
                await redis.ltrim(f"sim:{sim_id}:history", 0, HISTORY_CAP - 1)

            # Update progress
            progress = min(99, int((tick_num + 1) / total_ticks * 100))
            await redis.set(f"sim:{sim_id}:progress", progress)

            # --------------------------------------------------------------
            # Advance clock
            # --------------------------------------------------------------
            clock.tick()
            tick_num += 1

            # --------------------------------------------------------------
            # Sleep until next tick (maintain real-time cadence)
            # --------------------------------------------------------------
            elapsed = time.time() - tick_start
            sleep_for = max(0.0, SIM_TICK_SECONDS - elapsed)
            if sleep_for > 0:
                await asyncio.sleep(sleep_for)
            else:
                logger.warning(
                    f"[sim:{sim_id}] Tick {tick_num} overran by "
                    f"{elapsed - SIM_TICK_SECONDS:.2f}s"
                )

    except asyncio.CancelledError:
        logger.info(f"[sim:{sim_id}] Simulation cancelled at tick {tick_num}")
        await redis.set(f"sim:{sim_id}:status", "cancelled")
        return

    except Exception as e:
        logger.error(f"[sim:{sim_id}] Fatal simulation error: {e}")
        await redis.set(f"sim:{sim_id}:status", "error")
        await redis.set(f"sim:{sim_id}:error",  str(e))
        return

    # ------------------------------------------------------------------
    # Simulation complete — store final agent state for reporter.py
    # ------------------------------------------------------------------
    logger.info(f"[sim:{sim_id}] Simulation complete — storing final state")

    agents_final = [
        {
            "persona":  agent.persona,
            "memories": agent.memory_list(),
            "reflections": agent.memory.all_reflections(),
            "final_action": agent.current_action,
            "final_pos": {"x": agent.x, "y": agent.y},
        }
        for agent in agents
    ]

    await redis.set(
        f"sim:{sim_id}:agents_final",
        json.dumps(agents_final),
    )
    await redis.set(f"sim:{sim_id}:status",   "done")
    await redis.set(f"sim:{sim_id}:progress", 100)

    # Publish a final "done" snapshot so frontend knows to navigate to report
    final_snapshot = _build_snapshot(agents, clock, tick_num, total_ticks)
    final_snapshot["status"] = "done"
    await redis.publish(f"sim:{sim_id}:state", json.dumps(final_snapshot))

    logger.info(
        f"[sim:{sim_id}] Done — "
        f"{tick_num} ticks, "
        f"{sim_days} sim-days, "
        f"{len(agents)} agents"
    )


# ---------------------------------------------------------------------------
# Snapshot builders
# ---------------------------------------------------------------------------

def _build_world_state(agents: list[Agent], world: dict) -> dict:
    """
    Build the shared world state dict passed to every agent.tick() this tick.

    This is the agent's view of the world — their own position plus
    all other agents' positions and current actions.
    """
    return {
        "areas":  world["areas"],
        "agents": {
            agent.id: {
                "id":             agent.id,
                "name":           agent.persona["name"],
                "x":              agent.x,
                "y":              agent.y,
                "current_action": agent.current_action,
                "speaking":       agent.speaking,
                "speaking_to":    agent.speaking_to,
                "faction":        agent.persona.get("faction"),
            }
            for agent in agents
        },
    }


def _build_snapshot(
    agents: list[Agent],
    clock:  SimClock,
    tick_num: int,
    total_ticks: int,
) -> dict:
    """
    Build the full snapshot broadcast to Redis pub/sub and stored in history.

    This is what the WebSocket sends to the frontend every tick.
    """
    events = _collect_events(agents)

    return {
        "tick":       tick_num,
        "sim_time":   clock.time_str(),
        "sim_day":    clock.day,
        "day_time":   clock.day_time_str(),
        "progress":   min(99, int((tick_num + 1) / max(total_ticks, 1) * 100)),
        "status":     "running",
        "agents":     {agent.id: agent.to_dict() for agent in agents},
        "events":     events,
        "stats": {
            "total_agents":   len(agents),
            "speaking_now":   sum(1 for a in agents if a.speaking),
            "factions":       _faction_counts(agents),
        },
    }


def _collect_events(agents: list[Agent]) -> list[dict]:
    """
    Collect speech and action events from all agents this tick.
    These appear in the frontend EventFeed.
    """
    events = []
    for agent in agents:
        if agent.speaking and agent.speaking_to:
            events.append({
                "type":    "speech",
                "agent":   agent.persona["name"],
                "color":   agent.persona.get("color", "#888780"),
                "content": agent.speaking,
                "to":      agent.speaking_to,
                "faction": agent.persona.get("faction"),
            })
        elif agent.current_action and agent.current_action not in ("idle", "wandering quietly"):
            # Include interesting non-speech actions
            events.append({
                "type":    "action",
                "agent":   agent.persona["name"],
                "color":   agent.persona.get("color", "#888780"),
                "content": agent.current_action,
                "faction": agent.persona.get("faction"),
            })
    return events[:20]   # cap events per tick for WebSocket payload size


def _faction_counts(agents: list[Agent]) -> dict[str, int]:
    """Count agents per faction for the frontend stats bar."""
    counts: dict[str, int] = {}
    for agent in agents:
        faction = agent.persona.get("faction") or "independent"
        counts[faction] = counts.get(faction, 0) + 1
    return counts


# ---------------------------------------------------------------------------
# Factory: build agents from personas + world
# ---------------------------------------------------------------------------

def build_agents(personas: list[dict], world: dict) -> list[Agent]:
    """
    Create Agent objects from a list of persona dicts.

    Assigns start positions based on each persona's home_location.
    Falls back to random positions if the home area isn't found.

    Called by api/simulate.py after generate_personas() returns.
    """
    import random
    from engine.world import get_area_center

    agents = []
    for persona in personas:
        home = persona.get("home_location", "house_A")
        area = world.get("areas", {}).get(home)

        if area:
            # Start inside the home area with slight random offset
            start_x = area["x"] + random.randint(0, max(0, area["w"] - 1))
            start_y = area["y"] + random.randint(0, max(0, area["h"] - 1))
        else:
            # Fallback: random position
            start_x = random.randint(2, world.get("width",  40) - 2)
            start_y = random.randint(2, world.get("height", 40) - 2)

        agent = Agent(persona, start_pos=(start_x, start_y))
        agents.append(agent)

    logger.info(f"build_agents: created {len(agents)} agents")
    return agents


# ---------------------------------------------------------------------------
# Quick test — run directly: python simulation.py
# ---------------------------------------------------------------------------
if __name__ == "__main__":
    import asyncio
    import sys, os
    sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))

    from ingestion.extractor import extract_knowledge
    from ingestion.personas  import generate_personas

    SAMPLE_SEED = """
    Students at Westbrook University staged a walkout after administration
    announced a 40% cut to arts and humanities funding. The Faculty Senate
    passed a no-confidence vote. Students are threatening a full strike.
    """

    async def main():
        print("ThoughtField — Simulation smoke test (3 agents, 5 ticks)\n")

        # Build minimal world state
        world = load_world()

        # Extract knowledge
        print("Extracting world state...")
        world_state = await extract_knowledge(SAMPLE_SEED)

        # Generate 3 personas
        print("Generating 3 personas...")
        personas = await generate_personas(SAMPLE_SEED, world_state, n=3)

        # Build agents
        agents = build_agents(personas, world)
        print(f"Agents: {[a.persona['name'] for a in agents]}\n")

        # Run 5 ticks manually (bypass full simulation loop)
        clock = SimClock()
        ws = _build_world_state(agents, world)

        # Initialize
        await asyncio.gather(*[a.initialize(clock.time_str()) for a in agents])

        # Tick 5 times
        for i in range(5):
            ws = _build_world_state(agents, world)
            await asyncio.gather(*[a.tick(ws, clock.time_str()) for a in agents])
            snapshot = _build_snapshot(agents, clock, i, 5)
            print(f"Tick {i+1} | {clock.day_time_str()}")
            for a in agents:
                print(f"  {a.persona['name']:20s} @ ({a.x:2d},{a.y:2d}) | {a.current_action[:50]}")
                if a.speaking:
                    print(f"    says to {a.speaking_to}: \"{a.speaking[:60]}\"")
            print(f"  Events this tick: {len(snapshot['events'])}")
            clock.tick()

        print("\nSmoke test complete.")

    asyncio.run(main())