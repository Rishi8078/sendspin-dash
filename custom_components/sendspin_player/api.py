"""API Handler for SendSpin Player."""
import logging
import aiohttp

from homeassistant.components.http import HomeAssistantView
from homeassistant.core import HomeAssistant
from homeassistant.helpers.typing import HomeAssistantType

from .const import DOMAIN, CONF_MA_URL, CONF_MA_TOKEN

_LOGGER = logging.getLogger(__name__)

class SendSpinConfigView(HomeAssistantView):
    """View to serve Music Assistant configuration to the frontend browser player.
    
    The frontend connects DIRECTLY to Music Assistant using this configuration.
    No proxy is needed - the browser makes a direct WebSocket connection to MA.
    
    Authentication is required - must be authenticated user or have valid token.
    """

    url = "/api/sendspin_player/config"
    name = "api:sendspin_player:config"
    requires_auth = True  # Requires authentication (user or token)

    def __init__(self, hass: HomeAssistant):
        """Initialize."""
        self.hass = hass

    async def get(self, request):
        """Return the Music Assistant configuration for the browser player.
        
        Only accessible to authenticated users or with valid long-lived access token.
        
        Returns:
            JSON with ma_url and token (if configured) so the browser can
            connect directly to Music Assistant.
        """
        # Verify authentication
        # Note: requires_auth = True already ensures authentication at framework level
        # but we can add additional validation if needed
        
        user = request.app.get("hass_user")
        if not user and not request.get("hass_token_id"):
            _LOGGER.warning(
                "Unauthorized access attempt to /api/sendspin_player/config from %s",
                request.remote
            )
            return aiohttp.web.json_response(
                {"error": "Unauthorized"}, 
                status=401
            )
        
        # Find the loaded config entry
        entries = self.hass.config_entries.async_entries(DOMAIN)
        if not entries:
            _LOGGER.warning("SendSpin config endpoint called but no integration configured")
            return aiohttp.web.json_response({"error": "Not configured"}, status=404)
        
        entry = entries[0]
        ma_url = entry.data.get(CONF_MA_URL)
        token = entry.data.get(CONF_MA_TOKEN)
        
        if not ma_url:
            _LOGGER.error("Music Assistant URL not configured")
            return aiohttp.web.json_response(
                {"error": "Music Assistant URL not configured"}, 
                status=400
            )
        
        _LOGGER.debug(
            f"SendSpin config accessed by user {user.name if user else 'token'}: "
            f"MA URL={ma_url}, has_token={bool(token)}"
        )
        
        # Return the config for direct browser connection to MA
        return aiohttp.web.json_response({
            "ma_url": ma_url,
            "token": token,
        })

