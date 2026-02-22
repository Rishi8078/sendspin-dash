"""Persistent player registry backed by HA's Store."""

from __future__ import annotations

import logging
import time
from typing import Any

from homeassistant.core import HomeAssistant
from homeassistant.helpers.storage import Store

from .const import DOMAIN

_LOGGER = logging.getLogger(__name__)

STORAGE_KEY = f"{DOMAIN}.players"
STORAGE_VERSION = 1

HEARTBEAT_TIMEOUT_S = 30


class PlayerRegistry:
    """Track registered Sendspin browser players across devices."""

    def __init__(self, hass: HomeAssistant) -> None:
        self._hass = hass
        self._store = Store(hass, STORAGE_VERSION, STORAGE_KEY)
        self._players: dict[str, dict[str, Any]] = {}

    async def async_load(self) -> None:
        data = await self._store.async_load()
        if data and isinstance(data.get("players"), dict):
            self._players = data["players"]

    async def _async_save(self) -> None:
        await self._store.async_save({"players": self._players})

    def register(self, player_id: str, name: str, user_agent: str) -> dict[str, Any]:
        now = time.time()
        existing = self._players.get(player_id)
        self._players[player_id] = {
            "name": name or (existing or {}).get("name", "Browser"),
            "user_agent": user_agent,
            "registered_at": (existing or {}).get("registered_at", now),
            "last_seen": now,
            "connected": False,
        }
        self._hass.async_create_task(self._async_save())
        return self._players[player_id]

    def unregister(self, player_id: str) -> None:
        if player_id in self._players:
            del self._players[player_id]
            self._hass.async_create_task(self._async_save())

    def heartbeat(self, player_id: str, connected: bool) -> None:
        if player_id in self._players:
            self._players[player_id]["last_seen"] = time.time()
            self._players[player_id]["connected"] = connected

    def get_all(self) -> list[dict[str, Any]]:
        now = time.time()
        result = []
        for pid, p in self._players.items():
            age = now - p.get("last_seen", 0)
            if age > HEARTBEAT_TIMEOUT_S:
                status = "offline"
            elif p.get("connected"):
                status = "connected"
            else:
                status = "online"
            result.append({
                "player_id": pid,
                "name": p.get("name", ""),
                "user_agent": p.get("user_agent", ""),
                "registered_at": p.get("registered_at", 0),
                "last_seen": p.get("last_seen", 0),
                "status": status,
            })
        return result
