"""Config flow for Sendspin Browser."""

from __future__ import annotations

import voluptuous as vol

from homeassistant import config_entries
from homeassistant.core import HomeAssistant, callback
from homeassistant.data_entry_flow import FlowResult

from .const import CONF_PLAYER_NAME, CONF_SERVER_URL, DEFAULT_PLAYER_NAME, DOMAIN


def _schema(user_input: dict | None) -> vol.Schema:
    return vol.Schema(
        {
            vol.Optional(
                CONF_SERVER_URL,
                default=(user_input or {}).get(CONF_SERVER_URL, ""),
            ): str,
            vol.Optional(
                CONF_PLAYER_NAME,
                default=(user_input or {}).get(CONF_PLAYER_NAME, DEFAULT_PLAYER_NAME),
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
                    CONF_PLAYER_NAME: (
                        user_input.get(CONF_PLAYER_NAME) or DEFAULT_PLAYER_NAME
                    ).strip(),
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
                    CONF_PLAYER_NAME: (
                        user_input.get(CONF_PLAYER_NAME) or DEFAULT_PLAYER_NAME
                    ).strip(),
                },
            )

        options = self._config_entry.options or self._config_entry.data or {}
        return self.async_show_form(
            step_id="init",
            data_schema=_schema(
                {
                    CONF_SERVER_URL: options.get(CONF_SERVER_URL, ""),
                    CONF_PLAYER_NAME: options.get(CONF_PLAYER_NAME, DEFAULT_PLAYER_NAME),
                }
            ),
        )
