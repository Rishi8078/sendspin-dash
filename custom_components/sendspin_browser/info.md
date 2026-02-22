# Sendspin Dash

Turn any browser tab showing Home Assistant into a **Sendspin player** for synchronized multi-room audio.

## How it works

- **Integration**: Set the **Sendspin server URL** in **Settings → Devices & Services → Sendspin Dash** (e.g. `http://homeassistant.local:8927`).
- **Auto-register**: When any HA tab is open, a background connector keeps this browser registered as a Sendspin player — no need to keep the panel open.
- **Panel**: The **Sendspin Dash** panel shows connection status, now-playing metadata, and playback controls (play/pause/next/previous/stop).
- **SDK**: Uses the official [sendspin-js](https://github.com/Sendspin/sendspin-js) SDK bundled locally — no CDN dependency.

## Requirements

- A Sendspin server (e.g. [Music Assistant](https://www.music-assistant.io/) with the Sendspin provider, or `sendspin serve`).
- A browser with Web Audio API support (Chrome, Edge, Firefox, Safari).

## Links

- [Sendspin protocol](https://www.sendspin-audio.com)
- [sendspin-js SDK](https://github.com/Sendspin/sendspin-js)
- [sendspin-cli](https://github.com/Sendspin/sendspin-cli)
