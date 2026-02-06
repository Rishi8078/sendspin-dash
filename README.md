# SendSpin Player for Home Assistant

A Home Assistant integration that turns any device with a web browser into a SendSpin player for Music Assistant. When a user opens the Home Assistant dashboard on a device, it automatically registers that device as a playback target.

## Features

- 🎵 Auto-register browser as a SendSpin player
- 🔌 Seamless integration with Music Assistant
- 🔐 Secure WebSocket proxy through Home Assistant
- 🌐 Works on any device with a web browser

## Installation

### HACS
1. Install [HACS](https://hacs.xyz/) if not already installed
2. Go to HACS > Integrations
3. Click **+ Explore & Download Repositories**
4. Search for "SendSpin Player"
5. Click **Download** and then **Restart Home Assistant**

### Manual
1. Copy the `custom_components/sendspin_player` folder to your Home Assistant `custom_components` directory
2. Restart Home Assistant

## Configuration

1. Go to Settings > Devices & Services > Create Automation
2. Select "SendSpin Player"
3. Enter your Music Assistant URL (e.g., `http://192.168.1.100:8060`)
4. Enter Music Assistant token (optional, if your instance requires authentication)

## How It Works

1. The integration injects a bootstrap script into your Home Assistant dashboard
2. When you open HA on any device, the script automatically initializes a SendSpin player
3. The browser communicates with Music Assistant through a secure WebSocket proxy
4. Your device appears as an available player in Music Assistant

## Troubleshooting

### Player not appearing in Music Assistant
- Check Home Assistant logs: Settings > System > Logs
- Open browser console (F12) and look for `[SendSpin]` messages
- Verify Music Assistant URL is correct and accessible

### Connection errors
- Ensure Music Assistant is running and the `/ws` endpoint is accessible
- Check firewall rules between Home Assistant and Music Assistant
- Verify the authentication token if MA requires it

## Support

For issues and feature requests, visit: https://github.com/Rishi8078/Sendspin-player/issues

## License

MIT
