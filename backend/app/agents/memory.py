"""
ThoughtField — backend/app/agents/memory.py
--------------------------------------------
Prompt 3 of 10.

Every agent in ThoughtField has a MemoryStream — their entire inner life
stored as a searchable, scored list of experiences.

This is the most important file in the project. Without good memory,
agents are stateless chatbots. With it, they remember who wronged them,
who they trust, what they promised, what they fear. That's what produces
emergent human-like behavior.

Architecture: Stanford Generative Agents paper (Park et al., 2023)
Storage: ChromaDB (persistent vector store, one collection per agent)
Retrieval: recency × importance × relevance — the paper's exact formula

Memory types:
  observation  — something the agent perceived in the world
  reflection   — a high-level insight the agent synthesized from observations
  plan         — an intention the agent formed about the future

The reflection trigger (should_reflect) is checked every tick in agent.py.
When it fires, cognition.py synthesizes the last 20 memories into insights
and stores them back here as type='reflection'. Those reflections then
influence every future decision — this is the feedback loop that makes
agents feel like they have an inner life.
"""

import json
import logging
import time
import uuid
from typing import Literal

import chromadb
import sys
import os
sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))
from chromadb.config import Settings
from openai import AsyncOpenAI

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Clients — initialized once, reused across all MemoryStream instances
# ---------------------------------------------------------------------------
_openai_client = AsyncOpenAI()

# PersistentClient: memories survive server restarts.
# Each agent gets its own named collection inside this shared DB.
from db.chroma_client import get_chroma as _get_chroma
_chroma_client = _get_chroma()

# ---------------------------------------------------------------------------
# Types
# ---------------------------------------------------------------------------
MemoryType = Literal["observation", "reflection", "plan"]

IMPORTANCE_THRESHOLD = 100.0   # sum of recent-20 importances → triggers reflection
REFLECTION_WINDOW    = 20      # how many recent memories to scan for reflection trigger
RETRIEVAL_DECAY      = 0.995   # exponential decay base per hour of age
MAX_HISTORY          = 2000    # hard cap on entries kept in RAM per agent


# ---------------------------------------------------------------------------
# MemoryStream
# ---------------------------------------------------------------------------
class MemoryStream:
    """
    An agent's complete memory — observations, reflections, and plans —
    stored in ChromaDB and scored for retrieval using the Stanford formula:

        score = recency + importance + relevance

    where:
        recency    = RETRIEVAL_DECAY ^ age_in_hours   (exponential decay)
        importance = LLM-rated 1–10, normalized to 0–1
        relevance  = 1 - (chroma_distance / 2)        (cosine similarity proxy)
    """

    def __init__(self, agent_id: str):
        self.agent_id = agent_id
        # In-RAM list — fast iteration for scoring, reflection checks, to_list()
        self._entries: list[dict] = []
        # ChromaDB collection — semantic search via embeddings
        self._col = _chroma_client.get_or_create_collection(
            name=f"mem_{agent_id}",
            metadata={"hnsw:space": "cosine"},
        )
        logger.debug(f"MemoryStream initialized for agent '{agent_id}'")

    # ------------------------------------------------------------------
    # Public write API
    # ------------------------------------------------------------------

    async def add(self, content: str, mtype: MemoryType = "observation") -> dict:
        """
        Store a new memory.

        Rates the importance with a cheap LLM call, embeds it in ChromaDB,
        appends to the in-RAM list, and returns the full entry dict.

        Args:
            content: Plain-text description of what happened / was thought.
            mtype:   'observation' | 'reflection' | 'plan'

        Returns:
            The full memory entry dict (id, content, type, timestamp,
            importance, last_accessed).
        """
        if not content or not content.strip():
            logger.warning(f"[{self.agent_id}] add() called with empty content — skipped")
            return {}

        importance = await self._rate_importance(content)

        entry = {
            "id":            str(uuid.uuid4()),
            "content":       content.strip(),
            "type":          mtype,
            "timestamp":     time.time(),
            "importance":    importance,
            "last_accessed": time.time(),
        }

        # Store in ChromaDB for semantic retrieval
        try:
            self._col.add(
                documents=[content],
                ids=[entry["id"]],
                metadatas=[{
                    "importance":  importance,
                    "timestamp":   entry["timestamp"],
                    "type":        mtype,
                    "agent_id":    self.agent_id,
                }],
            )
        except Exception as e:
            logger.error(f"[{self.agent_id}] ChromaDB add failed: {e}")

        # Append to in-RAM list, enforce cap
        self._entries.append(entry)
        if len(self._entries) > MAX_HISTORY:
            self._entries = self._entries[-MAX_HISTORY:]

        logger.debug(
            f"[{self.agent_id}] memory added | type={mtype} "
            f"importance={importance:.1f} | {content[:60]}..."
        )
        return entry

    # ------------------------------------------------------------------
    # Public read API
    # ------------------------------------------------------------------

    async def retrieve(self, query: str, k: int = 5) -> list[dict]:
        """
        Retrieve the top-k most relevant memories for a given query.

        Uses the Stanford scoring formula:
            score = recency + importance/10 + relevance

        Recency favors recent memories. Importance favors memorable ones.
        Relevance favors semantically similar ones. All three matter equally.

        Args:
            query: What the agent is currently thinking about / perceiving.
            k:     How many memories to return.

        Returns:
            List of entry dicts, sorted best-first. Updates last_accessed
            on returned entries (so recency score decays from now).
        """
        if not self._entries:
            return []

        n_candidates = min(k * 4, len(self._entries))

        # Semantic search in ChromaDB to get candidate pool
        try:
            results = self._col.query(
                query_texts=[query],
                n_results=n_candidates,
            )
        except Exception as e:
            logger.error(f"[{self.agent_id}] ChromaDB query failed: {e}")
            # Fallback: return the k most recent entries
            return self._entries[-k:]

        ids_returned       = results["ids"][0]
        distances_returned = results["distances"][0]

        # Build an id→distance lookup
        dist_map = {
            mem_id: dist
            for mem_id, dist in zip(ids_returned, distances_returned)
        }

        # Score every candidate entry
        now = time.time()
        scored: list[tuple[float, dict]] = []

        for entry in self._entries:
            if entry["id"] not in dist_map:
                continue

            # Recency: exponential decay from last access, per hour
            age_hours = (now - entry["last_accessed"]) / 3600.0
            recency   = RETRIEVAL_DECAY ** age_hours

            # Importance: LLM-rated 1–10, normalized to 0–1
            importance_score = entry["importance"] / 10.0

            # Relevance: cosine distance 0 (identical) → 1 (orthogonal)
            # Chroma cosine distance is in [0, 2], so we map to relevance [0, 1]
            distance  = dist_map[entry["id"]]
            relevance = max(0.0, 1.0 - (distance / 2.0))

            score = recency + importance_score + relevance
            scored.append((score, entry))

        # Sort descending, take top-k
        scored.sort(key=lambda x: x[0], reverse=True)
        top_entries = [entry for _, entry in scored[:k]]

        # Update last_accessed so these memories "feel fresh" after use
        now_stamp = time.time()
        for entry in top_entries:
            entry["last_accessed"] = now_stamp

        return top_entries

    def should_reflect(self) -> bool:
        """
        Returns True when it's time for the agent to reflect.

        Trigger condition: the sum of importances in the last REFLECTION_WINDOW
        memories meets or exceeds IMPORTANCE_THRESHOLD (default 100).

        This mirrors the Stanford paper exactly. High-importance observations
        (a fight, a promotion, a betrayal) trigger reflection faster than
        mundane ones (making coffee, walking to work).
        """
        recent = self._entries[-REFLECTION_WINDOW:]
        total  = sum(e["importance"] for e in recent)
        return total >= IMPORTANCE_THRESHOLD

    def recent(self, n: int = 20) -> list[dict]:
        """Return the n most recent memory entries (newest last)."""
        return self._entries[-n:]

    def to_list(self) -> list[dict]:
        """Return the last 50 entries — used by reporter.py and the frontend agent panel."""
        return self._entries[-50:]

    def all_reflections(self) -> list[dict]:
        """Return all reflection-type memories — useful for the report agent."""
        return [e for e in self._entries if e["type"] == "reflection"]

    def count(self) -> int:
        return len(self._entries)

    # ------------------------------------------------------------------
    # Serialization — for saving/restoring sim state
    # ------------------------------------------------------------------

    def to_dict(self) -> dict:
        """Serialize to a plain dict (for Redis storage or JSON export)."""
        return {
            "agent_id": self.agent_id,
            "entries":  self._entries[-200:],  # cap for storage efficiency
        }

    @classmethod
    def from_dict(cls, data: dict) -> "MemoryStream":
        """Restore a MemoryStream from a serialized dict. Does NOT re-embed in Chroma."""
        stream = cls.__new__(cls)
        stream.agent_id  = data["agent_id"]
        stream._entries  = data.get("entries", [])
        stream._col      = _chroma_client.get_or_create_collection(
            name=f"mem_{data['agent_id']}",
            metadata={"hnsw:space": "cosine"},
        )
        return stream

    # ------------------------------------------------------------------
    # Private helpers
    # ------------------------------------------------------------------

    async def _rate_importance(self, content: str) -> float:
        """
        Ask gpt-4o-mini to rate how important this memory is, 1–10.

        We use gpt-4o-mini here (not gpt-4o) because this is called on
        every single observation — it needs to be fast and cheap.
        The rating doesn't need to be perfect, just roughly calibrated.

        Returns a float in [1.0, 10.0]. Falls back to 5.0 on any error.
        """
        try:
            response = await _openai_client.chat.completions.create(
                model="gpt-4o-mini",
                temperature=0.0,
                max_tokens=5,
                messages=[
                    {
                        "role": "system",
                        "content": (
                            "Rate the importance of the following memory "
                            "for a person's emotional and social life, "
                            "on a scale from 1 to 10. "
                            "Reply with ONLY a single integer. No explanation."
                            "\n\n"
                            "1 = completely mundane (brushing teeth, walking to work)\n"
                            "5 = moderately significant (an argument, a new friendship)\n"
                            "10 = life-changing (a betrayal, a major achievement, a crisis)"
                        ),
                    },
                    {"role": "user", "content": content[:300]},
                ],
            )
            raw = response.choices[0].message.content.strip()
            value = float(raw.split()[0])           # take first token in case of noise
            return max(1.0, min(10.0, value))       # clamp to [1, 10]

        except Exception as e:
            logger.warning(f"[{self.agent_id}] importance rating failed: {e} — defaulting to 5.0")
            return 5.0

    def __repr__(self) -> str:
        return (
            f"MemoryStream(agent_id='{self.agent_id}', "
            f"entries={len(self._entries)}, "
            f"reflections={len(self.all_reflections())})"
        )


# ---------------------------------------------------------------------------
# Quick test — run directly: python memory.py
# ---------------------------------------------------------------------------
if __name__ == "__main__":
    import asyncio

    async def main():
        print("ThoughtField — MemoryStream smoke test\n")

        stream = MemoryStream("test_agent_01")

        # Add a mix of mundane and significant memories
        memories = [
            ("Walked to the cafe and ordered a coffee.", "observation"),
            ("Overheard two students arguing loudly about the funding cuts.", "observation"),
            ("Provost Chen announced layoffs in the arts department.", "observation"),
            ("My friend Maya told me she's planning to join the protest.", "observation"),
            ("I've been feeling increasingly angry about how admin treats students.", "reflection"),
            ("Decided to attend the protest tomorrow at noon.", "plan"),
            ("Ran into Professor Davis who seemed unusually stressed.", "observation"),
            ("The university president gave a speech that felt dismissive.", "observation"),
        ]

        print("Adding memories...")
        for content, mtype in memories:
            entry = await stream.add(content, mtype)
            print(f"  [{mtype:11s}] importance={entry.get('importance',0):.1f} | {content[:55]}")

        print(f"\nTotal memories: {stream.count()}")
        print(f"Should reflect: {stream.should_reflect()}")

        print("\nRetrieving memories relevant to 'protest and funding cuts'...")
        relevant = await stream.retrieve("protest and funding cuts", k=3)
        for i, m in enumerate(relevant, 1):
            print(f"  {i}. [{m['type']:11s}] {m['content'][:70]}")

        print("\nAll reflections:")
        for r in stream.all_reflections():
            print(f"  - {r['content']}")

        print(f"\n{stream}")

    asyncio.run(main())