"""
ThoughtField — backend/app/agents/cognition.py
-----------------------------------------------
Prompt 4 of 10.

Four LLM-powered cognitive functions that every agent uses each tick.
This is where memory gets turned into decisions — the bridge between
what an agent remembers and what they actually do in the world.

Functions:
  make_daily_plan   — called once per sim-morning. Produces an hourly schedule.
  decide_action     — called every tick. Returns the agent's next move + speech.
  do_reflect        — called when memory.should_reflect() fires. Synthesizes
                      raw observations into higher-level insights that reshape
                      future behavior.
  generate_speech   — called when decide_action says the agent wants to talk.
                      Produces natural dialogue grounded in memory.

Model split (cost-optimized):
  gpt-4o-mini  → decide_action (called every tick for every agent — must be cheap)
  gpt-4o       → make_daily_plan, do_reflect, generate_speech (quality matters here)

Override via .env:
  AGENT_MODEL   = gpt-4o-mini   (action decisions)
  REFLECT_MODEL = gpt-4o        (planning + reflection + speech)
"""

import json
import logging
import os
import sys
import os
sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))
from typing import TYPE_CHECKING

from openai import AsyncOpenAI

if TYPE_CHECKING:
    from agents.agent import Agent

logger = logging.getLogger(__name__)
client = AsyncOpenAI()

AGENT_MODEL   = os.getenv("AGENT_MODEL",   "gpt-4o-mini")
REFLECT_MODEL = os.getenv("REFLECT_MODEL", "gpt-4o")

_JSON_SYSTEM = (
    "You are a social simulation engine. "
    "Return ONLY valid JSON. No markdown fences, no explanation, no preamble."
)


# ---------------------------------------------------------------------------
# Helper: strip JSON fences and parse safely
# ---------------------------------------------------------------------------
def _parse_json(raw: str, fallback):
    cleaned = raw.strip()
    if cleaned.startswith("```"):
        lines = cleaned.splitlines()
        inner = lines[1:-1] if lines[-1].strip() == "```" else lines[1:]
        cleaned = "\n".join(inner).strip()
    try:
        return json.loads(cleaned)
    except (json.JSONDecodeError, ValueError):
        logger.warning(f"JSON parse failed. Raw (first 200): {raw[:200]}")
        return fallback


# ===========================================================================
# 1. DAILY PLAN
# ===========================================================================

async def make_daily_plan(agent: "Agent", sim_time: str) -> list[dict]:
    """
    Generate the agent's hour-by-hour plan for today.

    Called once per sim-morning (when clock rolls past 6 AM).
    The plan is a list of time-slotted actions the agent intends to take.
    The simulation engine syncs the current plan item each tick so the
    agent always knows what they "should" be doing right now.

    Plans are broken by injected events — if something surprising happens
    mid-day, decide_action will deviate from the plan. The plan is intention,
    not destiny.

    Args:
        agent:    The Agent instance (we read persona + recent memories).
        sim_time: Current simulation time string e.g. "7:00 AM".

    Returns:
        List of plan dicts: [{time, action, location, duration_mins}, ...]
        Covers 6 AM to 11 PM. Falls back to a minimal single-item plan
        on any error.
    """
    memories = await agent.memory.retrieve("today goals plans intentions", k=5)
    mem_text = "\n".join(f"  - {m['content']}" for m in memories) or "  (no relevant memories yet)"

    reflections = agent.memory.all_reflections()
    reflect_text = "\n".join(f"  - {r['content']}" for r in reflections[-3:]) or "  (no reflections yet)"

    prompt = f"""You are generating a daily plan for a character in a social simulation.

Character: {agent.persona['name']}, age {agent.persona.get('age', 30)}
Occupation: {agent.persona.get('occupation', 'resident')}
Faction: {agent.persona.get('faction', 'independent')}
Traits: {', '.join(agent.persona.get('traits', []))}
Goals: {', '.join(agent.persona.get('goals', []))}
Stake in scenario: {agent.persona.get('stake_in_scenario', '')}

Recent memories:
{mem_text}

Recent reflections (inner insights):
{reflect_text}

Current sim time: {sim_time}

Generate a realistic daily plan as a JSON array covering 6:00 AM to 11:00 PM.
Make it specific to this character's occupation, goals, and current situation.
A student plans differently from an administrator. Someone angry plans differently from someone resigned.

Return exactly this format:
[
  {{"time": "6:00 AM", "action": "wake up and check phone for news about the situation", "location": "house_A", "duration_mins": 30}},
  {{"time": "7:00 AM", "action": "make breakfast, think about today's plan", "location": "house_A", "duration_mins": 30}},
  ...more items through 11:00 PM...
]

Valid locations: house_A, house_B, house_C, house_D, house_E, cafe, library, park, office, town_square, school, market, community_center

Rules:
- Include at least 8 time slots
- At least one action must directly relate to the scenario's central conflict
- Make actions feel lived-in and specific — not generic
- Reflect the character's personality and current emotional state"""

    try:
        response = await client.chat.completions.create(
            model=REFLECT_MODEL,
            temperature=0.7,
            messages=[
                {"role": "system", "content": _JSON_SYSTEM},
                {"role": "user",   "content": prompt},
            ],
        )
        raw = response.choices[0].message.content or ""
    except Exception as e:
        logger.error(f"[{agent.id}] make_daily_plan API error: {e}")
        return _fallback_plan()

    result = _parse_json(raw, fallback=None)

    if not isinstance(result, list) or len(result) == 0:
        logger.warning(f"[{agent.id}] make_daily_plan returned invalid structure")
        return _fallback_plan()

    # Ensure each item has required keys
    cleaned = []
    for item in result:
        if not isinstance(item, dict):
            continue
        item.setdefault("time", "9:00 AM")
        item.setdefault("action", "going about daily life")
        item.setdefault("location", "town_square")
        item.setdefault("duration_mins", 60)
        cleaned.append(item)

    logger.debug(f"[{agent.id}] daily plan generated: {len(cleaned)} slots")
    return cleaned or _fallback_plan()


def _fallback_plan() -> list[dict]:
    return [
        {"time": "6:00 AM",  "action": "waking up",            "location": "house_A",     "duration_mins": 60},
        {"time": "8:00 AM",  "action": "having breakfast",      "location": "cafe",        "duration_mins": 60},
        {"time": "10:00 AM", "action": "attending to work",     "location": "office",      "duration_mins": 120},
        {"time": "12:00 PM", "action": "lunch break",           "location": "cafe",        "duration_mins": 60},
        {"time": "2:00 PM",  "action": "back to work",          "location": "office",      "duration_mins": 120},
        {"time": "5:00 PM",  "action": "relaxing at the park",  "location": "park",        "duration_mins": 60},
        {"time": "7:00 PM",  "action": "dinner at home",        "location": "house_A",     "duration_mins": 60},
        {"time": "9:00 PM",  "action": "reading and winding down","location": "house_A",   "duration_mins": 120},
    ]


# ===========================================================================
# 2. DECIDE ACTION
# ===========================================================================

async def decide_action(
    agent: "Agent",
    perception: str,
    sim_time: str,
    injected_event: str | None = None,
) -> dict:
    """
    Decide what the agent does RIGHT NOW, this tick.

    This is called every simulation tick for every agent — it's the hot path.
    We use gpt-4o-mini here for speed and cost. The quality of this decision
    depends entirely on the quality of the memories we inject into the prompt.

    The agent's current plan item is included as context, but agents can and
    will deviate from their plan when something important interrupts them.
    An injected_event (e.g. "The protest just turned violent") will dominate
    the decision — agents react to the world first, plan second.

    Args:
        agent:          The Agent instance.
        perception:     What the agent currently observes (from _perceive()).
        sim_time:       Current simulation time string.
        injected_event: Optional dramatic world event injected by the user
                        via POST /api/event. Agents prioritize this above plan.

    Returns:
        Dict with keys:
          action    (str)        — what the agent does
          location  (str)        — where they go
          speak_to  (str | None) — name of another agent to talk to, or null
          speech    (str | None) — what they say, or null
    """
    memories = await agent.memory.retrieve(perception, k=5)
    mem_text = "\n".join(f"  - {m['content']}" for m in memories) or "  (no relevant memories)"

    current_plan = agent.current_plan_item
    plan_text = (
        f"{current_plan['action']} at {current_plan['location']}"
        if current_plan else "no specific plan right now"
    )

    event_block = ""
    if injected_event:
        event_block = f"""
!! BREAKING EVENT — this just happened and the agent knows about it:
"{injected_event}"
React to this. It overrides your planned activity if it's significant enough.
"""

    prompt = f"""You are {agent.persona['name']}, playing a character in a social simulation.

Your identity:
  Occupation: {agent.persona.get('occupation', 'resident')}
  Faction: {agent.persona.get('faction', 'independent')}
  Traits: {', '.join(agent.persona.get('traits', []))}
  Beliefs: {'; '.join(agent.persona.get('beliefs', []))}
  Goals: {'; '.join(agent.persona.get('goals', []))}
  Stake: {agent.persona.get('stake_in_scenario', '')}

Current simulation time: {sim_time}
Your planned activity: {plan_text}

What you currently observe around you:
  {perception}
{event_block}
Memories most relevant to this moment:
{mem_text}

What do you do RIGHT NOW? Decide in character.

Return ONLY this JSON:
{{
  "action": "one concrete sentence describing what you do",
  "location": "one of: house_A house_B house_C house_D house_E cafe library park office town_square school market community_center",
  "speak_to": null or "exact name of a nearby person you want to talk to",
  "speech": null or "one natural sentence you say to them, in character"
}}

Rules:
- action must be specific and grounded in your personality and the situation
- speak_to: only set this if someone is actually nearby (check perception)
- speech: if speak_to is set, make it feel natural — not a speech, just a line
- Your faction and beliefs should color every decision
- If injected_event is present, address it in your action"""

    try:
        response = await client.chat.completions.create(
            model=AGENT_MODEL,
            temperature=0.8,
            messages=[
                {"role": "system", "content": _JSON_SYSTEM},
                {"role": "user",   "content": prompt},
            ],
        )
        raw = response.choices[0].message.content or ""
    except Exception as e:
        logger.error(f"[{agent.id}] decide_action API error: {e}")
        return _fallback_action()

    result = _parse_json(raw, fallback=None)

    if not isinstance(result, dict):
        return _fallback_action()

    result.setdefault("action",   "wandering, thinking")
    result.setdefault("location", "town_square")
    result.setdefault("speak_to", None)
    result.setdefault("speech",   None)

    # Sanitize: if speak_to is the agent themselves, clear it
    if result.get("speak_to") == agent.persona["name"]:
        result["speak_to"] = None
        result["speech"]   = None

    return result


def _fallback_action() -> dict:
    return {
        "action":   "wandering quietly",
        "location": "town_square",
        "speak_to": None,
        "speech":   None,
    }


# ===========================================================================
# 3. REFLECT
# ===========================================================================

async def do_reflect(agent: "Agent") -> list[str]:
    """
    Synthesize recent observations into higher-level insights.

    This is the most important cognitive function in ThoughtField.
    Without reflection, agents accumulate raw observations but never
    form opinions, change their minds, or develop complex relationships.
    With it, an agent who's seen enough evidence of injustice starts
    thinking "this institution doesn't care about people like me" —
    and that insight reshapes every future decision.

    Called from agent.tick() when memory.should_reflect() returns True.
    Spawned as asyncio.create_task() so it doesn't block the tick loop.

    The 3 generated insights are stored back into the agent's MemoryStream
    as type='reflection'. They will surface in future retrieve() calls,
    influencing both planning and action decisions.

    Args:
        agent: The Agent instance.

    Returns:
        List of 3 insight strings (also stored in memory as side effect).
        Returns empty list on any error.
    """
    recent = agent.memory.recent(20)
    if len(recent) < 3:
        return []

    mem_numbered = "\n".join(
        f"  {i+1}. [{m['type']}] {m['content']}"
        for i, m in enumerate(recent)
    )

    prior_reflections = agent.memory.all_reflections()[-3:]
    prior_text = (
        "\n".join(f"  - {r['content']}" for r in prior_reflections)
        if prior_reflections else "  (no prior reflections)"
    )

    prompt = f"""You are helping {agent.persona['name']} reflect on their recent experiences.

Character:
  Occupation: {agent.persona.get('occupation', 'resident')}
  Faction: {agent.persona.get('faction', 'independent')}
  Traits: {', '.join(agent.persona.get('traits', []))}
  Beliefs: {'; '.join(agent.persona.get('beliefs', []))}

Their most recent experiences (newest last):
{mem_numbered}

Prior reflections (their existing inner narrative):
{prior_text}

Based on these experiences, what 3 higher-level insights does {agent.persona['name']} now have?

Reflections should be:
  - Personal and specific to this character (not generic)
  - About relationships, emotions, patterns, or evolving beliefs
  - Written as first-person inner thoughts ("I've noticed...", "I'm starting to feel...", "It seems like...")
  - Deeper than the raw observations — synthesize, don't summarize
  - Emotionally honest — fear, anger, hope, doubt are all valid

Return a JSON array of exactly 3 strings:
["insight one", "insight two", "insight three"]"""

    try:
        response = await client.chat.completions.create(
            model=REFLECT_MODEL,
            temperature=0.75,
            messages=[
                {"role": "system", "content": _JSON_SYSTEM},
                {"role": "user",   "content": prompt},
            ],
        )
        raw = response.choices[0].message.content or ""
    except Exception as e:
        logger.error(f"[{agent.id}] do_reflect API error: {e}")
        return []

    insights = _parse_json(raw, fallback=[])

    if not isinstance(insights, list):
        return []

    # Store each insight back into the agent's memory stream
    stored = []
    for insight in insights[:3]:
        if isinstance(insight, str) and insight.strip():
            await agent.memory.add(insight.strip(), mtype="reflection")
            stored.append(insight.strip())
            logger.info(f"[{agent.id}] reflection: {insight[:80]}")

    return stored


# ===========================================================================
# 4. GENERATE SPEECH
# ===========================================================================

async def generate_speech(
    speaker: "Agent",
    listener_name: str,
    listener_persona: dict | None,
    context: str,
) -> str:
    """
    Generate one natural line of dialogue from speaker to listener.

    Called from agent.tick() when decide_action returns a speak_to target.
    The speaker retrieves memories specifically about the listener to
    ground the dialogue in their relationship history.

    A character who distrusts someone says something very different
    from one who considers them an ally — even about the same topic.

    Args:
        speaker:          The speaking Agent instance.
        listener_name:    The name of who they're talking to.
        listener_persona: The listener's persona dict (for context), or None.
        context:          Current action/situation context string.

    Returns:
        A single natural sentence of dialogue. Falls back to a generic
        greeting on any error.
    """
    # Retrieve memories specifically about this person
    memories = await speaker.memory.retrieve(
        f"{listener_name} conversation relationship", k=4
    )
    mem_text = "\n".join(f"  - {m['content']}" for m in memories) or "  (no memories of this person)"

    # What does the speaker's persona say about the listener?
    relationship = speaker.persona.get("relationships", {}).get(
        _slugify(listener_name), "acquaintance"
    )

    listener_info = ""
    if listener_persona:
        listener_info = (
            f"  Listener occupation: {listener_persona.get('occupation','unknown')}\n"
            f"  Listener faction:    {listener_persona.get('faction','unknown')}\n"
            f"  Listener traits:     {', '.join(listener_persona.get('traits',[]))}"
        )

    prompt = f"""You are writing one line of dialogue for {speaker.persona['name']}.

Speaker: {speaker.persona['name']}
  Occupation: {speaker.persona.get('occupation','resident')}
  Faction: {speaker.persona.get('faction','independent')}
  Traits: {', '.join(speaker.persona.get('traits',[]))}
  Emotional state (inferred from recent memories): see below

Listener: {listener_name}
  Relationship to speaker: {relationship}
{listener_info}

Current situation: {context}

What the speaker remembers about {listener_name}:
{mem_text}

Write ONE natural sentence the speaker says to {listener_name} right now.

Rules:
- Make it feel like real human dialogue, not a speech
- It should reflect their relationship (friendly? tense? formal?)
- It should relate to the current situation or scenario
- Stay in character — their faction and beliefs color how they speak
- Do NOT use quotes in your response — return just the raw sentence
- Maximum 25 words"""

    try:
        response = await client.chat.completions.create(
            model=REFLECT_MODEL,
            temperature=0.85,
            max_tokens=60,
            messages=[
                {"role": "system", "content": "You write realistic dialogue for social simulation characters. Return ONLY the spoken line, no quotes, no labels."},
                {"role": "user",   "content": prompt},
            ],
        )
        line = response.choices[0].message.content or ""
        line = line.strip().strip('"').strip("'")
        return line if line else f"Hey {listener_name}, have you heard what's going on?"

    except Exception as e:
        logger.error(f"[{speaker.id}] generate_speech API error: {e}")
        return f"Hey {listener_name}, have you heard what's going on?"


# ---------------------------------------------------------------------------
# Helper — mirrors _slugify in personas.py (avoid circular import)
# ---------------------------------------------------------------------------
import re as _re

def _slugify(name: str) -> str:
    return _re.sub(r"[^a-z0-9]+", "_", name.lower()).strip("_")


# ---------------------------------------------------------------------------
# Quick test — run directly: python cognition.py
# ---------------------------------------------------------------------------
if __name__ == "__main__":
    import asyncio
    import sys
    import os
    sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))

    from agents.memory import MemoryStream

    class MockAgent:
        """Minimal agent stub for testing cognition without full Agent class."""
        def __init__(self):
            self.id = "test_isabella"
            self.persona = {
                "name": "Isabella Reyes",
                "age": 29,
                "occupation": "graduate student in literature",
                "faction": "Student Union",
                "traits": ["passionate", "articulate", "anxious"],
                "beliefs": ["education should be accessible", "silence is complicity"],
                "goals": ["finish her thesis", "fight the funding cuts"],
                "stake_in_scenario": "Her department faces elimination in the cuts.",
                "relationships": {"john_morris": "classmate, uncertain if he supports the protest"},
            }
            self.memory = MemoryStream(self.id)
            self.current_plan_item = {
                "time": "10:00 AM",
                "action": "attend planning meeting for protest",
                "location": "library",
            }

    async def main():
        print("ThoughtField — Cognition smoke test\n")
        agent = MockAgent()

        # Seed some memories
        seed_events = [
            "Attended the emergency faculty meeting — professors look scared.",
            "The provost's email arrived: 'tough decisions for sustainability'.",
            "My friend Carlos said he's too scared to join the protest.",
            "Overheard two admin staff joking about the arts cuts in the hall.",
            "The student union voted 87% in favor of a strike.",
        ]
        print("Seeding memories...")
        for event in seed_events:
            await agent.memory.add(event, "observation")

        print("\n1. Generating daily plan...")
        plan = await make_daily_plan(agent, "8:00 AM")
        for item in plan[:4]:
            print(f"   {item['time']:8s} — {item['action'][:55]}")

        print("\n2. Deciding action (with injected event)...")
        decision = await decide_action(
            agent,
            perception="John Morris is standing nearby, looking uncertain",
            sim_time="10:30 AM",
            injected_event="Admin security just blocked entry to the main hall.",
        )
        print(f"   action:   {decision['action']}")
        print(f"   location: {decision['location']}")
        print(f"   speak_to: {decision['speak_to']}")
        print(f"   speech:   {decision['speech']}")

        print("\n3. Reflecting...")
        insights = await do_reflect(agent)
        for ins in insights:
            print(f"   * {ins}")

        print("\n4. Generating speech...")
        line = await generate_speech(
            speaker=agent,
            listener_name="John Morris",
            listener_persona={"occupation": "grad student", "faction": "undecided", "traits": ["cautious"]},
            context="both standing near the blocked entrance to the main hall",
        )
        print(f"   Isabella says: \"{line}\"")

    asyncio.run(main())