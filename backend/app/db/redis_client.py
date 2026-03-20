# ThoughtField — backend/app/db/redis_client.py
# Prompt supplement.
#
# Redis singleton. Import get_redis() anywhere you need Redis.
# Uses aioredis for async support. Single connection reused across requests.

import os
import logging

import redis.asyncio as aioredis

logger = logging.getLogger(__name__)

REDIS_URL = os.getenv("REDIS_URL", "redis://localhost:6379")

_redis: aioredis.Redis | None = None


async def get_redis() -> aioredis.Redis:
    """
    Return the shared async Redis client.
    Creates it on first call, reuses on subsequent calls.
    """
    global _redis
    if _redis is None:
        _redis = await aioredis.from_url(
            REDIS_URL,
            encoding="utf-8",
            decode_responses=True,
        )
        logger.info(f"Redis connected: {REDIS_URL}")
    return _redis


async def close_redis():
    """Call on app shutdown to close the connection cleanly."""
    global _redis
    if _redis:
        await _redis.close()
        _redis = None
        logger.info("Redis connection closed")


async def ping_redis() -> bool:
    """Returns True if Redis is reachable, False otherwise."""
    try:
        r = await get_redis()
        await r.ping()
        return True
    except Exception as e:
        logger.error(f"Redis ping failed: {e}")
        return False