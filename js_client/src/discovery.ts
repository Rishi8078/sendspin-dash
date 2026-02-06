/**
 * Player Registration & Discovery Utilities
 * 
 * Provides mechanisms for registering this browser as a Music Assistant player
 * in Home Assistant, inspired by browser_mod's browser registration pattern.
 */

export interface BrowserInfo {
    id: string;
    name: string;
    userAgent: string;
    platform: string;
    screenWidth: number;
    screenHeight: number;
    language: string;
    timezone: string;
}

export interface PlayerRegistration {
    playerId: string;
    playerName: string;
    browserInfo: BrowserInfo;
    timestamp: number;
}

/**
 * Get detailed browser information
 * (similar to what browser_mod collects)
 */
export function getBrowserInfo(): BrowserInfo {
    const ua = navigator.userAgent;
    return {
        id: getBrowserId(),
        name: getBrowserName(),
        userAgent: ua,
        platform: navigator.platform || 'unknown',
        screenWidth: window.innerWidth || 0,
        screenHeight: window.innerHeight || 0,
        language: navigator.language || 'en',
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'unknown',
    };
}

/**
 * Get or create a stable browser ID
 */
function getBrowserId(): string {
    const STORAGE_KEY = 'sendspin-browser-id';
    let id = localStorage.getItem(STORAGE_KEY);
    if (!id) {
        id = `browser-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}`;
        localStorage.setItem(STORAGE_KEY, id);
    }
    return id;
}

/**
 * Detect browser name from user agent
 */
function getBrowserName(): string {
    const ua = navigator.userAgent;
    if (ua.includes('Chrome')) return 'Chrome';
    if (ua.includes('Firefox')) return 'Firefox';
    if (ua.includes('Safari')) return 'Safari';
    if (ua.includes('Edge')) return 'Edge';
    if (ua.includes('Opera') || ua.includes('OPR')) return 'Opera';
    return 'Unknown Browser';
}

/**
 * Register this browser/player with Home Assistant
 * Sends registration info to backend for tracking
 */
export async function registerPlayer(playerId: string, playerName: string): Promise<PlayerRegistration | null> {
    try {
        const registration: PlayerRegistration = {
            playerId,
            playerName,
            browserInfo: getBrowserInfo(),
            timestamp: Date.now(),
        };

        // Send to Home Assistant backend for tracking
        // (optional - useful for player discovery/management)
        const response = await fetch(
            `${window.location.origin}/api/sendspin_player/register`,
            {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(registration),
            }
        ).catch(() => null); // Silently fail if endpoint doesn't exist

        if (response && response.ok) {
            console.log('[SendSpin] Registered player:', registration);
            return registration;
        }

        return registration; // Return even if registration endpoint not available
    } catch (e) {
        console.error('[SendSpin] Player registration failed:', e);
        return null;
    }
}

/**
 * Get list of registered players from Home Assistant
 * Useful for player discovery/selection
 */
export async function getRegisteredPlayers(): Promise<PlayerRegistration[]> {
    try {
        const response = await fetch(
            `${window.location.origin}/api/sendspin_player/players`
        );

        if (!response.ok) {
            console.warn('[SendSpin] Failed to fetch registered players:', response.status);
            return [];
        }

        const data = await response.json();
        return Array.isArray(data) ? data : [];
    } catch (e) {
        console.error('[SendSpin] Failed to fetch registered players:', e);
        return [];
    }
}

/**
 * Unregister this player
 */
export async function unregisterPlayer(playerId: string): Promise<boolean> {
    try {
        const response = await fetch(
            `${window.location.origin}/api/sendspin_player/players/${playerId}`,
            { method: 'DELETE' }
        ).catch(() => null);

        if (response && response.ok) {
            console.log('[SendSpin] Unregistered player:', playerId);
            return true;
        }

        return false;
    } catch (e) {
        console.error('[SendSpin] Player unregistration failed:', e);
        return false;
    }
}

/**
 * Discover Music Assistant players
 * Get list of available players from MA
 */
export async function discoverMAPlayers(maUrl: string, token?: string): Promise<any[]> {
    try {
        const headers: Record<string, string> = {
            'Content-Type': 'application/json',
        };
        if (token) {
            headers['Authorization'] = `Bearer ${token}`;
        }

        const response = await fetch(`${maUrl}/api/players`, { headers });

        if (!response.ok) {
            console.warn('[SendSpin] Failed to discover MA players:', response.status);
            return [];
        }

        const data = await response.json();
        return Array.isArray(data) ? data : data.result || [];
    } catch (e) {
        console.error('[SendSpin] Player discovery failed:', e);
        return [];
    }
}
