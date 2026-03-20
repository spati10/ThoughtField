"""
ThoughtField — backend/app/api/report.py
-----------------------------------------
Prompt 7 of 10.

GET /api/report/{sim_id}  — generate and return the prediction report

Checks if the simulation is done, then calls reporter.py (Prompt 8)
to synthesize the full simulation history into a structured prediction.

The report is cached in Redis after first generation so repeated
GET requests don't re-run the LLM call.
"""

import json
import logging
import sys
import os
sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))
from fastapi import APIRouter, HTTPException

from engine.simulation import get_redis

logger = logging.getLogger(__name__)
router = APIRouter()


@router.get("/report/{sim_id}")
async def get_report(sim_id: str):
    """
    Get the prediction report for a completed simulation.

    Returns immediately if the report is cached.
    Generates it on first call (takes ~10–20 seconds for gpt-4o).
    Returns 202 if the simulation is still running.
    Returns 404 if the sim_id doesn't exist.
    """
    redis = await get_redis()

    # Check sim exists
    status = await redis.get(f"sim:{sim_id}:status")
    if not status:
        raise HTTPException(status_code=404, detail=f"Simulation '{sim_id}' not found")

    # Return 202 if still running
    if status in ("running", "initializing"):
        progress = int(await redis.get(f"sim:{sim_id}:progress") or 0)
        return {
            "sim_id":   sim_id,
            "status":   status,
            "progress": progress,
            "report":   None,
            "message":  f"Simulation still running ({progress}%). Check back soon.",
        }

    if status == "error":
        error = await redis.get(f"sim:{sim_id}:error") or "Unknown error"
        raise HTTPException(status_code=500, detail=f"Simulation failed: {error}")

    # Return cached report if available
    cached = await redis.get(f"sim:{sim_id}:report")
    if cached:
        return {
            "sim_id": sim_id,
            "status": "done",
            "report": json.loads(cached),
            "cached": True,
        }

    # Generate report (sim is done, no cache yet)
    logger.info(f"[sim:{sim_id}] Generating prediction report...")
    try:
        # Import here to avoid circular imports at module level
        from report.reporter import generate_report
        report = await generate_report(sim_id)
    except Exception as e:
        logger.error(f"[sim:{sim_id}] Report generation failed: {e}")
        raise HTTPException(status_code=500, detail=f"Report generation failed: {e}")

    # Cache the report
    await redis.set(f"sim:{sim_id}:report", json.dumps(report))

    logger.info(f"[sim:{sim_id}] Report generated and cached")
    return {
        "sim_id": sim_id,
        "status": "done",
        "report": report,
        "cached": False,
    }


@router.delete("/report/{sim_id}/cache")
async def clear_report_cache(sim_id: str):
    """
    Clear the cached report for a simulation — forces regeneration on next GET.
    Useful during development when tweaking the reporter prompt.
    """
    redis = await get_redis()
    await redis.delete(f"sim:{sim_id}:report")
    return {"sim_id": sim_id, "message": "Report cache cleared"}