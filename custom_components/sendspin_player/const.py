"""Constants for the SendSpin Player integration."""

DOMAIN = "sendspin_player"

# The URL of the Sendspin server (e.g. Music Assistant at http://192.168.1.x:8095)
CONF_SERVER_URL = "server_url"
# Music Assistant API token (required when MA has auth enabled)
CONF_MA_TOKEN = "ma_token"

WS_GET_CONFIG = f"{DOMAIN}/config"
