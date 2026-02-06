
import { SendspinPlayer } from '@music-assistant/sendspin-js';

// Unique ID logic (matches Dockslab)
const STORAGE_KEY = 'sendspin-ha-player-id';
function getPlayerId() {
    let id = localStorage.getItem(STORAGE_KEY);
    if (!id) {
        id = `ha-browser-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}`;
        localStorage.setItem(STORAGE_KEY, id);
    }
    return id;
}

// Main logic (IIFE for isolation)
(function bootstrapSendSpin() {
    console.log('[SendSpin] Initializing headless player for Home Assistant...');

    const playerId = getPlayerId();
    let player: SendspinPlayer | null = null;
    let audioUnlocked = false;

    async function initPlayer() {
        if (player) return;

        try {
            // Fetch configuration from Home Assistant integration
            const configUrl = window.location.origin + '/api/sendspin_player/config';
            console.log('[SendSpin] Fetching config from:', configUrl);
            
            const configReq = await fetch(configUrl);
            
            if (!configReq.ok) {
                throw new Error(`Config fetch failed: ${configReq.status} ${configReq.statusText}`);
            }
            
            const config = await configReq.json();
            const maUrl = config.ma_url?.trim();
            const token = config.token?.trim();

            if (!maUrl) {
                throw new Error('Music Assistant URL not configured in Home Assistant');
            }

            console.log('[SendSpin] Got config - MA URL:', maUrl, 'has token:', !!token);
            console.log('[SendSpin] Connecting directly to Music Assistant...');

            // Connect directly to Music Assistant (like Dockslab does)
            const playerConfig: any = {
                playerId: playerId,
                baseUrl: maUrl,  // ← Direct connection to MA, not proxy
                clientName: 'Home Assistant Browser',
                correctionMode: 'quality-local',
                token: token || undefined,
                // Handle state changes from Music Assistant
                onStateChange: (state: any) => {
                    console.log('[SendSpin] State changed:', {
                        isPlaying: state.isPlaying,
                        hasMetadata: !!state.serverState?.metadata,
                    });
                    
                    if (state.serverState?.metadata) {
                        const meta = state.serverState.metadata;
                        console.log('[SendSpin] Now playing:', {
                            title: meta.title,
                            artist: meta.artist,
                        });
                    }
                },
            };

            player = new SendspinPlayer(playerConfig);

            // Audio context unlocking (required for Web Audio)
            const unlockAudio = () => {
                if (audioUnlocked) return;
                audioUnlocked = true;
                console.log('[SendSpin] Audio context unlocked');
                document.removeEventListener('click', unlockAudio);
                document.removeEventListener('touchstart', unlockAudio);
            };

            document.addEventListener('click', unlockAudio);
            document.addEventListener('touchstart', unlockAudio);

            console.log('[SendSpin] Connecting...');
            await player.connect();
            console.log('[SendSpin] Connected successfully!');

        } catch (e) {
            console.error('[SendSpin] Failed to initialize:', e);
            if (e instanceof Error) {
                console.error('[SendSpin] Details:', e.message);
            }
            player = null;
            // Retry after 5 seconds
            console.log('[SendSpin] Retrying in 5 seconds...');
            setTimeout(initPlayer, 5000);
        }
    }

    // Start initialization
    async function start() {
        await initPlayer();
    }

    if (document.readyState === 'complete') {
        start();
    } else {
        window.addEventListener('load', start);
    }

})();
