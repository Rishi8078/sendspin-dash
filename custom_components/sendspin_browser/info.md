# Sendspin Browser Player

Turn the browser tab showing your Home Assistant dashboard into a **Sendspin player**. When you open the **Sendspin Player** panel, that tab can connect to a Sendspin server (e.g. [Music Assistant](https://www.music-assistant.io)) and play synchronized audio like any other Sendspin client.

## How it works

- **Integration**: Configure a default Sendspin server URL and player name (optional) in **Settings → Devices & Services → Sendspin Browser Player**.
- **Panel**: A **Sendspin Player** entry appears in the sidebar. Opening it loads the player UI in the current browser tab.
- **Player**: Enter or confirm the server URL and player name, then click **Connect**. The tab becomes a Sendspin player (now playing, timeline, transport controls, volume). The same player ID is kept across refreshes so the server does not create duplicate players.

## Requirements

- A Sendspin server (e.g. Music Assistant with Sendspin provider).
- The dashboard opened in a browser (desktop or mobile). The tab that shows the panel is the one that acts as the player.

## Configuration

1. Add the integration via **Settings → Devices & Services → Add Integration** and search for **Sendspin Browser Player**.
2. (Optional) Set **Default Sendspin server URL** (e.g. `http://homeassistant.local:8095` for Music Assistant).
3. (Optional) Set **Default player name** (e.g. `Living Room Dashboard`). This can be changed later in the panel or in the integration options.

You can change these defaults anytime from the integration’s **Configure** option.

## Inspiration

This integration is inspired by [Browser Mod](https://github.com/thomasloven/hass-browser_mod): it registers a custom panel and uses the browser as a first-class target. Here, the browser is used as a Sendspin audio player instead of for sensors or media controls.

## Links

- [Sendspin protocol](https://www.sendspin-audio.com)
- [sendspin-cli / browser player](https://github.com/Sendspin-Protocol/sendspin-cli)
