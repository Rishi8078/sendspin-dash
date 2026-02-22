"""Config flow for Sendspin Dash."""

from __future__ import annotations

import voluptuous as vol

from homeassistant import config_entries
from homeassistant.core import callback
from homeassistant.data_entry_flow import FlowResult

from .const import CONF_SERVER_URL, DOMAIN


def _schema(defaults: dict | None = None) -> vol.Schema:
    d = defaults or {}
    return vol.Schema(
        {
            vol.Required(
                CONF_SERVER_URL,
                default=d.get(CONF_SERVER_URL, ""),
            ): str,
        }
    )


class SendspinBrowserConfigFlow(config_entries.ConfigFlow, domain=DOMAIN):
    """Handle a config flow for Sendspin Dash."""

    VERSION = 1

    async def async_step_user(
        self,
        user_input: dict | None = None,
    ) -> FlowResult:
        if user_input is not None:
            return self.async_create_entry(
                title="Sendspin Dash",
                data={CONF_SERVER_URL: (user_input.get(CONF_SERVER_URL) or "").strip()},
            )

        return self.async_show_form(
            step_id="user",
            data_schema=_schema(user_input),
        )

    @staticmethod
    @callback
    def async_get_options_flow(
        config_entry: config_entries.ConfigEntry,
    ) -> config_entries.OptionsFlow:
        return SendspinBrowserOptionsFlow(config_entry)


class SendspinBrowserOptionsFlow(config_entries.OptionsFlow):
    """Handle options for Sendspin Dash."""

    def __init__(self, config_entry: config_entries.ConfigEntry) -> None:
        self._config_entry = config_entry

    async def async_step_init(
        self,
        user_input: dict | None = None,
    ) -> FlowResult:
        if user_input is not None:
            return self.async_create_entry(
                title="",
                data={CONF_SERVER_URL: (user_input.get(CONF_SERVER_URL) or "").strip()},
            )

        merged = {**(self._config_entry.data or {}), **(self._config_entry.options or {})}
        return self.async_show_form(
            step_id="init",
            data_schema=_schema({CONF_SERVER_URL: merged.get(CONF_SERVER_URL, "")}),
        )
