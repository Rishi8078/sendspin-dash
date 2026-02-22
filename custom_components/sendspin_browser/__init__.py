"""Sendspin Dash - turn the dashboard browser into a Sendspin player."""

from __future__ import annotations

import logging
from pathlib import Path

import voluptuous as vol

from homeassistant.components import websocket_api
from homeassistant.components.frontend import (
    add_extra_js_url,
    async_register_built_in_panel,
    async_remove_panel,
    remove_extra_js_url,
)
from homeassistant.components.http import StaticPathConfig
from homeassistant.config_entries import ConfigEntry
from homeassistant.core import HomeAssistant

from .const import CONF_MA_URL, DOMAIN, STATIC_URL_PREFIX
from .discovery import SendspinConfigView, SendspinDiscoveryView, SendspinPlayersView

_LOGGER = logging.getLogger(__name__)


@websocket_api.websocket_command(
    {vol.Required("type"): "sendspin_browser/config"}
)
@websocket_api.async_response
async def ws_get_config(
    hass: HomeAssistant,
    connection: websocket_api.ActiveConnection,
    msg: dict,
) -> None:
    """Return Sendspin server URL derived from the first config entry."""
    entries = hass.config_entries.async_entries(DOMAIN)
    if not entries:
        connection.send_result(msg["id"], {"server_url": ""})
        return

    entry = entries[0]
    opts = {**(entry.data or {}), **(entry.options or {})}
    ma_url = (opts.get(CONF_MA_URL) or "").strip()

    server_url = ""
    if ma_url:
        server_url = ma_url.replace(":8095", ":8927") if ":8095" in ma_url else ma_url

    connection.send_result(msg["id"], {"server_url": server_url})


async def async_setup(hass: HomeAssistant, config: dict) -> bool:
    """Register WebSocket commands (runs once per HA process)."""
    websocket_api.async_register_command(hass, ws_get_config)
    return True


async def async_setup_entry(hass: HomeAssistant, config_entry: ConfigEntry) -> bool:
    """Set up Sendspin Dash from a config entry."""
    hass.data.setdefault(DOMAIN, {})
    frontend_dir = Path(__file__).parent / "frontend"

    hass.http.register_view(SendspinDiscoveryView())
    hass.http.register_view(SendspinConfigView())
    hass.http.register_view(SendspinPlayersView())

    await hass.http.async_register_static_paths(
        [
            StaticPathConfig(
                STATIC_URL_PREFIX,
                str(frontend_dir),
                False,
            )
        ]
    )

    connector_url = f"{STATIC_URL_PREFIX}/connector.js"
    add_extra_js_url(hass, connector_url)
    hass.data.setdefault(DOMAIN, {})["connector_url"] = connector_url

    panel_url = f"{STATIC_URL_PREFIX}/sendspin_browser_panel.js"
    async_register_built_in_panel(
        hass=hass,
        component_name="custom",
        sidebar_title="Sendspin Dash",
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
