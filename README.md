# Sendspin Dash

A Home Assistant integration that turns any browser tab into a **Sendspin player** for synchronized multi-room audio.

## Features

- Auto-register browser as a Sendspin player — works in the background on any HA tab
- Now-playing metadata (title, artist, album, artwork) displayed in the panel
- Playback controls (play, pause, next, previous, stop) via the Sendspin protocol
- Uses the official [sendspin-js](https://github.com/Sendspin/sendspin-js) SDK, bundled locally
- mDNS server discovery API for finding Sendspin servers on the network

## Installation

### HACS
1. Install [HACS](https://hacs.xyz/) if not already installed
2. Go to HACS > Integrations
3. Click **+ Explore & Download Repositories**
4. Search for "Sendspin Dash"
5. Click **Download** and then **Restart Home Assistant**

### Manual
1. Copy the `custom_components/sendspin_browser` folder to your Home Assistant `custom_components` directory
2. Restart Home Assistant

## Configuration

1. Go to **Settings > Devices & Services > Add Integration**
2. Select **Sendspin Dash**
3. Enter your Sendspin server URL (e.g. `http://homeassistant.local:8927`)

## How It Works

1. A background **connector** script loads on every HA page (like browser_mod)
2. It connects to the Sendspin server using the sendspin-js SDK over WebSocket
3. The browser appears as a player in Music Assistant (or any Sendspin server)
4. The **Sendspin Dash** panel in the sidebar shows connection status, now-playing info, and playback controls
5. Registration persists across page navigation — no need to keep the panel open

## Requirements

- A Sendspin server (e.g. [Music Assistant](https://www.music-assistant.io/) with the Sendspin provider)
- A browser with Web Audio API support (Chrome, Edge, Firefox, Safari)

## License

MIT
