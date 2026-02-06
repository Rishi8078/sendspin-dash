import { SendspinPlayer } from '@music-assistant/sendspin-js';

// ============================================================================
// TYPES & INTERFACES (Context-like pattern for vanilla JS)
// ============================================================================

export type ConnectionState = 'idle' | 'connecting' | 'connected' | 'error';

export interface NowPlaying {
    title: string;
    artist: string;
    artwork?: string;
    durationMs: number;
    progressMs: number;
    album?: string;
    albumArtist?: string;
    genre?: string;
    year?: number;
    trackNumber?: number;
    discNumber?: number;
    uri?: string;
    mediaType?: string;
    provider?: string;
    isrc?: string;
    musicbrainzId?: string;
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

export interface PlayerConfig {
    playerId?: string;
    baseUrl: string;
    token?: string;
}

// ============================================================================
// PLAYER MANAGER (Like React Context but for vanilla JS)
// ============================================================================

/**
 * PlayerManager - Central state and control management for SendSpin
 * 
 * Inspired by DockSlab's MusicAssistantContext pattern, but implemented
 * for vanilla JavaScript so it can work in Home Assistant environments
 * without requiring React.
 * 
 * Features:
 * - Stable player ID persistence across reloads
 * - Direct WebSocket connection to Music Assistant
 * - State management with subscriber pattern
 * - Automatic reconnection with exponential backoff
 * - Error handling and timeout protection
 */
class PlayerManager {
    private player: SendspinPlayer | null = null;
    private state: PlayerState;
    private listeners: Set<(state: PlayerState) => void> = new Set();
    private storageKey = 'sendspin-ha-player-id';
    private baseUrlRef: string | null = null;
    private tokenRef: string | null = null;
    private audioUnlocked = false;
    private connectTimeoutId: ReturnType<typeof setTimeout> | null = null;
    private reconnectAttempts = 0;
    private maxReconnectAttempts = 10;
    private reconnectDelay = 5000; // 5 seconds, increases exponentially

    constructor(initialPlayerId?: string) {
        this.state = {
            isConnected: false,
            isPlaying: false,
            nowPlaying: null,
            playerId: initialPlayerId || this.getStablePlayerId(),
            connectionState: 'idle',
            connectionError: null,
            baseUrl: null,
        };
    }

    /**
     * Get or create a stable player ID that persists across page reloads
     * (matches DockSlab pattern for consistency)
     */
    private getStablePlayerId(): string {
        let id = localStorage.getItem(this.storageKey);
        if (!id) {
            id = `ha-browser-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}`;
            localStorage.setItem(this.storageKey, id);
        }
        return id;
    }

    /**
     * Subscribe to state changes (like React Context consumers)
     * Returns an unsubscribe function
     */
    subscribe(listener: (state: PlayerState) => void): () => void {
        this.listeners.add(listener);
        return () => this.listeners.delete(listener);
    }

    /**
     * Get current state snapshot
     */
    getState(): PlayerState {
        return { ...this.state };
    }

    /**
     * Notify all listeners of state change
     * (like React Context providers)
     */
    private notifyListeners() {
        const stateCopy = { ...this.state };
        this.listeners.forEach(listener => {
            try {
                listener(stateCopy);
            } catch (e) {
                console.error('[SendSpin] Error in state listener:', e);
            }
        });
    }

    /**
     * Update state (internal helper)
     */
    private setState(updates: Partial<PlayerState>) {
        this.state = { ...this.state, ...updates };
        this.notifyListeners();
    }

    /**
     * Disconnect from Music Assistant
     */
    private disconnect() {
        if (this.connectTimeoutId) {
            clearTimeout(this.connectTimeoutId);
            this.connectTimeoutId = null;
        }

        if (this.player) {
            try {
                this.player.disconnect('shutdown');
            } catch (e) {
                console.error('[SendSpin] Error disconnecting:', e);
            }
            this.player = null;
        }

        this.baseUrlRef = null;
        this.tokenRef = null;

        this.setState({
            isConnected: false,
            isPlaying: false,
            nowPlaying: null,
            connectionState: 'idle',
            connectionError: null,
            baseUrl: null,
        });
    }

    /**
     * Connect to Music Assistant
     * (matches DockSlab pattern with direct browser→MA connection)
     */
    async connect(baseUrl: string, token?: string): Promise<void> {
        const url = baseUrl.replace(/\/+$/, '').trim();
        const tokenValue = token?.trim() || null;

        // Validate URL
        if (!url || !/^https?:\/\//i.test(url)) {
            this.setState({
                connectionState: 'error',
                connectionError: 'Invalid URL. Must start with http:// or https://',
            });
            return;
        }

        // Skip if already connected to same URL/token
        if (
            this.baseUrlRef === url &&
            this.tokenRef === tokenValue &&
            this.player?.isConnected
        ) {
            console.log('[SendSpin] Already connected to same URL/token');
            return;
        }

        // Disconnect existing connection
        this.disconnect();
        this.reconnectAttempts = 0;

        // Set connecting state
        this.setState({
            connectionState: 'connecting',
            connectionError: null,
            baseUrl: url,
        });

        this.baseUrlRef = url;
        this.tokenRef = tokenValue;

        try {
            const playerId = this.state.playerId!;

            // Create SendSpin player config
            // Matches DockSlab's SendspinPlayer initialization
            const playerConfig: any = {
                playerId,
                baseUrl: url,
                clientName: 'Home Assistant Browser',
                correctionMode: 'quality-local',
                token: tokenValue || undefined,
                onStateChange: (state: any) => this.handleStateChange(state),
            };

            this.player = new SendspinPlayer(playerConfig);

            // Unlock audio on first interaction (required for Web Audio)
            this.unlockAudio();

            console.log('[SendSpin] Connecting to:', url);

            // Set connection timeout (12 seconds, like DockSlab)
            const CONNECT_TIMEOUT_MS = 12000;
            this.connectTimeoutId = window.setTimeout(() => {
                if (this.player && !this.player.isConnected) {
                    this.handleConnectionTimeout();
                }
            }, CONNECT_TIMEOUT_MS);

            // Attempt connection
            await this.player.connect();
            console.log('[SendSpin] Connected successfully to:', url);
            this.reconnectAttempts = 0; // Reset on successful connection
        } catch (error) {
            this.handleConnectionError(error);
        }
    }

    /**
     * Handle state changes from Music Assistant
     * (matches DockSlab's onStateChange handler)
     */
    private handleStateChange(state: any) {
        if (!this.player || !state) return;

        const meta = state.serverState?.metadata;
        const prog = meta?.progress;

        // Resolve artwork URL (handle relative paths)
        let artwork = meta?.artwork_url ?? '';
        if (artwork && !artwork.startsWith('http') && this.baseUrlRef) {
            const base = this.baseUrlRef.replace(/\/+$/, '');
            artwork = artwork.startsWith('/') ? `${base}${artwork}` : `${base}/${artwork}`;
        }

        // Create now playing object
        const nowPlaying: NowPlaying | null = meta
            ? {
                title: meta.title ?? '',
                artist: meta.artist ?? '',
                artwork,
                durationMs: prog?.track_duration ?? 0,
                progressMs: prog?.track_progress ?? 0,
                album: meta.album,
                albumArtist: meta.album_artist,
                genre: meta.genre,
                year: meta.year,
                trackNumber: meta.track_number,
                discNumber: meta.disc_number,
                uri: meta.uri,
                mediaType: meta.media_type,
                provider: meta.provider,
                isrc: meta.isrc,
                musicbrainzId: meta.musicbrainz_id,
            }
            : null;

        // Update state
        this.setState({
            isConnected: true,
            isPlaying: state.isPlaying,
            nowPlaying,
            connectionState: 'connected',
            connectionError: null,
        });

        console.log('[SendSpin] Now playing:', {
            title: nowPlaying?.title,
            artist: nowPlaying?.artist,
            isPlaying: state.isPlaying,
        });
    }

    /**
     * Handle connection timeout
     */
    private handleConnectionTimeout() {
        console.error('[SendSpin] Connection timeout');
        this.setState({
            connectionState: 'error',
            connectionError:
                'Connection timed out. Ensure Music Assistant is running and reachable.',
            isConnected: false,
        });
        this.player = null;
        this.scheduleReconnect();
    }

    /**
     * Handle connection error
     */
    private handleConnectionError(error: any) {
        if (this.connectTimeoutId) {
            clearTimeout(this.connectTimeoutId);
            this.connectTimeoutId = null;
        }

        let message = error?.message ?? (typeof error === 'string' ? error : '');
        if (!message || message === '[object Event]') {
            message = 'WebSocket connection failed. Check Music Assistant URL and token.';
        }

        console.error('[SendSpin] Connection error:', message);

        this.setState({
            connectionState: 'error',
            connectionError: message,
            isConnected: false,
        });

        this.player = null;
        this.scheduleReconnect();
    }

    /**
     * Schedule automatic reconnection with exponential backoff
     */
    private scheduleReconnect() {
        this.reconnectAttempts++;
        if (this.reconnectAttempts > this.maxReconnectAttempts) {
            console.error('[SendSpin] Max reconnection attempts reached');
            return;
        }

        const delay = this.reconnectDelay * Math.pow(1.5, this.reconnectAttempts - 1);
        console.log(`[SendSpin] Reconnecting in ${Math.round(delay / 1000)}s (attempt ${this.reconnectAttempts}/${this.maxReconnectAttempts})`);

        setTimeout(() => {
            if (this.baseUrlRef) {
                this.connect(this.baseUrlRef, this.tokenRef || undefined);
            }
        }, delay);
    }

    /**
     * Unlock audio context (required for Web Audio API to work)
     */
    private unlockAudio() {
        if (this.audioUnlocked) return;

        const unlockHandler = () => {
            this.audioUnlocked = true;
            console.log('[SendSpin] Audio context unlocked');
            document.removeEventListener('click', unlockHandler);
            document.removeEventListener('touchstart', unlockHandler);
        };

        document.addEventListener('click', unlockHandler);
        document.addEventListener('touchstart', unlockHandler);
    }

    /**
     * Play current track
     */
    play() {
        if (!this.player) {
            console.warn('[SendSpin] Player not connected');
            return;
        }
        try {
            (this.player.sendCommand as any)('play');
            console.log('[SendSpin] Play');
        } catch (e) {
            console.error('[SendSpin] Play error:', e);
        }
    }

    /**
     * Pause current track
     */
    pause() {
        if (!this.player) {
            console.warn('[SendSpin] Player not connected');
            return;
        }
        try {
            (this.player.sendCommand as any)('pause');
            console.log('[SendSpin] Pause');
        } catch (e) {
            console.error('[SendSpin] Pause error:', e);
        }
    }

    /**
     * Skip to next track
     */
    next() {
        if (!this.player) {
            console.warn('[SendSpin] Player not connected');
            return;
        }
        try {
            (this.player.sendCommand as any)('next');
            console.log('[SendSpin] Next');
        } catch (e) {
            console.error('[SendSpin] Next error:', e);
        }
    }

    /**
     * Skip to previous track
     */
    previous() {
        if (!this.player) {
            console.warn('[SendSpin] Player not connected');
            return;
        }
        try {
            (this.player.sendCommand as any)('previous');
            console.log('[SendSpin] Previous');
        } catch (e) {
            console.error('[SendSpin] Previous error:', e);
        }
    }
}

// ============================================================================
// GLOBAL INSTANCE & BOOTSTRAP
// ============================================================================

declare global {
    interface Window {
        SendSpinPlayerManager?: PlayerManager;
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

// Main bootstrap IIFE
(function bootstrapSendSpin() {
    console.log('[SendSpin] Initializing Home Assistant browser player...');

    const playerManager = new PlayerManager();

    // Expose to global window for external access
    // This allows custom UI elements, remote cards, or other scripts to control playback
    window.SendSpinPlayerManager = playerManager;
    window.sendspinPlayer = {
        getState: () => playerManager.getState(),
        subscribe: (listener) => playerManager.subscribe(listener),
        connect: (baseUrl, token) => playerManager.connect(baseUrl, token),
        play: () => playerManager.play(),
        pause: () => playerManager.pause(),
        next: () => playerManager.next(),
        previous: () => playerManager.previous(),
    };

    console.log('[SendSpin] Exposed window.sendspinPlayer and window.SendSpinPlayerManager');

    /**
     * Auto-connect if configuration is available
     * Fetches Music Assistant URL from Home Assistant integration
     */
    async function autoConnect() {
        try {
            const configUrl = window.location.origin + '/api/sendspin_player/config';
            console.log('[SendSpin] Fetching config from:', configUrl);

            const configReq = await fetch(configUrl);

            if (!configReq.ok) {
                console.warn(`[SendSpin] Config fetch failed: ${configReq.status}`);
                return;
            }

            const config = await configReq.json();
            const maUrl = config.ma_url?.trim();
            const token = config.token?.trim();

            if (!maUrl) {
                console.warn('[SendSpin] Music Assistant URL not configured');
                return;
            }

            console.log('[SendSpin] Auto-connecting to Music Assistant at:', maUrl);
            await playerManager.connect(maUrl, token);
        } catch (e) {
            console.error('[SendSpin] Auto-connect failed:', e);
        }
    }

    // Start auto-connect when document is ready
    if (document.readyState === 'complete') {
        autoConnect();
    } else {
        window.addEventListener('load', autoConnect);
    }
})();
