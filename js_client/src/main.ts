import { SendspinPlayer } from '@music-assistant/sendspin-js';

// ============================================================================
// TYPES
// ============================================================================

export type ConnectionState = 'idle' | 'connecting' | 'connected' | 'error';

export interface NowPlaying {
    title: string;
    artist: string;
    artwork?: string;
    durationMs: number;
    progressMs: number;
}

export interface PlayerState {
    isConnected: boolean;
    isPlaying: boolean;
    nowPlaying: NowPlaying | null;
    playerId: string | null;
    connectionState: ConnectionState;
    connectionError: string | null;
    baseUrl: string | null;
}

// ============================================================================
// PLAYER MANAGER
// ============================================================================

class PlayerManager {
    private player: SendspinPlayer | null = null;
    private state: PlayerState;
    private listeners: Set<(state: PlayerState) => void> = new Set();
    private storageKey = 'sendspin-ha-player-id';
    private reconnectAttempts = 0;
    private maxReconnectAttempts = 10;
    private reconnectDelay = 5000;

    constructor() {
        this.state = {
            isConnected: false,
            isPlaying: false,
            nowPlaying: null,
            playerId: this.getStablePlayerId(),
            connectionState: 'idle',
            connectionError: null,
            baseUrl: null,
        };
    }

    private getStablePlayerId(): string {
        let id = localStorage.getItem(this.storageKey);
        if (!id) {
            id = `ha-browser-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}`;
            localStorage.setItem(this.storageKey, id);
        }
        return id;
    }

    subscribe(listener: (state: PlayerState) => void): () => void {
        this.listeners.add(listener);
        return () => this.listeners.delete(listener);
    }

    getState(): PlayerState {
        return { ...this.state };
    }

    private setState(updates: Partial<PlayerState>) {
        this.state = { ...this.state, ...updates };
        const copy = { ...this.state };
        this.listeners.forEach(fn => {
            try { fn(copy); } catch (e) { console.error('[SendSpin] listener error:', e); }
        });
    }

    private disconnect() {
        if (this.player) {
            try { this.player.disconnect('shutdown'); } catch (_) { /* ignore */ }
            this.player = null;
        }
        this.setState({
            isConnected: false,
            isPlaying: false,
            nowPlaying: null,
            connectionState: 'idle',
            connectionError: null,
            baseUrl: null,
        });
    }

    async connect(baseUrl: string, token?: string): Promise<void> {
        const url = baseUrl.replace(/\/+$/, '').trim();
        if (!url || !/^https?:\/\//i.test(url)) {
            this.setState({ connectionState: 'error', connectionError: 'Invalid URL' });
            return;
        }

        this.disconnect();
        this.reconnectAttempts = 0;
        this.setState({ connectionState: 'connecting', connectionError: null, baseUrl: url });

        try {
            const playerId = this.state.playerId!;
            this.player = new SendspinPlayer({
                playerId,
                baseUrl: url,
                clientName: 'Home Assistant Browser',
                correctionMode: 'quality-local',
                token: token || undefined,
                onStateChange: (s: any) => this.handleStateChange(s),
            } as any);

            this.unlockAudio();
            console.log('[SendSpin] Connecting to:', url);

            // 12s timeout
            const timeout = new Promise<never>((_, reject) =>
                setTimeout(() => reject(new Error('Connection timeout')), 12000)
            );
            await Promise.race([this.player.connect(), timeout]);

            console.log('[SendSpin] Connected');
            this.reconnectAttempts = 0;
        } catch (error: any) {
            console.error('[SendSpin] Connection failed:', error?.message);
            this.setState({
                connectionState: 'error',
                connectionError: error?.message || 'Connection failed',
                isConnected: false,
            });
            this.scheduleReconnect(baseUrl, token);
        }
    }

    private handleStateChange(newState: any) {
        if (!newState) return;
        const isConnected = newState.connected ?? this.state.isConnected;
        const isPlaying = newState.playing ?? this.state.isPlaying;
        let nowPlaying = this.state.nowPlaying;

        if (newState.currentMedia) {
            nowPlaying = {
                title: newState.currentMedia.title || 'Unknown',
                artist: newState.currentMedia.artist || 'Unknown',
                artwork: newState.currentMedia.artwork,
                durationMs: newState.currentMedia.duration || 0,
                progressMs: newState.currentMedia.progress || 0,
            };
        }

        this.setState({
            isConnected,
            isPlaying,
            nowPlaying,
            connectionState: isConnected ? 'connected' : this.state.connectionState,
            connectionError: isConnected ? null : this.state.connectionError,
        });
    }

    private scheduleReconnect(baseUrl: string, token?: string) {
        if (this.reconnectAttempts >= this.maxReconnectAttempts) {
            console.warn('[SendSpin] Max reconnect attempts reached');
            return;
        }
        const delay = this.reconnectDelay * Math.pow(1.5, this.reconnectAttempts);
        this.reconnectAttempts++;
        console.log(`[SendSpin] Reconnecting in ${(delay / 1000).toFixed(1)}s (attempt ${this.reconnectAttempts})`);
        setTimeout(() => this.connect(baseUrl, token), delay);
    }

    private unlockAudio() {
        const unlock = () => {
            const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
            ctx.resume().then(() => ctx.close());
            document.removeEventListener('click', unlock);
            document.removeEventListener('touchstart', unlock);
        };
        document.addEventListener('click', unlock, { once: true });
        document.addEventListener('touchstart', unlock, { once: true });
    }

    play() {
        if (!this.player) return;
        try { (this.player.sendCommand as any)('play'); } catch (e) { console.error('[SendSpin] play error:', e); }
    }
    pause() {
        if (!this.player) return;
        try { (this.player.sendCommand as any)('pause'); } catch (e) { console.error('[SendSpin] pause error:', e); }
    }
    next() {
        if (!this.player) return;
        try { (this.player.sendCommand as any)('next'); } catch (e) { console.error('[SendSpin] next error:', e); }
    }
    previous() {
        if (!this.player) return;
        try { (this.player.sendCommand as any)('previous'); } catch (e) { console.error('[SendSpin] previous error:', e); }
    }
}

// ============================================================================
// BOOTSTRAP — uses HA WebSocket (already authenticated, like browser_mod)
// ============================================================================

declare global {
    interface Window {
        sendspinPlayer?: {
            getState: () => PlayerState;
            subscribe: (listener: (state: PlayerState) => void) => () => void;
            connect: (baseUrl: string, token?: string) => Promise<void>;
            play: () => void;
            pause: () => void;
            next: () => void;
            previous: () => void;
        };
    }
}

(function bootstrap() {
    console.log('[SendSpin] Bootstrap starting...');

    const mgr = new PlayerManager();

    window.sendspinPlayer = {
        getState: () => mgr.getState(),
        subscribe: (fn) => mgr.subscribe(fn),
        connect: (url, token) => mgr.connect(url, token),
        play: () => mgr.play(),
        pause: () => mgr.pause(),
        next: () => mgr.next(),
        previous: () => mgr.previous(),
    };

    /**
     * Get the hass connection from the HA frontend DOM.
     * This is the same already-authenticated WebSocket that browser_mod uses.
     */
    async function getHassConnection(maxWaitMs = 20000): Promise<any> {
        const start = Date.now();
        while (Date.now() - start < maxWaitMs) {
            const ha = document.querySelector('home-assistant') as any;
            const conn = ha?.hass?.connection;
            if (conn) {
                console.log('[SendSpin] Got HA WebSocket connection');
                return conn;
            }
            await new Promise(r => setTimeout(r, 500));
        }
        throw new Error('Could not get HA connection');
    }

    async function autoConnect() {
        try {
            // 1. Get the already-authenticated HA WebSocket connection
            const conn = await getHassConnection();

            // 2. Ask our integration for the MA config via WebSocket
            //    This is already authenticated — no Bearer token needed
            console.log('[SendSpin] Requesting config via WebSocket...');
            const config = await conn.sendMessagePromise({
                type: 'sendspin_player/config',
            });

            console.log('[SendSpin] Got config:', config);

            const maUrl = config?.ma_url?.trim();
            const token = config?.token?.trim();

            if (!maUrl) {
                console.warn('[SendSpin] Music Assistant URL not configured');
                return;
            }

            // 3. Connect to Music Assistant directly
            console.log('[SendSpin] Connecting to Music Assistant at:', maUrl);
            await mgr.connect(maUrl, token || undefined);
        } catch (e: any) {
            console.error('[SendSpin] Auto-connect failed:', e?.message || e);
        }
    }

    // Run when page is ready
    if (document.readyState === 'complete') {
        autoConnect();
    } else {
        window.addEventListener('load', autoConnect);
    }
})();
