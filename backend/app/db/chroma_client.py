# ThoughtField — backend/app/db/chroma_client.py
# Prompt supplement.
#
# ChromaDB singleton. Import get_chroma() anywhere you need vector storage.
# Uses PersistentClient so embeddings survive server restarts.
# One collection per agent: "mem_{agent_id}"

from __future__ import annotations
import os
import logging

import chromadb
from chromadb.config import Settings

logger = logging.getLogger(__name__)

CHROMA_PATH = os.getenv("CHROMA_PATH", "./chroma_db")

_client: chromadb.PersistentClient | None = None


def get_chroma() -> chromadb.PersistentClient:
    """
    Return the shared ChromaDB persistent client.
    Creates it on first call, reuses on subsequent calls.
    Thread-safe for async use (chromadb handles its own locking).
    """
    global _client
    if _client is None:
        _client = chromadb.PersistentClient(
            path=CHROMA_PATH,
            settings=Settings(anonymized_telemetry=False, allow_reset=True),
        )
        logger.info(f"ChromaDB initialized at: {CHROMA_PATH}")
    return _client


def get_or_create_agent_collection(agent_id: str):
    """
    Get or create the memory collection for a specific agent.
    Collection name: mem_{agent_id}
    Uses cosine similarity space (best for semantic text retrieval).
    """
    client = get_chroma()
    return client.get_or_create_collection(
        name=f"mem_{agent_id}",
        metadata={"hnsw:space": "cosine"},
    )


def delete_agent_collection(agent_id: str):
    """Delete an agent's memory collection. Used for cleanup after sims."""
    try:
        client = get_chroma()
        client.delete_collection(f"mem_{agent_id}")
        logger.info(f"Deleted collection for agent: {agent_id}")
    except Exception as e:
        logger.warning(f"Could not delete collection mem_{agent_id}: {e}")


def list_collections() -> list[str]:
    """Return names of all existing collections."""
    try:
        client = get_chroma()
        return [c.name for c in client.list_collections()]
    except Exception:
        return []