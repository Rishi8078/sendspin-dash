"""API Handler for SendSpin Player."""
import logging
import aiohttp

from homeassistant.helpers.http import HomeAssistantView
from homeassistant.core import HomeAssistant

from .const import DOMAIN, CONF_MA_URL, CONF_MA_TOKEN

_LOGGER = logging.getLogger(__name__)

class SendSpinConfigView(HomeAssistantView):
    """View to serve Music Assistant configuration to the frontend browser player.
    
    The frontend connects DIRECTLY to Music Assistant using this configuration.
    No proxy is needed - the browser makes a direct WebSocket connection to MA.
    
    Authentication is required - only authenticated users can access this endpoint.
    """

    url = "/api/sendspin_player/config"
    name = "api:sendspin_player:config"
    requires_auth = True  # Framework-level authentication (requires logged-in user or token)

    def __init__(self, hass: HomeAssistant):
        """Initialize."""
        self.hass = hass

    async def get(self, request):
        """Return the Music Assistant configuration for the browser player.
        
        Only accessible to authenticated users or with valid long-lived access token.
        The requires_auth = True attribute ensures framework-level authentication.
        
        Returns:
            JSON with ma_url and token (if configured) so the browser can
            connect directly to Music Assistant.
        """
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
        
        # Log access for debugging
        user = request.get("hass_user")
        user_name = user.name if user else "token"
        _LOGGER.debug(
            f"SendSpin config accessed by {user_name}: "
            f"MA URL={ma_url}, has_token={bool(token)}"
        )
        
        # Return the config for direct browser connection to MA
        return aiohttp.web.json_response({
            "ma_url": ma_url,
            "token": token,
        })

