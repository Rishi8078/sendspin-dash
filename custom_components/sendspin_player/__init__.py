"""The SendSpin Player integration."""
import logging
from pathlib import Path

from homeassistant.config_entries import ConfigEntry
from homeassistant.core import HomeAssistant
from homeassistant.components.http import StaticPathConfig
from homeassistant.components.frontend import add_extra_js_url

from .const import DOMAIN, CONF_MA_URL
from .api import SendSpinProxyView, SendSpinConfigView

_LOGGER = logging.getLogger(__name__)

PLATFORMS: list[str] = []

async def async_setup_entry(hass: HomeAssistant, entry: ConfigEntry) -> bool:
    """Set up SendSpin Player from a config entry."""
    
    hass.data.setdefault(DOMAIN, {})
    
    ma_url = entry.data.get(CONF_MA_URL)
    
    # 1. Register WebSocket Proxy
    hass.http.register_view(SendSpinProxyView(hass, ma_url))
    hass.http.register_view(SendSpinConfigView(hass))
    
    # 2. Register Static Assets
    # We serve the 'frontend' folder at /sendspin_player_static
    component_dir = Path(__file__).parent
    frontend_dir = component_dir / "frontend"
    
    await hass.http.async_register_static_paths([
        StaticPathConfig(
            url_path="/sendspin_player_static",
            path=str(frontend_dir),
            cache_headers=False
        )
    ])
    
    # 3. Inject the script into Lovelace
    # This ensures the player starts on every dashboard
    add_extra_js_url(hass, "/sendspin_player_static/sendspin-bootstrap.js?v=1")
    
    hass.data[DOMAIN][entry.entry_id] = {
        "ma_url": ma_url
    }

    return True

async def async_unload_entry(hass: HomeAssistant, entry: ConfigEntry) -> bool:
    """Unload a config entry."""
    hass.data[DOMAIN].pop(entry.entry_id)
    return True
