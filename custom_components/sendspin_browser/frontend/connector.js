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
    // Skip on login/auth pages to avoid unauthenticated requests and ban logs
    var path = typeof window !== "undefined" && window.location && window.location.pathname;
    if (path && (path.indexOf("/auth/") !== -1 || path === "/auth")) return;

    let config = {};
    try {
      const res = await fetch(CONFIG_URL, { method: "GET", credentials: "same-origin" });
      if (res.ok) {
        config = await res.json();
      }
    } catch (_) {}

    let serverUrl = normalizeBaseUrl(config.server_url);
    if (!serverUrl) {
      serverUrl = normalizeBaseUrl(localStorage.getItem(STORAGE_KEY_URL));
    }
    if (!serverUrl) return;

    const playerId = getOrCreatePlayerId();
    let clientName = config.player_name;
    if (!clientName || !clientName.trim()) {
      clientName = localStorage.getItem(STORAGE_KEY_NAME);
    }
    if (!clientName || !clientName.trim()) {
      clientName = "HA Browser";
    }

    // Unlock browser audio autoplay on first interaction
    const unlockAudio = () => {
      try {
        const audio = new Audio("data:audio/wav;base64,UklGRigAAABXQVZFZm10IBIAAAABAAEARKwAAIhYAQACABAAAABkYXRhAgAAAAEA");
        audio.play().catch(() => {});
      } catch (_) {}
      ["click", "touchstart", "keydown"].forEach(e => document.removeEventListener(e, unlockAudio));
    };
    ["click", "touchstart", "keydown"].forEach(e => document.addEventListener(e, unlockAudio, { once: true }));

    let player = null;
    let isConnecting = false;

    const connectPlayer = async () => {
      if (isConnecting || (player && player.isConnected)) return;
      isConnecting = true;
      try {
        const { SendspinPlayer } = await import(
          "https://unpkg.com/@music-assistant/sendspin-js@1.0/dist/index.js"
        );
        player = new SendspinPlayer({
          baseUrl: serverUrl,
          playerId,
          clientName: clientName,
          onStateChange: function () {},
        });
        await player.connect();
        
        window.addEventListener("beforeunload", function () {
          try {
            if (player) player.disconnect();
          } catch (_) {}
        });
      } catch (_) {
        player = null;
      } finally {
        isConnecting = false;
      }
    };

    await connectPlayer();
    setInterval(connectPlayer, 5000);
  }

  run();
})();
