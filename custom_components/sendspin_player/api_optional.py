"""
Optional Player Registration Endpoints for SendSpin Player

Add these endpoints to __init__.py to enable player discovery and registration.
This follows the browser_mod pattern for browser/player management.

These are OPTIONAL - the core SendSpin player works without them.
"""

from homeassistant.components.http import HomeAssistantView
from homeassistant.core import HomeAssistant
import json
import aiohttp

REGISTERED_PLAYERS_FILE = "sendspin_registered_players.json"


class SendSpinPlayerRegistrationView(HomeAssistantView):
    """Handle player registration/unregistration."""

    url = "/api/sendspin_player/register"
    name = "api:sendspin_player:register"
    requires_auth = True

    def __init__(self, hass: HomeAssistant):
        """Initialize."""
        self.hass = hass

    async def post(self, request):
        """Register a browser as a SendSpin player."""
        try:
            data = await request.json()
            
            # Validate required fields
            if not data.get("playerId") or not data.get("playerName"):
                return aiohttp.web.json_response(
                    {"error": "Missing playerId or playerName"}, 
                    status=400
                )
            
            # Store registration (could use hass.data or a file)
            if "sendspin_registered_players" not in self.hass.data:
                self.hass.data["sendspin_registered_players"] = {}
            
            self.hass.data["sendspin_registered_players"][data["playerId"]] = {
                "playerId": data["playerId"],
                "playerName": data["playerName"],
                "browserInfo": data.get("browserInfo"),
                "registeredAt": data.get("timestamp"),
            }
            
            return aiohttp.web.json_response({
                "status": "registered",
                "playerId": data["playerId"]
            })
        except Exception as e:
            return aiohttp.web.json_response(
                {"error": str(e)}, 
                status=500
            )


class SendSpinPlayersListView(HomeAssistantView):
    """Get list of registered players."""

    url = "/api/sendspin_player/players"
    name = "api:sendspin_player:players"
    requires_auth = True

    def __init__(self, hass: HomeAssistant):
        """Initialize."""
        self.hass = hass

    async def get(self, request):
        """Get list of registered players."""
        players = list(
            self.hass.data.get("sendspin_registered_players", {}).values()
        )
        return aiohttp.web.json_response(players)


class SendSpinPlayerRemoveView(HomeAssistantView):
    """Unregister a player."""

    url = "/api/sendspin_player/players/{player_id}"
    name = "api:sendspin_player:player:remove"
    requires_auth = True

    def __init__(self, hass: HomeAssistant):
        """Initialize."""
        self.hass = hass

    async def delete(self, request):
        """Unregister a player."""
        player_id = request.match_info.get("player_id")
        
        if "sendspin_registered_players" in self.hass.data:
            self.hass.data["sendspin_registered_players"].pop(player_id, None)
        
        return aiohttp.web.json_response({"status": "unregistered"})


# Add to async_setup_entry in __init__.py:
# 
# async def async_setup_entry(hass: HomeAssistant, entry: ConfigEntry) -> bool:
#     """Set up SendSpin Player from a config entry."""
#     
#     # ... existing code ...
#     
#     # Register player management endpoints (optional)
#     hass.http.register_view(SendSpinPlayerRegistrationView(hass))
#     hass.http.register_view(SendSpinPlayersListView(hass))
#     hass.http.register_view(SendSpinPlayerRemoveView(hass))
#     
#     # Initialize player storage
#     hass.data.setdefault("sendspin_registered_players", {})
#     
#     return True
