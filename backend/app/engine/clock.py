"""
ThoughtField — backend/app/engine/clock.py
-------------------------------------------
Prompt 6 of 10.

The simulation clock. Controls the relationship between real time and
sim time, and provides human-readable time strings for agent prompts.

Time scale: 1 real second = 10 sim minutes (configurable via SIM_SPEED).
At default speed:
  1 real second  = 10 sim minutes
  6 real seconds = 1 sim hour
  2.4 real mins  = 1 sim day (24 hours)

So a 3-day simulation runs in ~7 real minutes. Fast enough to watch live,
slow enough that agents have meaningful things to do each day.

Each call to tick() advances by SIM_TICK_MINUTES (default 10).
simulation.py calls tick() once per iteration of its main loop.
"""

import os
import logging

logger = logging.getLogger(__name__)

# How many sim-minutes advance per tick
SIM_TICK_MINUTES = int(os.getenv("SIM_TICK_MINUTES", "10"))

# Sim day starts at this hour (6 AM)
DAY_START_HOUR = 6

# Agents generate a new daily plan when the clock rolls past this hour
MORNING_PLAN_HOUR = 6


class SimClock:
    """
    Tracks simulation time as total elapsed minutes from Day 1, 6:00 AM.

    Internal state: self._total_minutes (int)
    Everything else is derived from this single counter.

    Usage:
        clock = SimClock()
        clock.time_str()     → "6:00 AM"
        clock.tick()
        clock.time_str()     → "6:10 AM"
        clock.is_new_day()   → False  (only True on the tick that crosses midnight)
    """

    def __init__(self, start_day: int = 1, start_hour: int = DAY_START_HOUR):
        # Total minutes elapsed since simulation epoch
        self._total_minutes = (start_day - 1) * 1440 + start_hour * 60
        self._prev_day      = start_day
        logger.info(f"SimClock initialized at {self.time_str()} (Day {self.day})")

    # ------------------------------------------------------------------
    # Core properties
    # ------------------------------------------------------------------

    @property
    def day(self) -> int:
        """Current sim day (1-indexed)."""
        return self._total_minutes // 1440 + 1

    @property
    def hour(self) -> int:
        """Current sim hour (0–23)."""
        return (self._total_minutes % 1440) // 60

    @property
    def minute(self) -> int:
        """Current sim minute within the hour (0–59)."""
        return self._total_minutes % 60

    @property
    def total_minutes(self) -> int:
        return self._total_minutes

    # ------------------------------------------------------------------
    # Human-readable output — injected into every LLM prompt
    # ------------------------------------------------------------------

    def time_str(self) -> str:
        """
        Return current time as "HH:MM AM/PM".
        e.g. "6:00 AM", "12:30 PM", "11:50 PM"
        """
        h   = self.hour
        m   = self.minute
        ampm = "AM" if h < 12 else "PM"
        h12  = h % 12
        if h12 == 0:
            h12 = 12
        return f"{h12}:{m:02d} {ampm}"

    def day_time_str(self) -> str:
        """Return "Day N, HH:MM AM/PM" — used in simulation snapshots."""
        return f"Day {self.day}, {self.time_str()}"

    # ------------------------------------------------------------------
    # Tick and event detection
    # ------------------------------------------------------------------

    def tick(self):
        """Advance the clock by SIM_TICK_MINUTES."""
        self._prev_day      = self.day
        self._total_minutes += SIM_TICK_MINUTES

    def is_new_day(self) -> bool:
        """
        True on the single tick that crosses into a new day.
        Used by simulation.py to trigger morning replanning for all agents.
        """
        return self.day > self._prev_day

    def is_morning(self) -> bool:
        """True during the 6:00–7:00 AM window — morning plan window."""
        return self.hour == MORNING_PLAN_HOUR

    def is_current_slot(self, time_str: str) -> bool:
        """
        True if time_str (e.g. "10:00 AM") falls within the current hour.
        Used by agent._sync_plan() to match plan items to current time.
        """
        try:
            time_str = time_str.strip().upper()
            is_pm    = time_str.endswith("PM")
            clean    = time_str.replace("AM", "").replace("PM", "").strip()
            slot_h   = int(clean.split(":")[0])
            if is_pm and slot_h != 12:
                slot_h += 12
            elif not is_pm and slot_h == 12:
                slot_h = 0
            return slot_h == self.hour
        except (ValueError, IndexError):
            return False

    def ticks_elapsed(self, since_minutes: int) -> int:
        """How many ticks since a given total_minutes value?"""
        return (self._total_minutes - since_minutes) // SIM_TICK_MINUTES

    def __repr__(self) -> str:
        return f"SimClock(day={self.day}, time='{self.time_str()}', total_min={self._total_minutes})"


# ---------------------------------------------------------------------------
# Quick test
# ---------------------------------------------------------------------------
if __name__ == "__main__":
    clock = SimClock()
    print("ThoughtField — SimClock smoke test\n")
    print(f"Start: {clock}")

    # Simulate one full day
    new_day_fired = False
    for _ in range(144):    # 144 ticks × 10 min = 1440 min = 24 hours
        clock.tick()
        if clock.is_new_day() and not new_day_fired:
            print(f"  New day fired at: {clock.day_time_str()}")
            new_day_fired = True

    print(f"After 144 ticks (1 sim-day): {clock}")
    print(f"Is morning: {clock.is_morning()}")
    print(f"time_str: {clock.time_str()}")