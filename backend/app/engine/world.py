"""
ThoughtField — backend/app/engine/world.py
-------------------------------------------
Prompt 6 of 10.

The physical world every agent moves through. A 40×40 tile grid with
named rectangular areas (cafe, park, library, etc.) that agents navigate
between using their daily plans.

Each area has:
  x, y, w, h   — tile position and size on the 40×40 grid
  color        — hex color for the canvas renderer in TownMap.tsx
  objects      — list of objects agents can perceive when inside
  capacity     — soft cap on how many agents feel comfortable here
  description  — fed into agent perception strings

The world is intentionally generic — it works for any scenario seeded
into ThoughtField. A university protest, a corporate office, a small town
political crisis — all use the same physical layout. The scenario lives
in the agents' memories and personas, not in the map.

ThoughtField uses agent.py's _perceive() to check which area the agent
is currently inside, then lists that area's objects in the perception
string. This is how agents "see" their immediate environment.
"""

import json
import logging
import os
from pathlib import Path

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Default world map — 40×40 tile grid
# Areas are non-overlapping rectangles. Safe area: x=0..39, y=0..39.
# Total covered tiles: ~600 / 1600 (rest is open paths/roads)
# ---------------------------------------------------------------------------
DEFAULT_WORLD: dict = {
    "width":  40,
    "height": 40,
    "areas": {

        # ---- Residential (top-left quadrant) ----
        "house_A": {
            "x": 1,  "y": 1,  "w": 4, "h": 4,
            "color": "#F5C4B3",
            "objects": ["bed", "desk", "kitchen", "front_door"],
            "capacity": 2,
            "description": "a small residential home",
        },
        "house_B": {
            "x": 6,  "y": 1,  "w": 4, "h": 4,
            "color": "#F5C4B3",
            "objects": ["bed", "sofa", "kitchen"],
            "capacity": 2,
            "description": "a modest apartment",
        },
        "house_C": {
            "x": 11, "y": 1,  "w": 4, "h": 4,
            "color": "#F5C4B3",
            "objects": ["bed", "bookshelf", "kitchen"],
            "capacity": 2,
            "description": "a shared house",
        },
        "house_D": {
            "x": 1,  "y": 6,  "w": 4, "h": 4,
            "color": "#F5C4B3",
            "objects": ["bed", "desk", "computer"],
            "capacity": 2,
            "description": "a student apartment",
        },
        "house_E": {
            "x": 6,  "y": 6,  "w": 4, "h": 4,
            "color": "#F5C4B3",
            "objects": ["bed", "dining_table", "garden"],
            "capacity": 3,
            "description": "a family home",
        },

        # ---- Cafe (top-center) ----
        "cafe": {
            "x": 16, "y": 1,  "w": 7, "h": 5,
            "color": "#FAC775",
            "objects": ["coffee_machine", "counter", "table_1", "table_2", "table_3", "noticeboard"],
            "capacity": 12,
            "description": "a busy neighbourhood cafe where people meet and gossip",
        },

        # ---- Park (top-right) ----
        "park": {
            "x": 27, "y": 1,  "w": 11, "h": 9,
            "color": "#C0DD97",
            "objects": ["bench_1", "bench_2", "fountain", "open_grass", "notice_board"],
            "capacity": 30,
            "description": "a public park where people gather and talk",
        },

        # ---- Library (left-center) ----
        "library": {
            "x": 1,  "y": 13, "w": 7, "h": 6,
            "color": "#B5D4F4",
            "objects": ["bookshelf", "reading_table", "computer_terminal", "quiet_corner"],
            "capacity": 10,
            "description": "a quiet library with study spaces and information",
        },

        # ---- Town square (center) — main gathering point ----
        "town_square": {
            "x": 14, "y": 13, "w": 12, "h": 12,
            "color": "#D3D1C7",
            "objects": ["central_fountain", "notice_board", "speaker_podium", "benches"],
            "capacity": 50,
            "description": "the main public square — demonstrations, announcements, and chance encounters happen here",
        },

        # ---- Office (right-center) ----
        "office": {
            "x": 30, "y": 13, "w": 9,  "h": 7,
            "color": "#CED4E0",
            "objects": ["reception_desk", "meeting_room", "filing_cabinet", "printer"],
            "capacity": 15,
            "description": "an administrative office building",
        },

        # ---- School / university (bottom-left) ----
        "school": {
            "x": 1,  "y": 26, "w": 10, "h": 8,
            "color": "#9FE1CB",
            "objects": ["lecture_hall", "classroom", "faculty_office", "bulletin_board", "main_entrance"],
            "capacity": 40,
            "description": "the main academic building — classrooms, faculty offices, and meeting rooms",
        },

        # ---- Market (bottom-center) ----
        "market": {
            "x": 14, "y": 29, "w": 8,  "h": 7,
            "color": "#EF9F27",
            "objects": ["market_stall_1", "market_stall_2", "grocery_stand", "busy_aisle"],
            "capacity": 20,
            "description": "a local market — a place to overhear news and run into people",
        },

        # ---- Community center (bottom-right) ----
        "community_center": {
            "x": 26, "y": 26, "w": 12, "h": 10,
            "color": "#AFA9EC",
            "objects": ["main_hall", "meeting_room", "stage", "chairs", "projector"],
            "capacity": 60,
            "description": "a community center used for meetings, events, and assemblies",
        },
    },

    # Adjacency hints — used for future pathfinding improvements
    "connections": [
        ["house_A",    "cafe"],
        ["house_B",    "cafe"],
        ["house_C",    "park"],
        ["house_D",    "library"],
        ["house_E",    "library"],
        ["cafe",       "town_square"],
        ["park",       "town_square"],
        ["library",    "town_square"],
        ["town_square","office"],
        ["town_square","school"],
        ["town_square","market"],
        ["school",     "community_center"],
        ["market",     "community_center"],
    ],
}


# ---------------------------------------------------------------------------
# Helper functions
# ---------------------------------------------------------------------------

def get_area(world: dict, name: str) -> dict | None:
    """Return the area dict for a given name, or None if not found."""
    return world.get("areas", {}).get(name)


def get_area_center(area: dict) -> tuple[int, int]:
    """Return the (x, y) tile coordinates of an area's center."""
    return (
        area["x"] + area["w"] // 2,
        area["y"] + area["h"] // 2,
    )


def get_area_for_position(world: dict, x: int, y: int) -> str | None:
    """
    Return the name of the area that contains tile (x, y), or None.
    Used by agent._perceive() to determine which area an agent is in.
    """
    for name, area in world.get("areas", {}).items():
        if (area["x"] <= x <= area["x"] + area["w"] and
                area["y"] <= y <= area["y"] + area["h"]):
            return name
    return None


def get_random_start_positions(world: dict, n: int) -> list[tuple[int, int]]:
    """
    Return n start positions, one per residential area first, then
    scattered across the map. Used by simulation.py when creating agents.
    """
    import random

    # Prefer residential houses for starts
    houses = [
        name for name in world.get("areas", {})
        if name.startswith("house_")
    ]
    positions = []
    for i in range(n):
        if i < len(houses):
            area = world["areas"][houses[i]]
            positions.append((
                area["x"] + random.randint(0, area["w"] - 1),
                area["y"] + random.randint(0, area["h"] - 1),
            ))
        else:
            # Scatter remaining agents across the grid
            positions.append((
                random.randint(2, world["width"]  - 2),
                random.randint(2, world["height"] - 2),
            ))
    return positions


def load_world(path: str | None = None) -> dict:
    """
    Load a world map from a JSON file, or return DEFAULT_WORLD.

    Args:
        path: Optional path to a custom world_map.json. If None or file
              not found, returns DEFAULT_WORLD.

    Returns:
        World dict with 'width', 'height', 'areas', 'connections'.
    """
    if path:
        p = Path(path)
        if p.exists():
            try:
                with open(p) as f:
                    data = json.load(f)
                logger.info(f"World loaded from {path}")
                return data
            except Exception as e:
                logger.error(f"Failed to load world from {path}: {e} — using default")

    logger.info("Using DEFAULT_WORLD (40×40 grid)")
    return DEFAULT_WORLD


# ---------------------------------------------------------------------------
# Quick test
# ---------------------------------------------------------------------------
if __name__ == "__main__":
    world = load_world()

    print("ThoughtField — World smoke test\n")
    print(f"Grid: {world['width']}×{world['height']} tiles")
    print(f"Areas: {len(world['areas'])}")
    print()

    for name, area in world["areas"].items():
        cx, cy = get_area_center(area)
        print(
            f"  {name:<20} @ ({area['x']:2d},{area['y']:2d}) "
            f"size={area['w']}×{area['h']}  center=({cx},{cy})  "
            f"capacity={area['capacity']}"
        )

    print()
    test_x, test_y = 20, 18
    found = get_area_for_position(world, test_x, test_y)
    print(f"Tile ({test_x},{test_y}) is in area: {found}")

    print("\nStart positions for 8 agents:")
    starts = get_random_start_positions(world, 8)
    for i, pos in enumerate(starts):
        print(f"  Agent {i+1}: {pos}")