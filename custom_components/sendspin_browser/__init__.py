"""Sendspin Browser Player - turn the dashboard browser into a Sendspin player."""

from __future__ import annotations

import logging
from pathlib import Path

from homeassistant.components.frontend import async_register_built_in_panel
from homeassistant.components.http import StaticPathConfig
from homeassistant.config_entries import ConfigEntry
from homeassistant.core import HomeAssistant

from .const import DOMAIN, STATIC_URL_PREFIX
from .discovery import SendspinDiscoveryView

_LOGGER = logging.getLogger(__name__)


async def async_setup(hass: HomeAssistant, config: dict) -> bool:
    """Set up the Sendspin Browser component (no config entry yet)."""
    return True


async def async_setup_entry(hass: HomeAssistant, config_entry: ConfigEntry) -> bool:
    """Set up Sendspin Browser from a config entry."""
    hass.data.setdefault(DOMAIN, {})
    frontend_dir = Path(__file__).parent / "frontend"

    hass.http.register_view(SendspinDiscoveryView())

    # Serve frontend (player HTML/JS/CSS + panel script) at /sendspin_browser/*
    await hass.http.async_register_static_paths(
        [
            StaticPathConfig(
                STATIC_URL_PREFIX,
                str(frontend_dir),
                False,
            )
        ]
    )

    panel_url = f"{STATIC_URL_PREFIX}/sendspin_browser_panel.js"
    async_register_built_in_panel(
        hass=hass,
        component_name="custom",
        sidebar_title="Sendspin Player",
        sidebar_icon="mdi:speaker-wireless",
        frontend_url_path=DOMAIN,
        require_admin=False,
        config={
            "_panel_custom": {
                "name": "sendspin-browser-panel",
                "js_url": panel_url,
            }
        },
    )

    return True


async def async_unload_entry(hass: HomeAssistant, config_entry: ConfigEntry) -> bool:
    """Unload a config entry (panel remains until HA restart)."""
    return True
