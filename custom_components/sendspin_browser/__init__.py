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

from .const import CONF_SERVER_URL, DOMAIN, STATIC_URL_PREFIX
from .discovery import SendspinDiscoveryView
from .player_registry import PlayerRegistry

_LOGGER = logging.getLogger(__name__)


def _get_registry(hass: HomeAssistant) -> PlayerRegistry | None:
    return hass.data.get(DOMAIN, {}).get("registry")


# --- WebSocket commands ---


@websocket_api.websocket_command(
    {vol.Required("type"): "sendspin_browser/config"}
)
@websocket_api.async_response
async def ws_get_config(
    hass: HomeAssistant,
    connection: websocket_api.ActiveConnection,
    msg: dict,
) -> None:
    """Return Sendspin server URL from the first config entry."""
    entries = hass.config_entries.async_entries(DOMAIN)
    if not entries:
        connection.send_result(msg["id"], {"server_url": ""})
        return
    entry = entries[0]
    opts = {**(entry.data or {}), **(entry.options or {})}
    server_url = (opts.get(CONF_SERVER_URL) or "").strip()
    connection.send_result(msg["id"], {"server_url": server_url})


@websocket_api.websocket_command(
    {
        vol.Required("type"): "sendspin_browser/register_player",
        vol.Required("player_id"): str,
        vol.Optional("name", default=""): str,
        vol.Optional("user_agent", default=""): str,
    }
)
@websocket_api.async_response
async def ws_register_player(
    hass: HomeAssistant,
    connection: websocket_api.ActiveConnection,
    msg: dict,
) -> None:
    """Register or update a browser player in the persistent registry."""
    reg = _get_registry(hass)
    if not reg:
        connection.send_error(msg["id"], "not_ready", "Registry not loaded")
        return
    entry = reg.register(msg["player_id"], msg.get("name", ""), msg.get("user_agent", ""))
    connection.send_result(msg["id"], entry)


@websocket_api.websocket_command(
    {
        vol.Required("type"): "sendspin_browser/unregister_player",
        vol.Required("player_id"): str,
    }
)
@websocket_api.async_response
async def ws_unregister_player(
    hass: HomeAssistant,
    connection: websocket_api.ActiveConnection,
    msg: dict,
) -> None:
    """Remove a browser player from the registry."""
    reg = _get_registry(hass)
    if not reg:
        connection.send_error(msg["id"], "not_ready", "Registry not loaded")
        return
    reg.unregister(msg["player_id"])
    connection.send_result(msg["id"], {})


@websocket_api.websocket_command(
    {
        vol.Required("type"): "sendspin_browser/heartbeat",
        vol.Required("player_id"): str,
        vol.Optional("connected", default=False): bool,
    }
)
@websocket_api.async_response
async def ws_heartbeat(
    hass: HomeAssistant,
    connection: websocket_api.ActiveConnection,
    msg: dict,
) -> None:
    """Update last_seen and connection status for a player."""
    reg = _get_registry(hass)
    if not reg:
        connection.send_error(msg["id"], "not_ready", "Registry not loaded")
        return
    reg.heartbeat(msg["player_id"], msg.get("connected", False))
    connection.send_result(msg["id"], {})


@websocket_api.websocket_command(
    {vol.Required("type"): "sendspin_browser/players"}
)
@websocket_api.async_response
async def ws_list_players(
    hass: HomeAssistant,
    connection: websocket_api.ActiveConnection,
    msg: dict,
) -> None:
    """Return all registered players with their live status."""
    reg = _get_registry(hass)
    if not reg:
        connection.send_result(msg["id"], {"players": []})
        return
    connection.send_result(msg["id"], {"players": reg.get_all()})


# --- Setup ---


async def async_setup(hass: HomeAssistant, config: dict) -> bool:
    """Register WebSocket commands (runs once per HA process)."""
    websocket_api.async_register_command(hass, ws_get_config)
    websocket_api.async_register_command(hass, ws_register_player)
    websocket_api.async_register_command(hass, ws_unregister_player)
    websocket_api.async_register_command(hass, ws_heartbeat)
    websocket_api.async_register_command(hass, ws_list_players)
    return True


async def async_setup_entry(hass: HomeAssistant, config_entry: ConfigEntry) -> bool:
    """Set up Sendspin Dash from a config entry."""
    hass.data.setdefault(DOMAIN, {})

    registry = PlayerRegistry(hass)
    await registry.async_load()
    hass.data[DOMAIN]["registry"] = registry

    frontend_dir = Path(__file__).parent / "frontend"

    hass.http.register_view(SendspinDiscoveryView())

    await hass.http.async_register_static_paths(
        [StaticPathConfig(STATIC_URL_PREFIX, str(frontend_dir), False)]
    )

    connector_url = f"{STATIC_URL_PREFIX}/connector.js"
    add_extra_js_url(hass, connector_url)
    hass.data[DOMAIN]["connector_url"] = connector_url

    panel_url = f"{STATIC_URL_PREFIX}/sendspin_browser_panel.js"
    async_register_built_in_panel(
        hass=hass,
        component_name="custom",
        sidebar_title="Sendspin Dash",
        sidebar_icon="mdi:speaker-wireless",
        frontend_url_path=DOMAIN,
        require_admin=False,
        config={"_panel_custom": {"name": "sendspin-browser-panel", "module_url": panel_url}},
        update=True,
    )

    return True


async def async_unload_entry(hass: HomeAssistant, config_entry: ConfigEntry) -> bool:
    """Unload a config entry and remove the panel and connector."""
    if connector_url := hass.data.get(DOMAIN, {}).pop("connector_url", None):
        remove_extra_js_url(hass, connector_url)
    hass.data.get(DOMAIN, {}).pop("registry", None)
    async_remove_panel(hass, DOMAIN)
    return True
