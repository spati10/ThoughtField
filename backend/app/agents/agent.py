"""
ThoughtField — backend/app/agents/agent.py
-------------------------------------------
Prompt 5 of 10.

The Agent class. This is the atom of the entire simulation — every emergent
behavior, every surprising outcome, every human-feeling moment in ThoughtField
comes from 25 of these running their tick() method in parallel.

One agent = one persona + one memory stream + one cognitive loop.

Lifecycle:
  1. Agent(persona, start_pos)    — create from persona dict (personas.py output)
  2. await agent.initialize()     — seed memories, generate first daily plan
  3. await agent.tick(world, time) — called every 2 seconds by simulation.py
  4. agent.to_dict()              — serialized state broadcast over WebSocket

The tick() method is the heart. Every tick:
  perceive  → what do I see around me right now?
  sync_plan → am I doing what I planned? should I replan?
  act       → what do I do this tick? (cognition.decide_action)
  move      → walk one tile toward my target location
  speak     → if I want to talk to someone nearby, say something
  remember  → store what just happened as an observation
  reflect   → if enough important things have happened, synthesize insights

All of this runs async. simulation.py runs all agents with asyncio.gather()
so they all tick in parallel — 25 agents, ~25 LLM calls, ~2 real seconds.

Dependencies (all built in Prompts 1–4):
  agents.memory    → MemoryStream
  agents.cognition → make_daily_plan, decide_action, do_reflect, generate_speech
"""

import asyncio
import logging
import random
import time
from typing import TYPE_CHECKING

from agents.memory import MemoryStream
from agents.cognition import (
    make_daily_plan,
    decide_action,
    do_reflect,
    generate_speech,
)

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# World grid constants — must match world.py (Prompt 6) and TownMap.tsx
# ---------------------------------------------------------------------------
GRID_WIDTH  = 40
GRID_HEIGHT = 40

# How many ticks between forced replan checks (even without surprise events)
REPLAN_INTERVAL = 72   # ~72 ticks = one sim-hour at 10 min/tick


class Agent:
    """
    A single ThoughtField agent.

    Has a persona (who they are), a memory stream (what they remember),
    and a cognitive loop (what they decide to do). Runs one tick() per
    simulation step.

    Attributes:
        id              Unique string id (from persona['id'])
        persona         Full persona dict from personas.py
        x, y            Current position on the 40×40 tile grid
        memory          MemoryStream instance (ChromaDB-backed)
        daily_plan      List of {time, action, location, duration_mins}
        current_plan_item  The plan slot that matches current sim time
        current_action  Human-readable string of what agent is doing now
        speaking        String of what agent is saying, or None
        speaking_to     Name of who agent is speaking to, or None
        injected_event  External event string set by POST /api/event
        _tick_count     Internal counter for replan interval
        _initialized    Whether initialize() has been called
    """

    def __init__(self, persona: dict, start_pos: tuple[int, int] | None = None):
        self.id      = persona["id"]
        self.persona = persona

        # Position on 40×40 grid — random start if not specified
        if start_pos:
            self.x, self.y = start_pos
        else:
            self.x = random.randint(2, GRID_WIDTH  - 2)
            self.y = random.randint(2, GRID_HEIGHT - 2)

        # Cognitive state
        self.memory            = MemoryStream(self.id)
        self.daily_plan:  list[dict] = []
        self.current_plan_item: dict | None = None

        # Observable state — broadcast to frontend every tick
        self.current_action = "waking up"
        self.speaking:    str | None = None
        self.speaking_to: str | None = None

        # Injected by POST /api/event — consumed once per tick then cleared
        self.injected_event: str | None = None

        # Internal bookkeeping
        self._tick_count   = 0
        self._initialized  = False
        self._last_location = persona.get("home_location", "house_A")

        logger.debug(f"Agent created: {self.persona['name']} @ ({self.x},{self.y})")

    # -----------------------------------------------------------------------
    # Initialization — called once before simulation starts
    # -----------------------------------------------------------------------

    async def initialize(self, sim_time: str = "6:00 AM"):
        """
        Seed the agent's memory with their backstory and generate today's plan.

        Must be called before the first tick(). Typically called by
        simulation.py right after all agents are created.

        Args:
            sim_time: Starting simulation time (usually "6:00 AM")
        """
        # Plant seed memories from the persona — these become the agent's
        # personal history that colors all future decisions
        for memory_text in self.persona.get("seed_memories", []):
            if memory_text and memory_text.strip():
                await self.memory.add(memory_text.strip(), mtype="observation")

        # Also plant their stake in the scenario as a high-importance memory
        stake = self.persona.get("stake_in_scenario", "")
        if stake:
            await self.memory.add(
                f"I care deeply about this situation because: {stake}",
                mtype="observation",
            )

        # Plant their core beliefs as reflections — they already "know" these
        for belief in self.persona.get("beliefs", [])[:2]:
            if belief and belief.strip():
                await self.memory.add(belief.strip(), mtype="reflection")

        # Generate today's plan
        try:
            self.daily_plan = await make_daily_plan(self, sim_time)
            self._sync_plan(sim_time)
        except Exception as e:
            logger.error(f"[{self.id}] initialize plan failed: {e}")
            self.daily_plan = []

        self._initialized = True
        logger.info(
            f"[{self.id}] initialized — "
            f"{self.memory.count()} seed memories, "
            f"{len(self.daily_plan)} plan slots"
        )

    # -----------------------------------------------------------------------
    # Main tick — called every 2 real seconds by simulation.py
    # -----------------------------------------------------------------------

    async def tick(self, world_state: dict, sim_time: str):
        """
        Run one simulation step for this agent.

        This is called by simulation.py via asyncio.gather() — all agents
        tick in parallel. Each tick advances sim time by 10 minutes.

        Steps (in order):
          1. Perceive    — build a perception string from nearby agents/objects
          2. Sync plan   — check if current plan item needs updating
          3. Maybe replan — if enough ticks have passed without plan sync
          4. Decide      — call cognition.decide_action with perception + memories
          5. Update state — set current_action, speaking, speaking_to
          6. Move        — walk one tile toward target location
          7. Remember    — store what happened as an observation
          8. Reflect     — if memory.should_reflect(), fire do_reflect as a task

        Args:
            world_state: Shared dict with 'agents' (all agent states) and
                         'areas' (location tile rects). Built by simulation.py.
            sim_time:    Current simulation time string e.g. "10:30 AM"
        """
        if not self._initialized:
            logger.warning(f"[{self.id}] tick() called before initialize() — skipping")
            return

        self._tick_count += 1

        # ------------------------------------------------------------------
        # Step 1: Perceive
        # ------------------------------------------------------------------
        perception = self._perceive(world_state)

        # ------------------------------------------------------------------
        # Step 2: Sync plan to current sim time
        # ------------------------------------------------------------------
        self._sync_plan(sim_time)

        # ------------------------------------------------------------------
        # Step 3: Replan if the plan is stale or an event forces it
        # ------------------------------------------------------------------
        should_replan = (
            self.injected_event is not None or
            (self._tick_count % REPLAN_INTERVAL == 0 and not self.current_plan_item)
        )
        if should_replan and self.injected_event:
            # Fire replan in background — don't block the tick
            asyncio.create_task(self._replan(sim_time))

        # ------------------------------------------------------------------
        # Step 4: Decide action
        # ------------------------------------------------------------------
        event_for_decision = self.injected_event
        self.injected_event = None   # consume — only fires once per agent

        try:
            decision = await decide_action(
                agent=self,
                perception=perception,
                sim_time=sim_time,
                injected_event=event_for_decision,
            )
        except Exception as e:
            logger.error(f"[{self.id}] decide_action failed: {e}")
            decision = {
                "action":   "pausing, lost in thought",
                "location": self._last_location,
                "speak_to": None,
                "speech":   None,
            }

        # ------------------------------------------------------------------
        # Step 5: Update observable state
        # ------------------------------------------------------------------
        self.current_action  = decision.get("action",   "idle")
        raw_speak_to         = decision.get("speak_to")
        raw_speech           = decision.get("speech")
        target_location      = decision.get("location",  self._last_location)

        # Only set speech if there's actually someone nearby to talk to
        nearby_names = self._get_nearby_names(world_state)
        if raw_speak_to and raw_speak_to in nearby_names and raw_speech:
            self.speaking    = raw_speech[:120]    # cap bubble length
            self.speaking_to = raw_speak_to
        else:
            self.speaking    = None
            self.speaking_to = None

        # ------------------------------------------------------------------
        # Step 6: Move one tile toward target location
        # ------------------------------------------------------------------
        self._move_toward(target_location, world_state)
        self._last_location = target_location

        # ------------------------------------------------------------------
        # Step 7: Build and store observation
        # ------------------------------------------------------------------
        observation_parts = [
            f"At {sim_time}: {self.current_action}",
            f"at {target_location}",
        ]
        if self.speaking and self.speaking_to:
            observation_parts.append(
                f"I said to {self.speaking_to}: '{self.speaking[:60]}'"
            )
        if perception and perception != "nobody nearby, quiet surroundings":
            observation_parts.append(f"I noticed: {perception[:80]}")
        if event_for_decision:
            observation_parts.append(f"Major event: {event_for_decision[:80]}")

        observation = ". ".join(observation_parts)
        await self.memory.add(observation, mtype="observation")

        # ------------------------------------------------------------------
        # Step 8: Maybe reflect (non-blocking background task)
        # ------------------------------------------------------------------
        if self.memory.should_reflect():
            asyncio.create_task(self._safe_reflect())

    # -----------------------------------------------------------------------
    # Perception — what does this agent see around them?
    # -----------------------------------------------------------------------

    def _perceive(self, world_state: dict) -> str:
        """
        Build a natural-language perception string from the agent's surroundings.

        Scans all other agents within manhattan distance 5 and lists their
        name + current action. This string is injected directly into
        cognition.decide_action's prompt — it IS the agent's eyes.

        Distance 5 tiles = roughly "same room / immediate area" at tile scale.
        """
        nearby_agents = []
        for other_id, other in world_state.get("agents", {}).items():
            if other_id == self.id:
                continue
            dist = abs(other["x"] - self.x) + abs(other["y"] - self.y)
            if dist <= 5:
                action_desc = other.get("current_action", "standing nearby")
                nearby_agents.append(
                    f"{other['name']} is here ({action_desc})"
                )

        # Nearby objects from the world map
        nearby_objects = []
        for area_name, area in world_state.get("areas", {}).items():
            # Check if agent is inside this area's bounds
            if (area["x"] <= self.x <= area["x"] + area["w"] and
                    area["y"] <= self.y <= area["y"] + area["h"]):
                for obj in area.get("objects", []):
                    nearby_objects.append(f"there is a {obj} here")
                break   # only report the area the agent is currently in

        all_percepts = nearby_agents + nearby_objects
        if not all_percepts:
            return "nobody nearby, quiet surroundings"

        # Cap to avoid bloating the prompt
        return ". ".join(all_percepts[:6])

    def _get_nearby_names(self, world_state: dict) -> set[str]:
        """Return a set of names of agents within distance 5."""
        names = set()
        for other_id, other in world_state.get("agents", {}).items():
            if other_id == self.id:
                continue
            dist = abs(other["x"] - self.x) + abs(other["y"] - self.y)
            if dist <= 5:
                names.add(other["name"])
        return names

    # -----------------------------------------------------------------------
    # Plan syncing
    # -----------------------------------------------------------------------

    def _sync_plan(self, sim_time: str):
        """
        Find and set the current plan item that matches the given sim_time.

        Parses sim_time ("10:30 AM") into a 24-hour integer and looks for
        the nearest plan slot within ±1 hour. If no match is found,
        current_plan_item is set to None (agent acts freely).
        """
        if not self.daily_plan:
            self.current_plan_item = None
            return

        current_hour = self._parse_sim_hour(sim_time)

        best_match = None
        best_diff  = 999

        for item in self.daily_plan:
            item_hour = self._parse_sim_hour(item.get("time", "12:00 PM"))
            diff = abs(current_hour - item_hour)
            if diff < best_diff:
                best_diff  = diff
                best_match = item

        # Only use the match if it's within 1 hour
        self.current_plan_item = best_match if best_diff <= 1 else None

    @staticmethod
    def _parse_sim_hour(time_str: str) -> float:
        """
        Convert "10:30 AM" / "2:15 PM" to a float hour (10.5 / 14.25).
        Returns 12.0 on any parse failure.
        """
        try:
            time_str = time_str.strip().upper()
            is_pm    = time_str.endswith("PM")
            time_str = time_str.replace("AM", "").replace("PM", "").strip()
            parts    = time_str.split(":")
            hour     = int(parts[0])
            minute   = int(parts[1]) if len(parts) > 1 else 0

            if is_pm and hour != 12:
                hour += 12
            elif not is_pm and hour == 12:
                hour = 0

            return hour + minute / 60.0
        except (ValueError, IndexError):
            return 12.0

    # -----------------------------------------------------------------------
    # Movement
    # -----------------------------------------------------------------------

    def _move_toward(self, location_name: str, world_state: dict):
        """
        Move one tile toward the center of the named location.

        Agents move at 1 tile/tick. At 2 real seconds/tick, crossing the
        40-tile map takes ~80 seconds — visible on the canvas as smooth motion.

        Uses simple greedy movement (no pathfinding). Good enough for the
        town-scale grid we're using.
        """
        areas = world_state.get("areas", {})
        area  = areas.get(location_name)

        if not area:
            # Unknown location — stay put
            return

        # Walk toward the center of the area
        target_x = area["x"] + area["w"] // 2
        target_y = area["y"] + area["h"] // 2

        # Move one step per axis per tick
        if self.x < target_x:
            self.x += 1
        elif self.x > target_x:
            self.x -= 1

        if self.y < target_y:
            self.y += 1
        elif self.y > target_y:
            self.y -= 1

        # Clamp to grid bounds
        self.x = max(0, min(GRID_WIDTH  - 1, self.x))
        self.y = max(0, min(GRID_HEIGHT - 1, self.y))

    # -----------------------------------------------------------------------
    # Replanning (background task)
    # -----------------------------------------------------------------------

    async def _replan(self, sim_time: str):
        """
        Regenerate the daily plan in response to a surprise event.

        Called as asyncio.create_task() so it doesn't block the tick.
        The new plan takes effect on the agent's next tick().
        """
        try:
            logger.info(f"[{self.id}] replanning at {sim_time}")
            self.daily_plan = await make_daily_plan(self, sim_time)
            self._sync_plan(sim_time)
        except Exception as e:
            logger.error(f"[{self.id}] replan failed: {e}")

    # -----------------------------------------------------------------------
    # Reflection (background task)
    # -----------------------------------------------------------------------

    async def _safe_reflect(self):
        """
        Wrapper around do_reflect that catches exceptions silently.
        Called as asyncio.create_task() — must never raise.
        """
        try:
            insights = await do_reflect(self)
            if insights:
                logger.info(
                    f"[{self.id}] reflected — {len(insights)} insights: "
                    f"{insights[0][:60]}..."
                )
        except Exception as e:
            logger.error(f"[{self.id}] reflection task failed: {e}")

    # -----------------------------------------------------------------------
    # Serialization — used by simulation.py and WebSocket broadcast
    # -----------------------------------------------------------------------

    def to_dict(self) -> dict:
        """
        Serialize current agent state for Redis storage and WebSocket broadcast.

        This dict is what the frontend TownMap and AgentPanel receive every tick.
        Keep it lean — it goes over the wire 25× per tick.
        """
        return {
            "id":             self.id,
            "name":           self.persona["name"],
            "x":              self.x,
            "y":              self.y,
            "color":          self.persona.get("color", "#888780"),
            "occupation":     self.persona.get("occupation", "resident"),
            "faction":        self.persona.get("faction"),
            "current_action": self.current_action,
            "speaking":       self.speaking,
            "speaking_to":    self.speaking_to,
        }

    def to_full_dict(self) -> dict:
        """
        Full serialization including persona and last 50 memories.
        Used by reporter.py (Prompt 8) and the agent profile page.
        """
        return {
            **self.to_dict(),
            "persona":  self.persona,
            "memories": self.memory.to_list(),
            "plan":     self.daily_plan,
        }

    def memory_list(self) -> list[dict]:
        """Convenience accessor for reporter.py."""
        return self.memory.to_list()

    def inject_event(self, event_text: str):
        """
        Called by POST /api/event to push a world event into this agent.
        The event is consumed on the agent's next tick().
        """
        self.injected_event = event_text
        logger.debug(f"[{self.id}] event injected: {event_text[:60]}")

    def __repr__(self) -> str:
        return (
            f"Agent(id='{self.id}', name='{self.persona['name']}', "
            f"pos=({self.x},{self.y}), action='{self.current_action}')"
        )


# ---------------------------------------------------------------------------
# Quick test — run directly: python agent.py
# ---------------------------------------------------------------------------
if __name__ == "__main__":
    import asyncio

    async def main():
        print("ThoughtField — Agent smoke test\n")

        persona = {
            "id":               "isabella_reyes",
            "name":             "Isabella Reyes",
            "age":              29,
            "occupation":       "graduate student, literature",
            "faction":          "Student Union",
            "economic_status":  "working",
            "traits":           ["passionate", "articulate", "anxious"],
            "beliefs":          [
                "Education should be accessible to everyone, not just the wealthy.",
                "Silence in the face of injustice is complicity.",
            ],
            "goals":            ["finish her thesis", "stop the funding cuts"],
            "stake_in_scenario": "Her entire department faces elimination.",
            "relationships":    {"john_morris": "classmate, unsure if he'll join the protest"},
            "seed_memories": [
                "Isabella grew up in a working-class family — university was her escape.",
                "She watched the provost dismiss a student petition without reading it.",
                "Her thesis advisor told her the department may be gone in 6 months.",
            ],
            "home_location": "house_A",
            "work_location": "library",
            "color": "#D85A30",
        }

        agent = Agent(persona, start_pos=(5, 5))
        print(f"Created: {agent}\n")

        print("Initializing (seeding memories + daily plan)...")
        await agent.initialize("8:00 AM")
        print(f"Memories after init: {agent.memory.count()}")
        print(f"Plan slots: {len(agent.daily_plan)}")
        if agent.daily_plan:
            print(f"First plan item: {agent.daily_plan[0]}")

        # Fake world state — one other agent nearby
        world_state = {
            "agents": {
                "john_morris": {
                    "id": "john_morris", "name": "John Morris",
                    "x": 6, "y": 5, "current_action": "reading a flyer",
                }
            },
            "areas": {
                "library": {"x": 3, "y": 3, "w": 6, "h": 6, "objects": ["bookshelf", "reading_table"]},
                "town_square": {"x": 15, "y": 15, "w": 10, "h": 10, "objects": ["notice_board"]},
                "house_A": {"x": 0, "y": 0, "w": 5, "h": 5, "objects": ["bed", "desk"]},
            },
        }

        print("\nRunning 2 ticks...")
        for tick_num in range(2):
            # Inject an event on tick 1
            if tick_num == 1:
                agent.inject_event("The admin just announced an emergency board meeting about the cuts.")

            await agent.tick(world_state, "10:00 AM")
            print(f"\nTick {tick_num + 1}:")
            print(f"  Position:  ({agent.x}, {agent.y})")
            print(f"  Action:    {agent.current_action}")
            print(f"  Speaking:  {agent.speaking}")
            print(f"  Memories:  {agent.memory.count()}")
            print(f"  to_dict(): {agent.to_dict()}")

        print(f"\nFinal state: {agent}")

    asyncio.run(main())