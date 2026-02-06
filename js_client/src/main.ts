
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
    const proxyBase = window.location.origin + '/api/sendspin_player';

    let player: SendspinPlayer | null = null;
    let audioUnlocked = false;

    async function initPlayer() {
        if (player) return;

        console.log(`[SendSpin] Connecting to proxy: ${proxyBase}`);

        try {
            // Fetch configuration (Token) from Home Assistant API
            const configUrl = window.location.origin + '/api/sendspin_player/config';
            const configReq = await fetch(configUrl);
            
            if (!configReq.ok) {
                throw new Error(`Config fetch failed: ${configReq.status} ${configReq.statusText}`);
            }
            
            const config = await configReq.json();
            const token = config.token || undefined;

            console.log('[SendSpin] Creating player with token:', !!token);

            // @ts-ignore
            player = new SendspinPlayer({
                playerId: playerId,
                baseUrl: proxyBase,
                clientName: 'Home Assistant Browser',
                correctionMode: 'quality-local',
                token: token,
                // Critical: Handle state changes from the player
                onStateChange: (state: any) => {
                    console.log('[SendSpin] State changed:', {
                        isPlaying: state.isPlaying,
                        hasMetadata: !!state.serverState?.metadata,
                        connected: state.isConnected,
                    });
                    
                    if (state.serverState?.metadata) {
                        console.log('[SendSpin] Now playing:', {
                            title: state.serverState.metadata.title,
                            artist: state.serverState.metadata.artist,
                        });
                    }
                },
                // Handle connection state
                onConnected: () => {
                    console.log('[SendSpin] Connected to Music Assistant');
                },
                onDisconnected: (reason?: string) => {
                    console.log('[SendSpin] Disconnected:', reason);
                },
            });

            // Handle Audio Context Unlocking (required for audio playback)
            const unlockAudio = () => {
                if (audioUnlocked) return;
                audioUnlocked = true;
                console.log('[SendSpin] Audio context unlocked');
                document.removeEventListener('click', unlockAudio);
                document.removeEventListener('touchstart', unlockAudio);
            };

            document.addEventListener('click', unlockAudio);
            document.addEventListener('touchstart', unlockAudio);

            console.log('[SendSpin] Attempting to connect...');
            await player.connect();
            console.log('[SendSpin] Connected successfully!');

        } catch (e) {
            console.error('[SendSpin] Failed to init:', e);
            if (e instanceof Error) {
                console.error('[SendSpin] Error details:', e.message, e.stack);
            }
            player = null;
            // Retry logic - wait 5 seconds before retrying
            console.log('[SendSpin] Retrying in 5 seconds...');
            setTimeout(initPlayer, 5000);
        }
    }

    async function start() {
        await initPlayer();
    }

    if (document.readyState === 'complete') {
        start();
    } else {
        window.addEventListener('load', start);
    }

})();
