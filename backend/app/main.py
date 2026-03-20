"""
ThoughtField — backend/app/main.py
------------------------------------
FastAPI application entry point.

sys.path fix at the top ensures all internal imports resolve correctly
on both Windows and Mac/Linux regardless of where uvicorn is invoked from.
"""

import sys
import os
import logging
from dotenv import load_dotenv
load_dotenv(os.path.join(os.path.dirname(__file__), '..', '.env'))




sys.path.insert(0, os.path.dirname(__file__))

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from api.simulate import router as simulate_router
from api.report   import router as report_router
from api.event    import router as event_router
from api.ws       import router as ws_router

# ---------------------------------------------------------------------------
# Logging
# ---------------------------------------------------------------------------
LOG_LEVEL = os.getenv("LOG_LEVEL", "INFO").upper()

logging.basicConfig(
    level=getattr(logging, LOG_LEVEL, logging.INFO),
    format="%(asctime)s | %(levelname)-8s | %(name)s | %(message)s",
    datefmt="%H:%M:%S",
)
logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# App
# ---------------------------------------------------------------------------
app = FastAPI(
    title="ThoughtField API",
    description="Seed any text -> living agents -> emergent behaviors -> prediction.",
    version="0.1.0",
    docs_url="/docs",
    redoc_url="/redoc",
)

# ---------------------------------------------------------------------------
# CORS — hardcoded for local dev reliability
# ---------------------------------------------------------------------------
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ---------------------------------------------------------------------------
# Routers
# ---------------------------------------------------------------------------
app.include_router(simulate_router, prefix="/api", tags=["simulation"])
app.include_router(report_router,   prefix="/api", tags=["report"])
app.include_router(event_router,    prefix="/api", tags=["events"])
app.include_router(ws_router,       tags=["websocket"])

# ---------------------------------------------------------------------------
# Startup / shutdown
# ---------------------------------------------------------------------------

@app.on_event("startup")
async def on_startup():
    logger.info("=" * 50)
    logger.info("ThoughtField API starting up")
    logger.info(f"  Python path includes: {os.path.dirname(__file__)}")

    # Verify Redis
    try:
        from db.redis_client import get_redis
        redis = await get_redis()
        await redis.ping()
        logger.info("  Redis:    connected OK")
    except Exception as e:
        logger.error(f"  Redis:    FAILED — {e}")
        logger.error("  Fix:  docker run -d -p 6379:6379 --name thoughtfield-redis redis:alpine")

    # Verify ChromaDB
    try:
        from db.chroma_client import get_chroma
        get_chroma()
        logger.info("  ChromaDB: ready (./chroma_db)")
    except Exception as e:
        logger.warning(f"  ChromaDB: warning — {e}")

    # Verify OpenAI key is set
    key = os.getenv("OPENAI_API_KEY", "")
    if key.startswith("sk-"):
        logger.info(f"  OpenAI:   key found (sk-...{key[-4:]})")
    else:
        logger.error("  OpenAI:   NO API KEY — set OPENAI_API_KEY in .env")

    logger.info("ThoughtField API ready.")
    logger.info("=" * 50)


@app.on_event("shutdown")
async def on_shutdown():
    logger.info("ThoughtField API shutting down")
    try:
        from db.redis_client import close_redis
        await close_redis()
    except Exception:
        pass


# ---------------------------------------------------------------------------
# Health + info
# ---------------------------------------------------------------------------

@app.get("/health", tags=["meta"])
async def health():
    return {"status": "ok", "service": "thoughtfield-api"}


@app.get("/info", tags=["meta"])
async def info():
    return {
        "service":     "ThoughtField",
        "version":     "0.1.0",
        "models": {
            "agent_model":   os.getenv("AGENT_MODEL",   "gpt-4o-mini"),
            "reflect_model": os.getenv("REFLECT_MODEL", "gpt-4o"),
            "report_model":  os.getenv("REPORT_MODEL",  "gpt-4o"),
        },
    }


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(
        "main:app",
        host="0.0.0.0",
        port=8000,
        reload=True,
        log_level=LOG_LEVEL.lower(),
    )