"""
ThoughtField — backend/app/ingestion/extractor.py
--------------------------------------------------
Prompt 1 of 10.

Converts raw seed text (news article, policy doc, story, anything)
into a structured world-state dict that the simulation engine uses
to initialize the environment and generate agent personas.

This is the front door of ThoughtField. Everything the agents know
about their world starts here.
"""

import json
import logging
from openai import AsyncOpenAI

logger = logging.getLogger(__name__)
client = AsyncOpenAI()

# ---------------------------------------------------------------------------
# System prompt — strict JSON only, no markdown fences, no commentary
# ---------------------------------------------------------------------------
_SYSTEM = "You are a world-state extractor. Return ONLY valid JSON. No markdown fences, no explanation, no preamble."

_USER_TEMPLATE = """Analyze the text below and return a single JSON object with these exact keys:

{{
  "summary": "2-3 sentence neutral summary of the situation",
  "setting": "physical or institutional location/context (e.g. 'a university campus in 2024')",
  "entities": [
    {{"name": "...", "type": "person|org|place|concept", "description": "one sentence"}}
  ],
  "factions": [
    {{"name": "...", "stance": "brief position on the central conflict", "members": ["entity names"]}}
  ],
  "tensions": [
    "tension or conflict as a plain sentence"
  ],
  "key_facts": [
    "concrete verifiable fact from the text"
  ],
  "sentiment": 0.0,
  "tension_level": 0.5,
  "power_dynamics": "one sentence describing who holds power and who doesn't"
}}

Rules:
- sentiment: float from -1.0 (very negative) to 1.0 (very positive)
- tension_level: float from 0.0 (calm) to 1.0 (explosive)
- factions: always include at least 2, even if one is just "general public"
- entities: include every named person, org, or place mentioned
- tensions: each item is a distinct conflict thread — list ALL you find
- key_facts: only things explicitly stated, no inference

Text to analyze:
{text}"""


# ---------------------------------------------------------------------------
# Fallback — returned when the LLM output can't be parsed as JSON
# ---------------------------------------------------------------------------
def _fallback(raw_text: str, llm_output: str) -> dict:
    return {
        "summary": raw_text[:400],
        "setting": "unknown",
        "entities": [],
        "factions": [
            {"name": "unknown group A", "stance": "unclear", "members": []},
            {"name": "unknown group B", "stance": "unclear", "members": []},
        ],
        "tensions": ["Unable to extract tensions — check seed text quality"],
        "key_facts": [],
        "sentiment": 0.0,
        "tension_level": 0.5,
        "power_dynamics": "Could not determine",
        "_parse_error": True,
        "_raw_llm_output": llm_output[:500],
    }


# ---------------------------------------------------------------------------
# Main extraction function
# ---------------------------------------------------------------------------
async def extract_knowledge(text: str) -> dict:
    """
    Convert raw seed text into a structured world-state dict.

    Args:
        text: Any plain text — news article, policy document, fiction,
              social media thread, research brief, etc.

    Returns:
        dict with keys: summary, setting, entities, factions, tensions,
        key_facts, sentiment, tension_level, power_dynamics.
        On parse failure, returns a safe fallback dict with _parse_error=True.
    """
    if not text or not text.strip():
        logger.warning("extract_knowledge called with empty text")
        return _fallback("(empty input)", "")

    # Truncate very long inputs — gpt-4o context is large but we want fast responses
    truncated = text[:8000]
    if len(text) > 8000:
        logger.info(f"Seed text truncated from {len(text)} to 8000 chars")

    prompt = _USER_TEMPLATE.format(text=truncated)

    try:
        response = await client.chat.completions.create(
            model="gpt-4o",
            temperature=0.2,          # low temp = consistent structured output
            messages=[
                {"role": "system", "content": _SYSTEM},
                {"role": "user",   "content": prompt},
            ],
        )
        raw = response.choices[0].message.content or ""

    except Exception as e:
        logger.error(f"OpenAI API error in extract_knowledge: {e}")
        return _fallback(text, str(e))

    # Strip markdown fences if the model ignored our instructions
    cleaned = raw.strip()
    if cleaned.startswith("```"):
        lines = cleaned.splitlines()
        # Drop first line (```json or ```) and last line (```)
        inner = lines[1:-1] if lines[-1].strip() == "```" else lines[1:]
        cleaned = "\n".join(inner).strip()

    try:
        result = json.loads(cleaned)
    except json.JSONDecodeError as e:
        logger.error(f"JSON parse failed in extract_knowledge: {e}\nRaw output: {raw[:300]}")
        return _fallback(text, raw)

    # Validate and backfill required keys so downstream code never KeyErrors
    result.setdefault("summary", text[:200])
    result.setdefault("setting", "unspecified location")
    result.setdefault("entities", [])
    result.setdefault("factions", [])
    result.setdefault("tensions", [])
    result.setdefault("key_facts", [])
    result.setdefault("power_dynamics", "not determined")

    # Clamp numeric fields to valid ranges
    try:
        result["sentiment"] = max(-1.0, min(1.0, float(result.get("sentiment", 0.0))))
    except (TypeError, ValueError):
        result["sentiment"] = 0.0

    try:
        result["tension_level"] = max(0.0, min(1.0, float(result.get("tension_level", 0.5))))
    except (TypeError, ValueError):
        result["tension_level"] = 0.5

    logger.info(
        f"extract_knowledge complete — "
        f"{len(result['entities'])} entities, "
        f"{len(result['factions'])} factions, "
        f"{len(result['tensions'])} tensions, "
        f"tension_level={result['tension_level']:.2f}"
    )
    return result


# ---------------------------------------------------------------------------
# Quick test — run directly: python extractor.py
# ---------------------------------------------------------------------------
if __name__ == "__main__":
    import asyncio

    SAMPLE = """
    Students at Westbrook University staged a walkout Monday after the administration
    announced a 40% cut to the arts and humanities funding. The Faculty Senate passed
    a no-confidence vote against Provost Linda Chen, citing lack of consultation.
    University president Dr. Mark Ellis defended the cuts as financially necessary,
    pointing to a $12M budget deficit. The student union has called for a full strike
    by Friday if negotiations don't begin. Alumni donors are reportedly reconsidering
    a $5M pledge over the controversy.
    """

    async def main():
        result = await extract_knowledge(SAMPLE)
        print(json.dumps(result, indent=2))

    asyncio.run(main())