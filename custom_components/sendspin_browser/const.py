"""Constants for the Sendspin Browser integration."""

DOMAIN = "sendspin_browser"

CONF_SERVER_URL = "server_url"
CONF_PLAYER_NAME = "player_name"

DEFAULT_PLAYER_NAME = "Dashboard"
DEFAULT_SERVER_URL = ""

# URL path prefix for static assets (under /api/ so HA allows the request)
STATIC_URL_PREFIX = f"/api/{DOMAIN}"

# mDNS service type for Sendspin servers (client-initiated connection)
SENDSPIN_SERVER_TYPE = "_sendspin-server._tcp.local."
