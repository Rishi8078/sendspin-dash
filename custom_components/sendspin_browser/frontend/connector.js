/**
 * Sendspin connector — runs on every Home Assistant page (like browser_mod).
 * Reads config via HA's WebSocket API (no HTTP fetch, no auth issues).
 * Exposes the active player on window.sendspinPlayer so the panel can read status.
 */
(function () {
  if (window.__sendspinConnectorActive) return;
  window.__sendspinConnectorActive = true;

  var STORAGE_PLAYER_ID = "sendspin-browser-player-id";
  var STORAGE_NAME = "sendspin-browser-player-name";
  var STORAGE_REGISTERED = "sendspin-browser-registered";
  var STORAGE_LAST_URL = "sendspin-browser-player-last-url";

  function getOrCreatePlayerId() {
    try {
      var id = localStorage.getItem(STORAGE_PLAYER_ID);
      if (id && id.length >= 8) return id;
      id =
        typeof crypto !== "undefined" && crypto.randomUUID
          ? crypto.randomUUID()
          : "sb-" + Math.random().toString(36).slice(2) + Date.now().toString(36);
      localStorage.setItem(STORAGE_PLAYER_ID, id);
      return id;
    } catch (_) {
      return "sb-" + Date.now();
    }
  }

  function normalizeUrl(s) {
    if (!s || typeof s !== "string") return "";
    var url = s.trim().replace(/\/+$/, "");
    if (!url) return "";
    if (!url.startsWith("http://") && !url.startsWith("https://")) url = "http://" + url;
    return url;
  }

  function getHass() {
    try {
      var el = document.querySelector("home-assistant");
      return el && el.hass && el.hass.connection ? el.hass : null;
    } catch (_) {
      return null;
    }
  }

  async function waitForHass() {
    for (var i = 0; i < 120; i++) {
      var h = getHass();
      if (h) return h;
      await new Promise(function (r) { setTimeout(r, 250); });
    }
    return null;
  }

  async function run() {
    if (location.pathname.startsWith("/auth")) return;

    var hass = await waitForHass();
    if (!hass) return;

    // Fetch config via HA WebSocket — authenticated, no HTTP fetch needed
    var serverUrl = "";
    try {
      var cfg = await hass.callWS({ type: "sendspin_browser/config" });
      serverUrl = normalizeUrl(cfg && cfg.server_url);
    } catch (_) {}

    if (!serverUrl) serverUrl = normalizeUrl(localStorage.getItem(STORAGE_LAST_URL));
    if (!serverUrl) return;

    localStorage.setItem(STORAGE_LAST_URL, serverUrl);

    var playerId = getOrCreatePlayerId();

    // Unlock browser audio autoplay on first user interaction.
    // Keep listeners alive — iOS re-suspends the AudioContext on idle.
    var unlock = function () {
      try {
        new Audio(
          "data:audio/wav;base64,UklGRigAAABXQVZFZm10IBIAAAABAAEARKwAAIhYAQACABAAAABkYXRhAgAAAAEA"
        ).play().catch(function () {});
      } catch (_) {}
    };
    ["click", "touchstart", "keydown"].forEach(function (e) {
      document.addEventListener(e, unlock);
    });

    document.addEventListener("visibilitychange", function () {
      if (document.visibilityState === "visible") {
        try {
          var p = window.sendspinPlayer;
          if (p && p.audioContext) p.audioContext.resume().catch(function () {});
        } catch (_) {}
      }
    });

    // Persistent audio element — reused across reconnects.
    // .pause() is intercepted so iOS keeps the audio session alive after stream stop.
    var audioEl = document.createElement("audio");
    audioEl.style.display = "none";
    document.body.appendChild(audioEl);
    audioEl.pause = function () {};

    var player = null;
    var connecting = false;
    var SdkClass = null;

    async function tick() {
      var registered = localStorage.getItem(STORAGE_REGISTERED) === "true";

      if (!registered) {
        if (player) {
          try { player.disconnect(); } catch (_) {}
        }
        player = null;
        window.sendspinPlayer = null;
        return;
      }

      if (player && player.isConnected) {
        window.sendspinPlayer = player;
        return;
      }

      if (connecting) return;
      connecting = true;

      try {
        if (!SdkClass) {
          var m = await import(
            "https://unpkg.com/@music-assistant/sendspin-js@1.0/dist/index.js"
          );
          SdkClass = m.SendspinPlayer;
        }

        if (player) {
          try { player.disconnect(); } catch (_) {}
        }

        var name = localStorage.getItem(STORAGE_NAME) || "HA Browser";
        var p = new SdkClass({
          baseUrl: serverUrl,
          playerId: playerId,
          clientName: name,
          audioElement: audioEl,
          deviceInfo: {
            manufacturer: "Home Assistant",
            product_name: "Sendspin Dash",
            software_version: "1.0.0",
          },
          onDisconnected: function () {
            window.sendspinPlayer = null;
          },
        });

        await p.connect();

        // --- Spec workarounds ---

        // Group volume: enforce integer rounding to prevent infinite loops
        var origVol = p.setVolume.bind(p);
        p.setVolume = function (v) { origVol(Math.round(v)); };

        // TCP half-close: force-close the WebSocket if disconnect hangs
        var origDc = p.disconnect.bind(p);
        p.disconnect = function (reason) {
          origDc(reason);
          try {
            if (p.wsManager && p.wsManager.ws) p.wsManager.ws.close();
          } catch (_) {}
        };

        player = p;
        window.sendspinPlayer = p;
      } catch (_) {
        player = null;
        window.sendspinPlayer = null;
      } finally {
        connecting = false;
      }
    }

    window.addEventListener("beforeunload", function () {
      try { if (player) player.disconnect(); } catch (_) {}
    });

    tick();
    setInterval(tick, 5000);
  }

  run();
})();
