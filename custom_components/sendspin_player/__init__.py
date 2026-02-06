"""The SendSpin Player integration.

Delivers the Sendspin server URL to the browser frontend via WebSocket.
The browser then connects directly to the Sendspin server (e.g. Music Assistant)
using the sendspin-js SDK over a separate WebSocket at ws://server:port/sendspin.

No auth token is needed — Sendspin is a local LAN protocol.
"""
import logging
from pathlib import Path

import voluptuous as vol

from homeassistant.components import websocket_api
from homeassistant.config_entries import ConfigEntry
from homeassistant.core import HomeAssistant, callback
from homeassistant.components.http import StaticPathConfig
from homeassistant.components.frontend import add_extra_js_url

from .const import DOMAIN, CONF_SERVER_URL, WS_GET_CONFIG

_LOGGER = logging.getLogger(__name__)

PLATFORMS: list[str] = []


async def async_setup_entry(hass: HomeAssistant, entry: ConfigEntry) -> bool:
    """Set up SendSpin Player from a config entry."""
    hass.data.setdefault(DOMAIN, {})
    hass.data[DOMAIN][entry.entry_id] = {
        "server_url": entry.data.get(CONF_SERVER_URL),
    }

    # 1. Register WebSocket command for config delivery
    websocket_api.async_register_command(hass, ws_get_config)
    _LOGGER.info("SendSpin: registered websocket command %s", WS_GET_CONFIG)

    # 2. Serve frontend static files
    component_dir = Path(__file__).parent
    frontend_dir = component_dir / "frontend"

    await hass.http.async_register_static_paths([
        StaticPathConfig(
            url_path="/sendspin_player_static",
            path=str(frontend_dir),
            cache_headers=False,
        )
    ])

    # 3. Inject bootstrap script into every dashboard
    add_extra_js_url(hass, "/sendspin_player_static/sendspin-bootstrap.js")
    _LOGGER.info("SendSpin: integration setup complete")

    return True


async def async_unload_entry(hass: HomeAssistant, entry: ConfigEntry) -> bool:
    """Unload a config entry."""
    hass.data[DOMAIN].pop(entry.entry_id, None)
    return True


@websocket_api.websocket_command(
    {vol.Required("type"): WS_GET_CONFIG}
)
@callback
def ws_get_config(
    hass: HomeAssistant,
    connection: websocket_api.ActiveConnection,
    msg: dict,
) -> None:
    """Return the Sendspin server URL over WebSocket.

    Called by the frontend JS via hass.connection.sendMessagePromise().
    Authentication is handled by the HA WebSocket framework.
    """
    entries = hass.config_entries.async_entries(DOMAIN)
    if not entries:
        connection.send_error(msg["id"], "not_configured", "SendSpin not configured")
        return

    entry = entries[0]
    server_url = entry.data.get(CONF_SERVER_URL, "")

    _LOGGER.debug("SendSpin: config requested by user %s", connection.user.name)

    connection.send_result(msg["id"], {
        "server_url": server_url,
    })
