"""API Handler for SendSpin Player."""
import logging
import asyncio
import aiohttp
from typing import Optional

from homeassistant.components.http import HomeAssistantView
from homeassistant.core import HomeAssistant, callback
from homeassistant.helpers.aiohttp_client import async_get_clientsession

from .const import DOMAIN, CONF_MA_URL, CONF_MA_TOKEN

_LOGGER = logging.getLogger(__name__)

class SendSpinConfigView(HomeAssistantView):
    """View to serve the configuration (Token) to the frontend."""

    url = "/api/sendspin_player/config"
    name = "api:sendspin_player:config"
    requires_auth = True  # Secured endpoint

    def __init__(self, hass: HomeAssistant):
        """Initialize."""
        self.hass = hass

    async def get(self, request):
        """Return the configuration."""
        # Find the loaded config entry
        # We assume one entry for now
        entries = self.hass.config_entries.async_entries(DOMAIN)
        if not entries:
            return aiohttp.web.json_response({"error": "Not configured"}, status=404)
        
        entry = entries[0] # Get first entry
        token = entry.data.get(CONF_MA_TOKEN)
        
        if not token:
            return aiohttp.web.json_response({"error": "Token not configured"}, status=400)
        
        return aiohttp.web.json_response({
            "token": token
        })

class SendSpinProxyView(HomeAssistantView):
    """View to proxy WebSocket connections to Music Assistant."""

    url = "/api/sendspin_player/ws"
    name = "api:sendspin_player:ws"
    requires_auth = True  # Secured endpoint - requires valid HA auth

    def __init__(self, hass: HomeAssistant, ma_url: str):
        """Initialize the proxy view."""
        self.hass = hass
        self.ma_url = ma_url.rstrip("/")
        # Determine MA WS URL
        if self.ma_url.startswith("https://"):
            self.ma_ws_url = self.ma_url.replace("https://", "wss://") + "/ws"
        elif self.ma_url.startswith("http://"):
            self.ma_ws_url = self.ma_url.replace("http://", "ws://") + "/ws"
        else:
            # Assume http if no scheme provided
            self.ma_ws_url = f"ws://{self.ma_url}/ws"

    async def get(self, request):
        """Handle WebSocket connection."""
        ws_server = aiohttp.web.WebSocketResponse()
        await ws_server.prepare(request)

        _LOGGER.debug(f"New SendSpin connection. Proxying to {self.ma_ws_url}")

        session = async_get_clientsession(self.hass)
        
        try:
            async with session.ws_connect(self.ma_ws_url) as ws_client:
                # Create tasks to forward messages in both directions
                
                # Browser -> HA -> MA
                async def forward_client_to_server():
                    async for msg in ws_server:
                        if msg.type == aiohttp.WSMsgType.TEXT:
                            await ws_client.send_str(msg.data)
                        elif msg.type == aiohttp.WSMsgType.BINARY:
                            await ws_client.send_bytes(msg.data)
                        elif msg.type == aiohttp.WSMsgType.ERROR:
                            _LOGGER.error(f"Client WS error: {ws_server.exception()}")

                # MA -> HA -> Browser
                async def forward_server_to_client():
                    async for msg in ws_client:
                        if msg.type == aiohttp.WSMsgType.TEXT:
                            await ws_server.send_str(msg.data)
                        elif msg.type == aiohttp.WSMsgType.BINARY:
                            await ws_server.send_bytes(msg.data)
                        elif msg.type == aiohttp.WSMsgType.ERROR:
                            _LOGGER.error(f"Server WS error: {ws_client.exception()}")
                        elif msg.type == aiohttp.WSMsgType.CLOSE:
                            await ws_server.close()

                # Run both tasks
                client_task = self.hass.async_create_task(forward_client_to_server())
                server_task = self.hass.async_create_task(forward_server_to_client())

                # Wait for either to finish (likely due to disconnect)
                done, pending = await asyncio.wait(
                    [client_task, server_task],
                    return_when=asyncio.FIRST_COMPLETED,
                )

                # Cancel any remaining tasks
                for task in pending:
                    task.cancel()
                    try:
                        await task
                    except asyncio.CancelledError:
                        pass

        except Exception as err:
            _LOGGER.error(f"Proxy connection failed: {err}")
            await ws_server.close()

        _LOGGER.debug("SendSpin connection closed")
        return ws_server
