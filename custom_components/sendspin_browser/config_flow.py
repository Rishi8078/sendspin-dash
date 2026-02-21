"""Config flow for Sendspin Browser."""

from __future__ import annotations

import voluptuous as vol

from homeassistant import config_entries
from homeassistant.core import HomeAssistant, callback
from homeassistant.data_entry_flow import FlowResult

from .const import CONF_SERVER_URL, CONF_MA_URL, CONF_MA_TOKEN, DOMAIN


def _schema(user_input: dict | None) -> vol.Schema:
    return vol.Schema(
        {
            vol.Required(
                CONF_SERVER_URL,
                default=(user_input or {}).get(CONF_SERVER_URL, ""),
            ): str,
            vol.Optional(
                CONF_MA_URL,
                default=(user_input or {}).get(CONF_MA_URL, "http://192.168.0.109:8095"),
            ): str,
            vol.Optional(
                CONF_MA_TOKEN,
                default=(user_input or {}).get(CONF_MA_TOKEN, ""),
            ): str,
        }
    )


class SendspinBrowserConfigFlow(config_entries.ConfigFlow, domain=DOMAIN):
    """Handle a config flow for Sendspin Browser."""

    VERSION = 1

    async def async_step_user(
        self,
        user_input: dict | None = None,
    ) -> FlowResult:
        """Handle the initial step."""
        if user_input is not None:
            return self.async_create_entry(
                title="Sendspin Browser Player",
                data={},
                options={
                    CONF_SERVER_URL: (user_input.get(CONF_SERVER_URL) or "").strip(),
                    CONF_MA_URL: (user_input.get(CONF_MA_URL) or "").strip(),
                    CONF_MA_TOKEN: (user_input.get(CONF_MA_TOKEN) or "").strip(),
                },
            )

        return self.async_show_form(
            step_id="user",
            data_schema=_schema(user_input),
            description_placeholders={},
        )

    @staticmethod
    @callback
    def async_get_options_flow(
        config_entry: config_entries.ConfigEntry,
    ) -> config_entries.OptionsFlow:
        """Get the options flow for this handler."""
        return SendspinBrowserOptionsFlow(config_entry)


class SendspinBrowserOptionsFlow(config_entries.OptionsFlow):
    """Handle options for Sendspin Browser."""

    def __init__(self, config_entry: config_entries.ConfigEntry) -> None:
        """Initialize options flow."""
        self._config_entry = config_entry

    async def async_step_init(
        self,
        user_input: dict | None = None,
    ) -> FlowResult:
        """Manage the options."""
        if user_input is not None:
            return self.async_create_entry(
                title="",
                data={
                    CONF_SERVER_URL: (user_input.get(CONF_SERVER_URL) or "").strip(),
                    CONF_MA_URL: (user_input.get(CONF_MA_URL) or "").strip(),
                    CONF_MA_TOKEN: (user_input.get(CONF_MA_TOKEN) or "").strip(),
                },
            )

        options = self._config_entry.options or self._config_entry.data or {}
        return self.async_show_form(
            step_id="init",
            data_schema=_schema(
                {
                    CONF_SERVER_URL: options.get(CONF_SERVER_URL, ""),
                    CONF_MA_URL: options.get(CONF_MA_URL, "http://192.168.0.109:8095"),
                    CONF_MA_TOKEN: options.get(CONF_MA_TOKEN, ""),
                }
            ),
        )
