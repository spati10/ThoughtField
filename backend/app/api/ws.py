"""
ThoughtField — backend/app/api/ws.py
--------------------------------------
Prompt 7 of 10.

WebSocket /ws/sim/{sim_id}  — live simulation state stream

Every connected frontend (/sim/{sim_id}) subscribes here and receives
a JSON snapshot every tick (~2 seconds). This is what drives:
  - Agent positions moving on the TownMap canvas
  - Speech bubbles appearing and disappearing
  - The EventFeed updating with new speeches and actions
  - The SimClock ticking forward
  - The progress bar advancing

On connection:
  1. Immediately send the latest stored snapshot (so the page isn't blank)
  2. Subscribe to the Redis pub/sub channel for this simulation
  3. Stream every published message until the client disconnects

The simulation engine (simulation.py) publishes to this channel every tick.
Multiple frontend clients can subscribe to the same sim simultaneously.

Also handles:
  GET /ws/agent/{sim_id}/{agent_id}  — stream a single agent's memory updates
"""

import json
import logging
import sys
import os
sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))
from fastapi import APIRouter, WebSocket, WebSocketDisconnect

from engine.simulation import get_redis

logger = logging.getLogger(__name__)
router = APIRouter()


# ---------------------------------------------------------------------------
# WebSocket: full simulation stream
# ---------------------------------------------------------------------------

@router.websocket("/ws/sim/{sim_id}")
async def websocket_simulation(websocket: WebSocket, sim_id: str):
    """
    Stream live simulation state to a connected frontend client.

    Sends one JSON snapshot per tick (~every 2 seconds).
    The snapshot contains: agents (positions, actions, speech),
    sim_time, sim_day, events, stats, progress, status.

    Automatically closes when the simulation ends (status='done')
    or when the client disconnects.
    """
    await websocket.accept()
    redis  = await get_redis()
    pubsub = redis.pubsub()

    logger.info(f"[ws] Client connected to sim:{sim_id}")

    try:
        # Send current state immediately so the UI isn't blank on load
        latest_raw = await redis.get(f"sim:{sim_id}:latest")
        if latest_raw:
            await websocket.send_text(latest_raw)
        else:
            # Simulation may still be initializing — send a holding message
            await websocket.send_text(json.dumps({
                "status":   "initializing",
                "progress": 0,
                "message":  "Simulation is starting up...",
            }))

        # Subscribe to the pub/sub channel for this simulation
        await pubsub.subscribe(f"sim:{sim_id}:state")

        async for message in pubsub.listen():
            if message["type"] != "message":
                continue

            data_str = message["data"]

            # Forward to WebSocket client
            try:
                await websocket.send_text(data_str)
            except WebSocketDisconnect:
                break

            # Check if simulation is done — close cleanly
            try:
                data = json.loads(data_str)
                if data.get("status") == "done":
                    logger.info(f"[ws] Simulation {sim_id} done — closing WebSocket")
                    await websocket.close()
                    break
            except (json.JSONDecodeError, AttributeError):
                pass

    except WebSocketDisconnect:
        logger.info(f"[ws] Client disconnected from sim:{sim_id}")
    except Exception as e:
        logger.error(f"[ws] Error on sim:{sim_id}: {e}")
        try:
            await websocket.close()
        except Exception:
            pass
    finally:
        try:
            await pubsub.unsubscribe(f"sim:{sim_id}:state")
            await pubsub.close()
        except Exception:
            pass
        logger.info(f"[ws] WebSocket cleaned up for sim:{sim_id}")


# ---------------------------------------------------------------------------
# WebSocket: single agent memory stream
# ---------------------------------------------------------------------------

@router.websocket("/ws/agent/{sim_id}/{agent_id}")
async def websocket_agent(websocket: WebSocket, sim_id: str, agent_id: str):
    """
    Stream a single agent's memory updates to the AgentPanel.

    Sends the agent's latest memories whenever a new snapshot arrives.
    Used by the frontend agent profile/memory panel.
    """
    await websocket.accept()
    redis  = await get_redis()
    pubsub = redis.pubsub()

    logger.info(f"[ws] Agent panel connected: sim:{sim_id} agent:{agent_id}")

    try:
        await pubsub.subscribe(f"sim:{sim_id}:state")

        async for message in pubsub.listen():
            if message["type"] != "message":
                continue

            try:
                data = json.loads(message["data"])
            except (json.JSONDecodeError, TypeError):
                continue

            # Only forward data relevant to this agent
            agent_state = data.get("agents", {}).get(agent_id)
            if agent_state:
                await websocket.send_text(json.dumps({
                    "agent":    agent_state,
                    "sim_time": data.get("sim_time"),
                    "sim_day":  data.get("sim_day"),
                }))

            if data.get("status") == "done":
                await websocket.close()
                break

    except WebSocketDisconnect:
        logger.info(f"[ws] Agent panel disconnected: {agent_id}")
    except Exception as e:
        logger.error(f"[ws] Agent WS error: {e}")
    finally:
        try:
            await pubsub.unsubscribe(f"sim:{sim_id}:state")
            await pubsub.close()
        except Exception:
            pass


# ---------------------------------------------------------------------------
# REST fallback: GET /api/sim/{sim_id}/snapshot
# For clients that can't use WebSocket (e.g. server-side rendering)
# ---------------------------------------------------------------------------

@router.get("/sim/{sim_id}/snapshot")
async def get_snapshot(sim_id: str):
    """
    Return the latest simulation snapshot as JSON.
    Polling fallback for environments where WebSocket isn't available.
    """
    redis = await get_redis()
    raw   = await redis.get(f"sim:{sim_id}:latest")
    if not raw:
        return {"status": "not_found", "sim_id": sim_id}
    return json.loads(raw)