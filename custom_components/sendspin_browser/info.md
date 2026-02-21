# Sendspin Browser Player

Turn the browser tab showing your Home Assistant dashboard into a **Sendspin player**. Like [Browser Mod](https://github.com/thomasloven/hass-browser_mod): configure the server in Integration settings; the custom panel is for managing this browser as a player.

## How it works

- **Integration**: Set the **Sendspin server URL** in **Settings → Devices & Services → Sendspin Browser Player** (e.g. Music Assistant on port 8927).
- **Auto-register**: When any Home Assistant tab is open (dashboard, panel, etc.), a connector script keeps this browser registered as a Sendspin player. No need to keep the panel open.
- **Panel**: The **Sendspin Player** panel shows this browser’s status, the configured server URL, and lets you find servers on the network or open the integration configuration.

## Requirements

- A Sendspin server (e.g. Music Assistant with Sendspin provider).
- The dashboard opened in a browser. The browser auto-registers with a stable ID (like Browser Mod’s Browser ID).

## Configuration

1. Add the integration via **Settings → Devices & Services → Add Integration** and search for **Sendspin Browser Player**.
2. Set **Sendspin server URL** (e.g. `http://homeassistant.local:8927` for Music Assistant).
3. Open any HA page (e.g. dashboard). This browser is now registered as a Sendspin player. Use the **Sendspin Player** panel to see status or change the server URL in configuration.

## Links

- [Sendspin protocol](https://www.sendspin-audio.com)
- [sendspin-cli / browser player](https://github.com/Sendspin-Protocol/sendspin-cli)
