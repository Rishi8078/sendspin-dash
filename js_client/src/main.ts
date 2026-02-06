import { SendspinPlayer } from '@music-assistant/sendspin-js';
import type { ControllerCommand, ServerStatePayload, GroupUpdatePayload } from '@music-assistant/sendspin-js';

// ============================================================================
// TYPES
// ============================================================================

export type ConnectionState = 'idle' | 'connecting' | 'connected' | 'error';

export interface NowPlaying {
    title: string;
    artist: string;
    album: string;
    artworkUrl: string | null;
    durationMs: number;
    progressMs: number;
    playbackSpeed: number;
    repeat: 'off' | 'one' | 'all' | null;
    shuffle: boolean | null;
}

export interface GroupInfo {
    groupId: string | null;
    groupName: string | null;
    playbackState: 'playing' | 'stopped' | null;
}

export interface PlayerState {
    /** Whether the WebSocket to the Sendspin server is connected */
    isConnected: boolean;
    /** Whether audio is currently playing (from group/update playback_state) */
    isPlaying: boolean;
    /** Player-local volume (0-100) */
    volume: number;
    /** Player-local mute state */
    muted: boolean;
    /** Player sync state: 'synchronized' or 'error' */
    playerState: string;
    /** Track metadata from the server */
    nowPlaying: NowPlaying | null;
    /** Group volume & mute from controller state */
    groupVolume: number | null;
    groupMuted: boolean | null;
    /** Group info */
    group: GroupInfo | null;
    /** Supported controller commands from the server */
    supportedCommands: string[];
    /** Connection lifecycle */
    playerId: string | null;
    connectionState: ConnectionState;
    connectionError: string | null;
    baseUrl: string | null;
}

// ============================================================================
// PLAYER MANAGER
// ============================================================================

const STORAGE_KEY_PLAYER_ID = 'sendspin-ha-player-id';
const STORAGE_KEY_VOLUME = 'sendspin-ha-volume';
const STORAGE_KEY_MUTED = 'sendspin-ha-muted';

class PlayerManager {
    private player: SendspinPlayer | null = null;
    private state: PlayerState;
    private listeners: Set<(state: PlayerState) => void> = new Set();
    private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
    private reconnectAttempts = 0;
    private maxReconnectAttempts = 10;
    private reconnectDelay = 5000;
    private currentBaseUrl: string | null = null;
    private currentToken: string | undefined = undefined;

    constructor() {
        this.state = {
            isConnected: false,
            isPlaying: false,
            volume: this.loadNumber(STORAGE_KEY_VOLUME, 80),
            muted: localStorage.getItem(STORAGE_KEY_MUTED) === 'true',
            playerState: 'synchronized',
            nowPlaying: null,
            groupVolume: null,
            groupMuted: null,
            group: null,
            supportedCommands: [],
            playerId: this.getStablePlayerId(),
            connectionState: 'idle',
            connectionError: null,
            baseUrl: null,
        };
    }

    private loadNumber(key: string, fallback: number): number {
        const v = localStorage.getItem(key);
        if (v === null) return fallback;
        const n = parseInt(v, 10);
        return isNaN(n) ? fallback : n;
    }

    private getStablePlayerId(): string {
        let id = localStorage.getItem(STORAGE_KEY_PLAYER_ID);
        if (!id) {
            id = `ha-browser-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}`;
            localStorage.setItem(STORAGE_KEY_PLAYER_ID, id);
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
            try { fn(copy); } catch (e) { console.error('[Sendspin] listener error:', e); }
        });
    }

    disconnect() {
        if (this.reconnectTimer) {
            clearTimeout(this.reconnectTimer);
            this.reconnectTimer = null;
        }
        if (this.player) {
            try { this.player.disconnect('shutdown'); } catch (_) { /* ignore */ }
            this.player = null;
        }
        this.currentBaseUrl = null;
        this.setState({
            isConnected: false,
            isPlaying: false,
            nowPlaying: null,
            group: null,
            groupVolume: null,
            groupMuted: null,
            supportedCommands: [],
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

        // Clean up any previous connection
        if (this.player) {
            try { this.player.disconnect('restart'); } catch (_) { /* ignore */ }
            this.player = null;
        }
        if (this.reconnectTimer) {
            clearTimeout(this.reconnectTimer);
            this.reconnectTimer = null;
        }

        this.currentBaseUrl = url;
        this.currentToken = token;
        this.reconnectAttempts = 0;
        this.setState({ connectionState: 'connecting', connectionError: null, baseUrl: url });

        try {
            const playerId = this.state.playerId!;
            const savedVolume = this.state.volume;
            const savedMuted = this.state.muted;

            this.player = new SendspinPlayer({
                playerId,
                baseUrl: url,
                clientName: 'Home Assistant Browser',
                correctionMode: 'sync',
                token: token || undefined,
                onStateChange: (s) => this.handleStateChange(s),
            } as any);

            this.unlockAudio();
            console.log('[Sendspin] Connecting to:', url);

            // 15s timeout for connection
            const timeout = new Promise<never>((_, reject) =>
                setTimeout(() => reject(new Error('Connection timeout (15s)')), 15000)
            );
            await Promise.race([this.player.connect(), timeout]);

            // Apply saved volume/mute after connect
            this.player.setVolume(savedVolume);
            this.player.setMuted(savedMuted);

            console.log('[Sendspin] Connected as player:', playerId);
            this.reconnectAttempts = 0;
            this.setState({
                isConnected: true,
                connectionState: 'connected',
                connectionError: null,
            });
        } catch (error: any) {
            console.error('[Sendspin] Connection failed:', error?.message);
            this.setState({
                connectionState: 'error',
                connectionError: error?.message || 'Connection failed',
                isConnected: false,
            });
            this.scheduleReconnect();
        }
    }

    /**
     * Handle state changes from the SendspinPlayer SDK.
     *
     * The callback shape (from sendspin-js StateManager):
     *   isPlaying: boolean
     *   volume: number (0-100)
     *   muted: boolean
     *   playerState: 'synchronized' | 'error'
     *   serverState: { metadata?, controller?, player? }
     *   groupState: { playback_state?, group_id?, group_name? }
     */
    private handleStateChange(sdkState: {
        isPlaying: boolean;
        volume: number;
        muted: boolean;
        playerState: string;
        serverState: ServerStatePayload;
        groupState: GroupUpdatePayload;
    }) {
        // Map metadata to our NowPlaying
        let nowPlaying: NowPlaying | null = this.state.nowPlaying;
        const meta = sdkState.serverState?.metadata;
        if (meta) {
            nowPlaying = {
                title: meta.title || 'Unknown',
                artist: meta.artist || 'Unknown',
                album: meta.album || '',
                artworkUrl: meta.artwork_url || null,
                durationMs: meta.progress?.track_duration ?? 0,
                progressMs: meta.progress?.track_progress ?? 0,
                playbackSpeed: meta.progress?.playback_speed ?? 1000,
                repeat: meta.repeat ?? null,
                shuffle: meta.shuffle ?? null,
            };
        }

        // Map group state
        let group: GroupInfo | null = this.state.group;
        const gs = sdkState.groupState;
        if (gs) {
            group = {
                groupId: gs.group_id ?? group?.groupId ?? null,
                groupName: gs.group_name ?? group?.groupName ?? null,
                playbackState: gs.playback_state ?? group?.playbackState ?? null,
            };
        }

        // Map controller state (group volume/mute, supported commands)
        const ctrl = sdkState.serverState?.controller;
        const groupVolume = ctrl?.volume ?? this.state.groupVolume;
        const groupMuted = ctrl?.muted ?? this.state.groupMuted;
        const supportedCommands = ctrl?.supported_commands ?? this.state.supportedCommands;

        // Determine playing state from group playback_state
        const isPlaying = group?.playbackState === 'playing' || sdkState.isPlaying;

        // Persist volume/mute
        localStorage.setItem(STORAGE_KEY_VOLUME, String(sdkState.volume));
        localStorage.setItem(STORAGE_KEY_MUTED, String(sdkState.muted));

        this.setState({
            isConnected: true,
            isPlaying,
            volume: sdkState.volume,
            muted: sdkState.muted,
            playerState: sdkState.playerState,
            nowPlaying,
            groupVolume,
            groupMuted,
            group,
            supportedCommands,
            connectionState: 'connected',
            connectionError: null,
        });
    }

    private scheduleReconnect() {
        if (this.reconnectAttempts >= this.maxReconnectAttempts || !this.currentBaseUrl) {
            console.warn('[Sendspin] Max reconnect attempts reached');
            return;
        }
        const delay = this.reconnectDelay * Math.pow(1.5, this.reconnectAttempts);
        this.reconnectAttempts++;
        console.log(`[Sendspin] Reconnecting in ${(delay / 1000).toFixed(1)}s (attempt ${this.reconnectAttempts})`);
        this.reconnectTimer = setTimeout(() => {
            if (this.currentBaseUrl) this.connect(this.currentBaseUrl, this.currentToken);
        }, delay);
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

    // ========================================
    // Local player controls
    // ========================================

    setVolume(volume: number) {
        if (!this.player) return;
        this.player.setVolume(volume);
    }

    setMuted(muted: boolean) {
        if (!this.player) return;
        this.player.setMuted(muted);
    }

    // ========================================
    // Controller commands → Sendspin server
    // These control the group's playback source.
    // ========================================

    sendCommand(command: ControllerCommand, params?: Record<string, unknown>) {
        if (!this.player) return;
        try {
            // The SDK's sendCommand is typed:
            //   sendCommand<T extends ControllerCommand>(command: T, params: ControllerCommands[T]): void
            // For void commands (play, pause, etc.) the second arg is `undefined`.
            // For 'volume' it's { volume: number }, for 'mute' it's { mute: boolean }.
            (this.player as any).sendCommand(command, params);
        } catch (e) {
            console.error(`[Sendspin] command '${command}' error:`, e);
        }
    }

    play() { this.sendCommand('play' as ControllerCommand); }
    pause() { this.sendCommand('pause' as ControllerCommand); }
    stop() { this.sendCommand('stop' as ControllerCommand); }
    next() { this.sendCommand('next' as ControllerCommand); }
    previous() { this.sendCommand('previous' as ControllerCommand); }

    setGroupVolume(volume: number) {
        this.sendCommand('volume' as ControllerCommand, { volume });
    }
    setGroupMuted(muted: boolean) {
        this.sendCommand('mute' as ControllerCommand, { mute: muted });
    }

    /** Get real-time track progress calculated from server timestamps */
    getTrackProgress(): { positionMs: number; durationMs: number; playbackSpeed: number } | null {
        if (!this.player) return null;
        return this.player.trackProgress;
    }

    /** Get sync debugging info */
    getSyncInfo() {
        if (!this.player) return null;
        return this.player.syncInfo;
    }

    /** Get time sync status */
    getTimeSyncInfo() {
        if (!this.player) return null;
        return this.player.timeSyncInfo;
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
            disconnect: () => void;
            play: () => void;
            pause: () => void;
            stop: () => void;
            next: () => void;
            previous: () => void;
            setVolume: (volume: number) => void;
            setMuted: (muted: boolean) => void;
            setGroupVolume: (volume: number) => void;
            setGroupMuted: (muted: boolean) => void;
            sendCommand: (command: string, params?: Record<string, unknown>) => void;
            getTrackProgress: () => { positionMs: number; durationMs: number; playbackSpeed: number } | null;
            getSyncInfo: () => any;
            getTimeSyncInfo: () => any;
        };
    }
}

(function bootstrap() {
    console.log('[Sendspin] Bootstrap starting...');

    const mgr = new PlayerManager();

    window.sendspinPlayer = {
        getState: () => mgr.getState(),
        subscribe: (fn) => mgr.subscribe(fn),
        connect: (url, token) => mgr.connect(url, token),
        disconnect: () => mgr.disconnect(),
        play: () => mgr.play(),
        pause: () => mgr.pause(),
        stop: () => mgr.stop(),
        next: () => mgr.next(),
        previous: () => mgr.previous(),
        setVolume: (v) => mgr.setVolume(v),
        setMuted: (m) => mgr.setMuted(m),
        setGroupVolume: (v) => mgr.setGroupVolume(v),
        setGroupMuted: (m) => mgr.setGroupMuted(m),
        sendCommand: (cmd, params) => mgr.sendCommand(cmd as ControllerCommand, params),
        getTrackProgress: () => mgr.getTrackProgress(),
        getSyncInfo: () => mgr.getSyncInfo(),
        getTimeSyncInfo: () => mgr.getTimeSyncInfo(),
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
                console.log('[Sendspin] Got HA WebSocket connection');
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

            // 2. Ask our integration for the Sendspin server URL via WebSocket
            //    Authentication is handled by the HA WebSocket framework.
            console.log('[Sendspin] Requesting config via WebSocket...');
            const config = await conn.sendMessagePromise({
                type: 'sendspin_player/config',
            });

            console.log('[Sendspin] Got config:', config);

            const serverUrl = config?.server_url?.trim();
            const token = config?.token?.trim();
            if (!serverUrl) {
                console.warn('[Sendspin] Server URL not configured');
                return;
            }

            // 3. Connect to the Sendspin server (e.g. Music Assistant)
            //    The SDK opens its own WebSocket at ws://server:port/sendspin
            console.log('[Sendspin] Connecting to Sendspin server at:', serverUrl);
            await mgr.connect(serverUrl, token || undefined);
        } catch (e: any) {
            console.error('[Sendspin] Auto-connect failed:', e?.message || e);
        }
    }

    // Cleanup on page unload
    window.addEventListener('beforeunload', () => {
        if (mgr.getState().isConnected) {
            mgr.disconnect();
        }
    });

    // Run when page is ready
    if (document.readyState === 'complete') {
        autoConnect();
    } else {
        window.addEventListener('load', autoConnect);
    }
})();
