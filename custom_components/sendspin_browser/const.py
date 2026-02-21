"""Constants for the Sendspin Dash integration."""

DOMAIN = "sendspin_browser"

CONF_MA_URL = "ma_url"
CONF_PLAYER_NAME = "player_name"
CONF_MA_TOKEN = "ma_token"

DEFAULT_PLAYER_NAME = "Dashboard"
DEFAULT_MA_URL = ""

# URL path prefix for static assets (under /api/ so HA allows the request)
STATIC_URL_PREFIX = f"/api/{DOMAIN}"

# mDNS service type for Sendspin servers (client-initiated connection)
SENDSPIN_SERVER_TYPE = "_sendspin-server._tcp.local."
