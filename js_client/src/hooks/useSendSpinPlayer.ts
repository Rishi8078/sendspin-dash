/**
 * React Hook for SendSpin Player Integration
 * 
 * Provides a convenient hook for React components to access and control
 * the SendSpin player state, similar to how DockSlab uses its Context.
 * 
 * Usage in React:
 * ```
 * import { useSendSpinPlayer } from './hooks/useSendSpinPlayer'
 * 
 * export function NowPlayingCard() {
 *   const { state, play, pause, next } = useSendSpinPlayer()
 *   return (
 *     <div>
 *       {state.nowPlaying && (
 *         <>
 *           <h2>{state.nowPlaying.title}</h2>
 *           <p>{state.nowPlaying.artist}</p>
 *         </>
 *       )}
 *       <button onClick={play}>Play</button>
 *       <button onClick={pause}>Pause</button>
 *       <button onClick={next}>Next</button>
 *     </div>
 *   )
 * }
 * ```
 */

import { useEffect, useState } from 'react'
import type { PlayerState } from '../main'

interface UseSendSpinPlayerReturn {
    state: PlayerState
    play: () => void
    pause: () => void
    next: () => void
    previous: () => void
    connect: (baseUrl: string, token?: string) => Promise<void>
    isLoading: boolean
}

export function useSendSpinPlayer(): UseSendSpinPlayerReturn {
    const [state, setState] = useState<PlayerState>(() => {
        // Get initial state from window.sendspinPlayer if available
        if (typeof window !== 'undefined' && window.sendspinPlayer) {
            return window.sendspinPlayer.getState()
        }
        return {
            isConnected: false,
            isPlaying: false,
            nowPlaying: null,
            playerId: null,
            connectionState: 'idle',
            connectionError: null,
            baseUrl: null,
        }
    })

    const [isLoading, setIsLoading] = useState(false)

    useEffect(() => {
        if (typeof window === 'undefined' || !window.sendspinPlayer) {
            console.warn('[React Hook] SendSpin player not available on window')
            return
        }

        // Subscribe to state changes
        const unsubscribe = window.sendspinPlayer.subscribe((newState) => {
            setState(newState)
        })

        return unsubscribe
    }, [])

    const connect = async (baseUrl: string, token?: string) => {
        if (!window.sendspinPlayer) return

        setIsLoading(true)
        try {
            await window.sendspinPlayer.connect(baseUrl, token)
        } finally {
            setIsLoading(false)
        }
    }

    return {
        state,
        play: () => window.sendspinPlayer?.play(),
        pause: () => window.sendspinPlayer?.pause(),
        next: () => window.sendspinPlayer?.next(),
        previous: () => window.sendspinPlayer?.previous(),
        connect,
        isLoading,
    }
}
