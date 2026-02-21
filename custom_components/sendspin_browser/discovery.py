"""Discovery API for Sendspin servers via mDNS."""

from __future__ import annotations

import asyncio
import logging
from typing import Any

from homeassistant.components import zeroconf
from homeassistant.core import HomeAssistant
from homeassistant.helpers.http import HomeAssistantView
from zeroconf import IPVersion, ServiceStateChange
from zeroconf.asyncio import AsyncServiceBrowser, AsyncServiceInfo

from .const import (
    CONF_SERVER_URL,
    CONF_MA_URL,
    CONF_MA_TOKEN,
    DEFAULT_SERVER_URL,
    DOMAIN,
    SENDSPIN_SERVER_TYPE,
    STATIC_URL_PREFIX,
)

_LOGGER = logging.getLogger(__name__)

DISCOVERY_TIMEOUT = 3.0
BROWSE_WAIT = 2.0


def _service_info_to_server_entry(service: AsyncServiceInfo) -> dict[str, Any] | None:
    """Build a { name, url } dict from resolved service info."""
    addresses = service.ip_addresses_by_version(IPVersion.All)
    if not addresses:
        return None
    # Prefer first non-link-local if available
    host = None
    for addr in addresses:
        if not addr.is_link_local and not addr.is_unspecified:
            host = str(addr)
            break
    if host is None:
        host = str(addresses[0])
    port = service.port or 8927
    url = f"http://{host}:{port}"
    name = (service.name or "").removesuffix(f".{service.type}").replace("._sendspin-server._tcp.local", "")
    if not name:
        name = url
    return {"name": name, "url": url}


class SendspinDiscoveryView(HomeAssistantView):
    """API view to discover Sendspin servers on the network via mDNS."""

    url = f"{STATIC_URL_PREFIX}/servers"
    name = f"api:{DOMAIN}:servers"
    requires_auth = True

    async def get(self, request):
        """Handle GET: browse for _sendspin-server._tcp and return JSON list of { name, url }."""
        hass: HomeAssistant = request.app["hass"]
        found: list[tuple[str, str]] = []

        def _on_service_state_change(
            zc, service_type: str, name: str, state_change: ServiceStateChange
        ) -> None:
            if state_change == ServiceStateChange.Added:
                found.append((service_type, name))

        try:
            aio_zc = await zeroconf.async_get_async_instance(hass)
            zc = aio_zc.zeroconf
        except Exception as e:
            _LOGGER.warning("Zeroconf not available for Sendspin discovery: %s", e)
            return self.json([])

        browser = AsyncServiceBrowser(
            zc,
            [SENDSPIN_SERVER_TYPE],
            handlers=[_on_service_state_change],
        )
        try:
            await asyncio.sleep(BROWSE_WAIT)
        finally:
            await browser.async_cancel()

        servers: list[dict[str, Any]] = []
        for service_type, service_name in found:
            try:
                info = AsyncServiceInfo(service_type, service_name)
                await info.async_request(zc, DISCOVERY_TIMEOUT)
                entry = _service_info_to_server_entry(info)
                if entry and not any(s["url"] == entry["url"] for s in servers):
                    servers.append(entry)
            except Exception as e:
                _LOGGER.debug("Resolve %s.%s failed: %s", service_name, service_type, e)

        return self.json(servers)


class SendspinConfigView(HomeAssistantView):
    """API view to get integration options (server_url) for connector and panel."""

    url = f"{STATIC_URL_PREFIX}/config"
    name = f"api:{DOMAIN}:config"
    requires_auth = True

    async def get(self, request):
        """Return JSON { server_url, entry_id } from the first config entry."""
        hass: HomeAssistant = request.app["hass"]
        entries = hass.config_entries.async_entries(DOMAIN)
        if not entries:
            return self.json({"server_url": DEFAULT_SERVER_URL, "entry_id": None})
        entry = entries[0]
        opts = entry.options or {}
        return self.json({
            "server_url": (opts.get(CONF_SERVER_URL) or "").strip() or DEFAULT_SERVER_URL,
            "ma_url": (opts.get(CONF_MA_URL) or "http://192.168.0.109:8095").strip(),
            "ma_token": (opts.get(CONF_MA_TOKEN) or "").strip(),
            "entry_id": entry.entry_id,
        })



