"""
ThoughtField — backend/app/ingestion/personas.py
-------------------------------------------------
Prompt 2 of 10.

Takes the world-state dict from extractor.py and generates N diverse
agent personas who are directly relevant to the scenario.

Critically: agents are generated from ALL sides of every faction/tension.
A university protest sim needs students, admin, faculty, security, local
journalists, alumni — not 25 identical protesters. Diversity is what
makes emergent behavior surprising and realistic.

Each persona feeds directly into Agent.__init__() in agents/agent.py (Prompt 5).
"""

import json
import logging
import re
from openai import AsyncOpenAI

logger = logging.getLogger(__name__)
client = AsyncOpenAI()

# ---------------------------------------------------------------------------
# Preset color palette — one per agent, cycles if n > len(COLORS)
# These are the dot colors on the live TownMap canvas
# ---------------------------------------------------------------------------
COLORS = [
    "#D85A30",  # coral
    "#7F77DD",  # purple
    "#1D9E75",  # teal
    "#BA7517",  # amber
    "#D4537E",  # pink
    "#378ADD",  # blue
    "#639922",  # green
    "#E24B4A",  # red
    "#888780",  # gray
    "#0F6E56",  # dark teal
    "#993C1D",  # dark coral
    "#534AB7",  # dark purple
    "#3B6D11",  # dark green
    "#854F0B",  # dark amber
    "#185FA5",  # dark blue
    "#993556",  # dark pink
    "#5F5E5A",  # dark gray
    "#D85A30",  # cycle back
    "#7F77DD",
    "#1D9E75",
    "#BA7517",
    "#D4537E",
    "#378ADD",
    "#639922",
    "#E24B4A",
]

# ---------------------------------------------------------------------------
# World locations — agents are assigned home + work from this list.
# The simulation engine maps these to tile areas in world.py (Prompt 6).
# ---------------------------------------------------------------------------
LOCATIONS = [
    "house_A", "house_B", "house_C", "house_D", "house_E",
    "cafe", "library", "park", "office", "town_square",
    "school", "market", "community_center",
]

_SYSTEM = (
    "You are a social simulation persona generator. "
    "Return ONLY a valid JSON array. No markdown, no explanation."
)

_USER_TEMPLATE = """You are building a social simulation called ThoughtField.

Scenario seed:
{seed}

World state extracted from the seed:
- Setting: {setting}
- Factions: {factions}
- Tensions: {tensions}
- Key facts: {key_facts}
- Power dynamics: {power_dynamics}

Generate exactly {n} personas as a JSON array. Each persona must be a JSON object:
{{
  "id": "snake_case_unique_id",
  "name": "Full Name",
  "age": 28,
  "occupation": "specific job title",
  "faction": "faction name from above OR null if independent",
  "economic_status": "working|middle|upper_middle|wealthy",
  "traits": ["trait1", "trait2", "trait3"],
  "beliefs": [
    "a core value or worldview this person holds",
    "a second belief that may conflict with others"
  ],
  "goals": [
    "immediate goal related to the scenario",
    "longer-term personal goal"
  ],
  "stake_in_scenario": "one sentence — why this person cares deeply about what's happening",
  "relationships": {{
    "other_persona_id": "relationship description"
  }},
  "seed_memories": [
    "A personal fact about this person's background relevant to the scenario",
    "A specific past event that shaped their view on the central conflict",
    "A current worry or aspiration they wake up thinking about"
  ],
  "home_location": "one of: house_A house_B house_C house_D house_E",
  "work_location": "one of: cafe library park office town_square school market community_center",
  "color": "#hexcode"
}}

DIVERSITY RULES — you MUST follow all of these:
1. Include people from EVERY faction listed above — spread evenly
2. Include people who BENEFIT from the status quo AND people who are harmed by it
3. Vary ages: include at least 2 people under 25, 2 people over 50
4. Vary economic status: at least one working class, one wealthy
5. Make occupations specific and varied — not just the obvious roles
6. seed_memories must be specific and personal, not generic platitudes
7. relationships: connect at least 60% of personas to at least one other persona by id
8. color: assign a distinct hex color to each persona

The simulation depends on diversity. Homogeneous agents produce boring, predictable outcomes.
"""


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _slugify(name: str) -> str:
    """Turn 'Isabella Rodriguez' into 'isabella_rodriguez'."""
    return re.sub(r"[^a-z0-9]+", "_", name.lower()).strip("_")


def _assign_defaults(persona: dict, index: int, all_personas: list[dict]) -> dict:
    """Backfill any missing fields so Agent.__init__() never KeyErrors."""
    if not persona.get("id"):
        persona["id"] = _slugify(persona.get("name", f"agent_{index}"))

    if not persona.get("color"):
        persona["color"] = COLORS[index % len(COLORS)]

    if not persona.get("home_location"):
        persona["home_location"] = LOCATIONS[index % 5]  # house_A..house_E

    if not persona.get("work_location"):
        persona["work_location"] = LOCATIONS[5 + (index % 8)]  # cafe..community_center

    persona.setdefault("age", 30)
    persona.setdefault("faction", None)
    persona.setdefault("economic_status", "middle")
    persona.setdefault("traits", ["curious", "determined"])
    persona.setdefault("beliefs", ["things can change if people act"])
    persona.setdefault("goals", ["navigate the current situation"])
    persona.setdefault("stake_in_scenario", "Affected by the outcome.")
    persona.setdefault("relationships", {})
    persona.setdefault("seed_memories", [
        f"{persona.get('name', 'This person')} has lived in this community for years.",
        "A past experience made them care about fairness.",
        "They are unsure what the future holds.",
    ])

    return persona


def _deduplicate_ids(personas: list[dict]) -> list[dict]:
    """Ensure every persona has a unique id — suffix duplicates with _2, _3 etc."""
    seen: dict[str, int] = {}
    for p in personas:
        base = p.get("id", "agent")
        if base in seen:
            seen[base] += 1
            p["id"] = f"{base}_{seen[base]}"
        else:
            seen[base] = 1
    return personas


# ---------------------------------------------------------------------------
# Main generation function
# ---------------------------------------------------------------------------

async def generate_personas(seed: str, world_state: dict, n: int) -> list[dict]:
    """
    Generate N diverse agent personas from the seed text and world state.

    Args:
        seed:        The original seed text (passed through for context).
        world_state: The dict returned by extract_knowledge() — must contain
                     factions, tensions, key_facts, power_dynamics, setting.
        n:           Number of personas to generate (typically 10–50).

    Returns:
        List of persona dicts, each ready to be passed to Agent(persona, start_pos).
        Always returns exactly n items — pads with fallback personas if the LLM
        returns fewer than requested.
    """
    if n < 1:
        return []

    factions_str = json.dumps(world_state.get("factions", []), indent=2)
    tensions_str  = "\n".join(f"- {t}" for t in world_state.get("tensions", []))
    key_facts_str = "\n".join(f"- {f}" for f in world_state.get("key_facts", []))

    prompt = _USER_TEMPLATE.format(
        seed=seed[:1500],
        setting=world_state.get("setting", "unspecified"),
        factions=factions_str,
        tensions=tensions_str or "- none identified",
        key_facts=key_facts_str or "- none identified",
        power_dynamics=world_state.get("power_dynamics", "unknown"),
        n=n,
    )

    try:
        response = await client.chat.completions.create(
            model="gpt-4o",
            temperature=0.8,      # higher temp = more diverse personalities
            messages=[
                {"role": "system", "content": _SYSTEM},
                {"role": "user",   "content": prompt},
            ],
        )
        raw = response.choices[0].message.content or ""

    except Exception as e:
        logger.error(f"OpenAI API error in generate_personas: {e}")
        return _make_fallback_personas(n, world_state)

    # Strip markdown fences
    cleaned = raw.strip()
    if cleaned.startswith("```"):
        lines = cleaned.splitlines()
        inner = lines[1:-1] if lines[-1].strip() == "```" else lines[1:]
        cleaned = "\n".join(inner).strip()

    try:
        personas = json.loads(cleaned)
        if not isinstance(personas, list):
            raise ValueError("Expected a JSON array, got something else")
    except (json.JSONDecodeError, ValueError) as e:
        logger.error(f"Persona parse failed: {e}\nRaw: {raw[:400]}")
        return _make_fallback_personas(n, world_state)

    # Apply defaults and deduplication
    personas = [_assign_defaults(p, i, personas) for i, p in enumerate(personas)]
    personas = _deduplicate_ids(personas)

    # Pad if LLM returned fewer than requested
    while len(personas) < n:
        idx = len(personas)
        personas.append(_make_single_fallback(idx, world_state))

    # Trim if LLM returned more than requested
    personas = personas[:n]

    logger.info(
        f"generate_personas complete — {len(personas)} personas, "
        f"factions represented: {set(p.get('faction') for p in personas)}"
    )
    return personas


# ---------------------------------------------------------------------------
# Fallback persona factories
# ---------------------------------------------------------------------------

def _make_single_fallback(index: int, world_state: dict) -> dict:
    factions = world_state.get("factions", [])
    faction = factions[index % len(factions)]["name"] if factions else None
    name = f"Resident {index + 1}"
    return {
        "id": f"resident_{index + 1}",
        "name": name,
        "age": 25 + (index * 7) % 40,
        "occupation": "local resident",
        "faction": faction,
        "economic_status": "middle",
        "traits": ["quiet", "observant", "cautious"],
        "beliefs": ["stability matters", "change is risky"],
        "goals": ["keep a low profile", "stay safe"],
        "stake_in_scenario": "Lives nearby and is directly affected by events.",
        "relationships": {},
        "seed_memories": [
            f"{name} has lived in the area for over a decade.",
            "Witnessed a similar conflict years ago that ended badly.",
            "Worried about what this means for their daily life.",
        ],
        "home_location": LOCATIONS[index % 5],
        "work_location": LOCATIONS[5 + (index % 8)],
        "color": COLORS[index % len(COLORS)],
    }


def _make_fallback_personas(n: int, world_state: dict) -> list[dict]:
    return [_make_single_fallback(i, world_state) for i in range(n)]


# ---------------------------------------------------------------------------
# Quick test — run directly: python personas.py
# ---------------------------------------------------------------------------
if __name__ == "__main__":
    import asyncio

    SAMPLE_SEED = """
    Students at Westbrook University staged a walkout after the administration
    announced a 40% cut to arts and humanities funding. The Faculty Senate passed
    a no-confidence vote against Provost Linda Chen. University president Dr. Mark
    Ellis defended the cuts as financially necessary. The student union has called
    for a full strike by Friday.
    """

    SAMPLE_WORLD = {
        "setting": "Westbrook University campus, 2024",
        "factions": [
            {"name": "Student Union", "stance": "oppose cuts, demand negotiation", "members": []},
            {"name": "Administration", "stance": "cuts are necessary for solvency", "members": ["Dr. Mark Ellis", "Linda Chen"]},
            {"name": "Faculty Senate", "stance": "no confidence in leadership", "members": []},
            {"name": "Alumni Network", "stance": "divided, some reconsidering donations", "members": []},
        ],
        "tensions": [
            "Students vs administration over funding cuts",
            "Faculty lack of confidence in provost",
            "Financial pressures threatening university programs",
        ],
        "key_facts": [
            "40% cut to arts and humanities funding announced",
            "$12M budget deficit cited by administration",
            "Faculty Senate passed no-confidence vote",
            "Student union threatening full strike",
        ],
        "power_dynamics": "Administration holds formal power but faces organized resistance from students and faculty",
    }

    async def main():
        result = await generate_personas(SAMPLE_SEED, SAMPLE_WORLD, n=6)
        for p in result:
            print(f"\n{p['name']} ({p['occupation']}) — faction: {p['faction']}")
            print(f"  stake: {p['stake_in_scenario']}")
            print(f"  memories: {p['seed_memories'][0]}")

    asyncio.run(main())