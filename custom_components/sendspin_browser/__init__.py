"""Sendspin Browser Player - turn the dashboard browser into a Sendspin player."""

from __future__ import annotations

import logging
from pathlib import Path

from homeassistant.components.frontend import (
    add_extra_js_url,
    async_register_built_in_panel,
    async_remove_panel,
    remove_extra_js_url,
)
from homeassistant.components.http import StaticPathConfig
from homeassistant.config_entries import ConfigEntry
from homeassistant.core import HomeAssistant

from .const import DOMAIN, STATIC_URL_PREFIX
from .discovery import SendspinConfigView, SendspinDiscoveryView, SendspinPingView, SendspinPlayersView

_LOGGER = logging.getLogger(__name__)


async def async_setup(hass: HomeAssistant, config: dict) -> bool:
    """Set up the Sendspin Browser component (no config entry yet)."""
    return True


async def async_setup_entry(hass: HomeAssistant, config_entry: ConfigEntry) -> bool:
    """Set up Sendspin Browser from a config entry."""
    hass.data.setdefault(DOMAIN, {})
    frontend_dir = Path(__file__).parent / "frontend"

    hass.http.register_view(SendspinDiscoveryView())
    hass.http.register_view(SendspinConfigView())
    hass.http.register_view(SendspinPingView())
    hass.http.register_view(SendspinPlayersView())

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

    # Connector runs on every HA page (like browser_mod) so the browser stays registered
    # as a Sendspin player even when the custom panel is closed.
    connector_url = f"{STATIC_URL_PREFIX}/connector.js"
    add_extra_js_url(hass, connector_url)
    hass.data.setdefault(DOMAIN, {})["connector_url"] = connector_url

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
        update=True,
    )

    return True


async def async_unload_entry(hass: HomeAssistant, config_entry: ConfigEntry) -> bool:
    """Unload a config entry and remove the panel and connector."""
    if connector_url := hass.data.get(DOMAIN, {}).pop("connector_url", None):
        remove_extra_js_url(hass, connector_url)
    async_remove_panel(hass, DOMAIN)
    return True
