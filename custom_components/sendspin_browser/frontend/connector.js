/**
 * Sendspin connector — runs on every Home Assistant page (like browser_mod).
 * Keeps this browser registered as a Sendspin player so it works even when the
 * custom panel is closed. As long as any HA tab is open (e.g. dashboard), the
 * connection to the Sendspin server is maintained.
 */
(function () {
  const CONFIG_URL = "/api/sendspin_browser/config";
  const PING_URL = "/api/sendspin_browser/ping";
  const STORAGE_KEY_PLAYER_ID = "sendspin-browser-player-id";
  const STORAGE_KEY_URL = "sendspin-browser-player-last-url";
  const STORAGE_KEY_NAME = "sendspin-browser-player-name";

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

    // ── STEP 1: Always ping HA to register this browser, regardless of Sendspin connection ──
    const pingHA = () => {
      try {
        fetch(PING_URL, {
          method: "POST",
          credentials: "same-origin",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ player_id: playerId, name: clientName })
        }).catch(() => { });
      } catch (_) { }
    };

    // Fire immediately and repeat every 10 seconds
    pingHA();
    setInterval(pingHA, 10000);

    // ── STEP 2: If we have a server URL, try to connect the Sendspin SDK ──
    if (!serverUrl) return;

    // Unlock browser audio autoplay on first interaction
    const unlockAudio = () => {
      try {
        const audio = new Audio("data:audio/wav;base64,UklGRigAAABXQVZFZm10IBIAAAABAAEARKwAAIhYAQACABAAAABkYXRhAgAAAAEA");
        audio.play().catch(() => { });
      } catch (_) { }
      ["click", "touchstart", "keydown"].forEach(e => document.removeEventListener(e, unlockAudio));
    };
    ["click", "touchstart", "keydown"].forEach(e => document.addEventListener(e, unlockAudio, { once: true }));

    let player = null;
    let isConnecting = false;

    const connectPlayer = async () => {
      let currentUrl = normalizeBaseUrl(localStorage.getItem(STORAGE_KEY_URL)) || serverUrl;
      let currentName = localStorage.getItem(STORAGE_KEY_NAME) || clientName;

      if (isConnecting) return;

      if (player) {
        if (player.isConnected && currentUrl === serverUrl && currentName === clientName) {
          return; // Already connected, nothing to do
        }
        try { player.disconnect(); } catch (_) { }
        player = null;
      }

      serverUrl = currentUrl;
      clientName = currentName;
      if (!serverUrl) return;

      isConnecting = true;
      try {
        const { SendspinPlayer } = await import(
          "https://unpkg.com/@music-assistant/sendspin-js@1.0/dist/index.js"
        );
        player = new SendspinPlayer({
          baseUrl: serverUrl,
          playerId,
          clientName: clientName,
          onStateChange: function () { },
        });
        await player.connect();

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

    if (typeof navigator !== "undefined" && navigator.locks) {
      navigator.locks.request("sendspin-browser-player", () => {
        startSdkConnection();
        return new Promise(() => { }); // Never resolves to keep the lock
      }).catch(() => { });
    } else {
      startSdkConnection();
    }
  }

  run();
})();
