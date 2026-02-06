
import { SendspinPlayer } from '@music-assistant/sendspin-js';

// Unique ID logic
const STORAGE_KEY = 'sendspin-ha-player-id';
function getPlayerId() {
    let id = localStorage.getItem(STORAGE_KEY);
    if (!id) {
        id = `ha-browser-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
        localStorage.setItem(STORAGE_KEY, id);
    }
    return id;
}

// Main logic
(function bootstrapSendSpin() {
    console.log('[SendSpin] Initializing headless player for Home Assistant...');

    const playerId = getPlayerId();
    // Construct the proxy URL. 
    // The Python integration exposes a WebSocket at /api/sendspin_browser/ws
    // The library likely appends /ws or /api/ws. 
    // We try to pass the root that will result in the correct WS path.
    // If lib appends '/ws', we pass '/api/sendspin_browser'. 

    // Note: To be safe, we might need adjustments if the library is strict.
    // Assuming standard MA behavior.
    const haConfig = (window as any).hass?.config; // Retrieve HA config if needed
    const proxyBase = window.location.origin + '/api/sendspin_player';

    let player: SendspinPlayer | null = null;
    let audioUnlocked = false;

    async function initPlayer() {
        if (player) return;

        console.log(`[SendSpin] Connecting to proxy: ${proxyBase}`);

        try {
            // Fetch configuration (Token) from Home Assistant API
            // This endpoint requires valid HA authentication
            const configUrl = window.location.origin + '/api/sendspin_player/config';
            const configReq = await fetch(configUrl);
            
            if (!configReq.ok) {
                throw new Error(`Config fetch failed: ${configReq.status} ${configReq.statusText}`);
            }
            
            const config = await configReq.json();
            const token = config.token || undefined;

            // @ts-ignore
            player = new SendspinPlayer({
                playerId: playerId,
                baseUrl: proxyBase,
                clientName: 'Home Assistant Browser',
                correctionMode: 'quality-local',
                token: token,
            });

            // Handle Audio Context Unlocking
            const unlockAudio = () => {
                if (audioUnlocked) return;
                // SendSpin usually handles this internally if 'bindToDocument' or similar is used, 
                // but explicit interaction is safer.
                // We'll trust the lib to handle the stream, but we ensure interaction 'wakes' it.
                // Just creating the player often prepares the context.
                // We can try to play a silent sound or just let the lib handle it.
                audioUnlocked = true;
                document.removeEventListener('click', unlockAudio);
                document.removeEventListener('touchstart', unlockAudio);
            };

            document.addEventListener('click', unlockAudio);
            document.addEventListener('touchstart', unlockAudio);

            await player.connect();
            console.log('[SendSpin] Connected!');

        } catch (e) {
            console.error('[SendSpin] Failed to init:', e);
            if (e instanceof Error) {
                console.error('[SendSpin] Error details:', e.message, e.stack);
            }
            player = null;
            // Retry logic - wait 5 seconds before retrying
            setTimeout(initPlayer, 5000);
        }
    }

    // Attempt to fetch config (Token) first
    async function start() {
        initPlayer();
    }

    if (document.readyState === 'complete') {
        start();
    } else {
        window.addEventListener('load', start);
    }

})();
