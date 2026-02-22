/**
 * Sendspin connector — runs on every Home Assistant page (like browser_mod).
 * Keeps this browser registered as a Sendspin player so it works even when the
 * custom panel is closed. As long as any HA tab is open (e.g. dashboard), the
 * connection to the Sendspin server is maintained.
 */
(function () {
  const CONFIG_URL = "/api/sendspin_browser/config";
  const STORAGE_KEY_PLAYER_ID = "sendspin-browser-player-id";
  const STORAGE_KEY_URL = "sendspin-browser-player-last-url";
  const STORAGE_KEY_NAME = "sendspin-browser-player-name";
  const STORAGE_KEY_REGISTERED = "sendspin-browser-registered";

  function getOrCreatePlayerId() {
    try {
      let id = localStorage.getItem(STORAGE_KEY_PLAYER_ID);
      if (id && id.length >= 8) return id;
      id =
        typeof crypto !== "undefined" && crypto.randomUUID
          ? crypto.randomUUID()
          : "sendspin-browser-" + Math.random().toString(36).slice(2) + Date.now().toString(36);
      localStorage.setItem(STORAGE_KEY_PLAYER_ID, id);
      return id;
    } catch (_) {
      return "sendspin-browser-" + Date.now();
    }
  }

  function normalizeBaseUrl(s) {
    if (!s || typeof s !== "string") return null;
    const url = s.trim().replace(/\/+$/, "");
    if (!url) return null;
    if (url.startsWith("http://") || url.startsWith("https://")) return url;
    return "http://" + url;
  }

  async function run() {
    // Skip on login/auth pages to avoid unauthenticated requests
    var path = typeof window !== "undefined" && window.location && window.location.pathname;
    if (path && (path.indexOf("/auth/") !== -1 || path === "/auth")) return;

    let config = {};
    try {
      const res = await fetch(CONFIG_URL, { method: "GET", credentials: "same-origin" });
      if (res.ok) {
        config = await res.json();
      }
    } catch (_) { }

    let serverUrl = normalizeBaseUrl(config.server_url);
    if (!serverUrl) {
      serverUrl = normalizeBaseUrl(localStorage.getItem(STORAGE_KEY_URL));
    }

    const playerId = getOrCreatePlayerId();
    let clientName = config.player_name;
    if (!clientName || !clientName.trim()) {
      clientName = localStorage.getItem(STORAGE_KEY_NAME);
    }
    if (!clientName || !clientName.trim()) {
      clientName = "HA Browser";
    }

    // ── Check if user actually enabled this browser ──
    const isRegistered = localStorage.getItem(STORAGE_KEY_REGISTERED) === "true";
    if (!isRegistered || !serverUrl) return;

    // Unlock browser audio autoplay on user interaction.
    // iOS/iPadOS suspends the AudioContext when the app goes idle,
    // so we keep the listeners alive to re-unlock on every interaction.
    const unlockAudio = () => {
      try {
        const audio = new Audio("data:audio/wav;base64,UklGRigAAABXQVZFZm10IBIAAAABAAEARKwAAIhYAQACABAAAABkYXRhAgAAAAEA");
        audio.play().catch(() => { });
      } catch (_) { }
    };
    ["click", "touchstart", "keydown"].forEach(e => document.addEventListener(e, unlockAudio));

    // Resume AudioContext when app returns to foreground (iOS suspends it)
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "visible" && player && player.audioContext) {
        try { player.audioContext.resume().catch(() => { }); } catch (_) { }
      }
    });

    let player = null;
    let isConnecting = false;
    let forceReconnect = false;

    const connectPlayer = async () => {
      let currentUrl = normalizeBaseUrl(localStorage.getItem(STORAGE_KEY_URL)) || serverUrl;
      let currentName = localStorage.getItem(STORAGE_KEY_NAME) || clientName;

      if (isConnecting) return;

      if (player) {
        if (player.isConnected && !forceReconnect && currentUrl === serverUrl && currentName === clientName) {
          return; // Already connected, nothing to do
        }
        try { player.disconnect(); } catch (_) { }
        player = null;
        forceReconnect = false;
      }

      serverUrl = currentUrl;
      clientName = currentName;
      if (!serverUrl) return;

      isConnecting = true;
      try {
        const { SendspinPlayer } = await import(
          "https://unpkg.com/@music-assistant/sendspin-js@1.0/dist/index.js"
        );

        // --- iOS Autoplay Fix ---
        // The Sendspin SDK internally bridges the Web Audio API to an HTML5 <audio> element.
        // On stream end (pause/skip), it calls .pause() on that element. 
        // On iOS, pausing the element drops the audio session. When a remote play command
        // arrives later via WebSocket, iOS blocks the subsequent .play() call because it
        // lacks a user gesture. 
        // FIX: We provide our own audio element and intercept .pause() to do nothing. 
        // The element keeps "playing" the empty MediaStream, retaining the iOS audio session!
        const autoPlayAudioElement = document.createElement("audio");
        autoPlayAudioElement.style.display = "none";
        document.body.appendChild(autoPlayAudioElement);

        autoPlayAudioElement.pause = function () {
          // Do nothing! Keeps the iOS background audio session alive
        };

        player = new SendspinPlayer({
          baseUrl: serverUrl,
          playerId,
          clientName: clientName,
          audioElement: autoPlayAudioElement,
          deviceInfo: {
            manufacturer: "Home Assistant",
            product_name: "Sendspin Dash",
            software_version: "1.0.0"
          },
          onDisconnected: function () {
            // When the server drops us, null the player so the
            // next poll cycle creates a fresh connection.
            player = null;
          },
        });
        await player.connect();

        // --- SPEC WORKAROUNDS ---

        // 1. Group Volume Algorithm Infinite Loop Prevention
        // The spec's group volume calculation splits "lost delta" equally. Fractional 
        // volume values can cause an infinite loop during grouping in some servers.
        // We enforce strict integer rounding before sending volume updates.
        const originalSetVolume = player.setVolume.bind(player);
        player.setVolume = function (volume) {
          originalSetVolume(Math.round(volume));
        };

        // 2. TCP Half-Close / TIME_WAIT Prevention
        // The spec dictates that after sending client/goodbye, the server should 
        // close the connection. However, if the server drops offline or hangs, 
        // the client connection can stay in an indefinite half-open state.
        const originalDisconnect = player.disconnect.bind(player);
        player.disconnect = function (reason) {
          originalDisconnect(reason);
          // Force close the underlying WebSocket immediately to avoid hanging
          if (player.wsManager && player.wsManager.ws) {
            try { player.wsManager.ws.close(); } catch (_) { }
          }
        };

        window.addEventListener("beforeunload", function () {
          try { if (player) player.disconnect(); } catch (_) { }
        });
      } catch (_) {
        player = null;
      } finally {
        isConnecting = false;
      }
    };

    // Use navigator.locks so only one tab holds the Sendspin SDK connection
    const startSdkConnection = () => {
      connectPlayer();
      setInterval(connectPlayer, 5000);
    };

    // We removed navigator.locks because in a Single Page Application (SPA) like 
    // Home Assistant, or when users open multiple tabs, it caused a deadlock. 
    // The previous execution context held the lock forever, leaving new tabs 
    // or re-evaluating scripts hanging indefinitely. Now, we unconditionally connect.
    startSdkConnection();
  }

  run();
})();
