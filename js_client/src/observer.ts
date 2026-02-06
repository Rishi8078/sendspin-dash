/**
 * Vanilla JavaScript API for SendSpin Player Integration
 * 
 * Provides a simple observer-based API for any JavaScript code to access
 * and control the SendSpin player state.
 * 
 * Usage:
 * ```typescript
 * import { useSendSpinPlayer } from './observer'
 * 
 * class NowPlayingWidget {
 *   constructor() {
 *     this.state = null
 *     this.unsubscribe = useSendSpinPlayer((newState) => {
 *       this.state = newState
 *       this.render()
 *     })
 *   }
 * 
 *   render() {
 *     if (this.state.nowPlaying) {
 *       console.log(this.state.nowPlaying.title)
 *     }
 *   }
 * 
 *   destroy() {
 *     this.unsubscribe()
 *   }
 * }
 * ```
 */

import type { PlayerState } from './main'

interface SendSpinPlayerAPI {
    getState: () => PlayerState
    subscribe: (listener: (state: PlayerState) => void) => () => void
    connect: (baseUrl: string, token?: string) => Promise<void>
    play: () => void
    pause: () => void
    next: () => void
    previous: () => void
}

/**
 * Get the SendSpin player API
 * Returns the global window.sendspinPlayer instance with type safety
 */
export function getSendSpinPlayer(): SendSpinPlayerAPI | null {
    if (typeof window === 'undefined') {
        console.error('[SendSpin Observer] Not available in non-browser environment')
        return null
    }

    if (!window.sendspinPlayer) {
        console.error('[SendSpin Observer] SendSpin player not loaded. Ensure sendspin-bootstrap.js is included.')
        return null
    }

    return window.sendspinPlayer
}

/**
 * Vanilla JS version of the React hook
 * Subscribe to player state changes
 * 
 * Returns an unsubscribe function
 */
export function useSendSpinPlayer(listener: (state: PlayerState) => void): () => void {
    const player = getSendSpinPlayer()

    if (!player) {
        console.error('[SendSpin Observer] Cannot subscribe without player')
        return () => {} // Return no-op unsubscribe
    }

    // Immediately call listener with current state
    listener(player.getState())

    // Subscribe to future changes
    return player.subscribe(listener)
}

/**
 * Convenience function to get current player state
 */
export function getSendSpinState(): PlayerState | null {
    const player = getSendSpinPlayer()
    return player ? player.getState() : null
}

/**
 * Convenience functions for playback control
 */
export const sendspinControl = {
    play: () => getSendSpinPlayer()?.play(),
    pause: () => getSendSpinPlayer()?.pause(),
    next: () => getSendSpinPlayer()?.next(),
    previous: () => getSendSpinPlayer()?.previous(),
    connect: (baseUrl: string, token?: string) =>
        getSendSpinPlayer()?.connect(baseUrl, token) ?? Promise.reject(new Error('Player not available')),
}
