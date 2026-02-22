/**
 * Sendspin connector — runs on every HA page (loaded via add_extra_js_url).
 * Uses the locally bundled sendspin-js SDK. Exposes state on window.sendspinState
 * and the player instance on window.sendspinPlayer.
 * Reports status to the HA backend registry via WebSocket heartbeats.
 */
(async function () {
  if (window.__sendspinConnectorActive) return;
  window.__sendspinConnectorActive = true;

  var STORAGE_PLAYER_ID = "sendspin-browser-player-id";
  var STORAGE_NAME = "sendspin-browser-player-name";
  var STORAGE_REGISTERED = "sendspin-browser-registered";

  function getOrCreatePlayerId() {
    try {
      var id = localStorage.getItem(STORAGE_PLAYER_ID);
      if (id && id.length >= 8) return id;
      id = crypto.randomUUID
        ? crypto.randomUUID()
        : "sb-" + Math.random().toString(36).slice(2) + Date.now().toString(36);
      localStorage.setItem(STORAGE_PLAYER_ID, id);
      return id;
    } catch (_) {
      return "sb-" + Date.now();
    }
  }

  window.sendspinState = {
    connected: false,
    isPlaying: false,
    volume: 100,
    muted: false,
    title: null,
    artist: null,
    album: null,
    artworkUrl: null,
    playbackState: null,
    groupName: null,
    playerState: "synchronized",
  };

  if (location.pathname.startsWith("/auth")) return;

  var hass = null;
  for (var i = 0; i < 120; i++) {
    try {
      var el = document.querySelector("home-assistant");
      if (el && el.hass && el.hass.connection) { hass = el.hass; break; }
    } catch (_) {}
    await new Promise(function (r) { setTimeout(r, 250); });
  }
  if (!hass) return;

  var serverUrl = "";
  try {
    var cfg = await hass.callWS({ type: "sendspin_browser/config" });
    serverUrl = (cfg && cfg.server_url || "").trim().replace(/\/+$/, "");
  } catch (_) {}
  if (!serverUrl) return;

  if (!serverUrl.startsWith("http://") && !serverUrl.startsWith("https://"))
    serverUrl = "http://" + serverUrl;

  var playerId = getOrCreatePlayerId();
  var player = null;
  var connecting = false;
  var SendspinPlayer = null;
  var wasRegistered = false;

  try {
    var sdk = await import("/api/sendspin_browser/sendspin-sdk.js");
    SendspinPlayer = sdk.SendspinPlayer;
  } catch (e) {
    console.error("Sendspin: Failed to load SDK", e);
    return;
  }

  function updateSharedState(sdkState) {
    var s = window.sendspinState;
    s.connected = !!(player && player.isConnected);
    if (sdkState) {
      s.isPlaying = sdkState.isPlaying;
      s.volume = sdkState.volume;
      s.muted = sdkState.muted;
      s.playerState = sdkState.playerState;
      if (sdkState.serverState && sdkState.serverState.metadata) {
        var m = sdkState.serverState.metadata;
        s.title = m.title || null;
        s.artist = m.artist || null;
        s.album = m.album || null;
        s.artworkUrl = m.artwork_url || null;
      }
      if (sdkState.groupState) {
        s.playbackState = sdkState.groupState.playback_state || null;
        s.groupName = sdkState.groupState.group_name || null;
      }
    }
  }

  function sendHeartbeat() {
    try {
      hass.callWS({
        type: "sendspin_browser/heartbeat",
        player_id: playerId,
        connected: !!(player && player.isConnected),
      }).catch(function () {});
    } catch (_) {}
  }

  function registerWithBackend() {
    try {
      hass.callWS({
        type: "sendspin_browser/register_player",
        player_id: playerId,
        name: localStorage.getItem(STORAGE_NAME) || "HA Browser",
        user_agent: navigator.userAgent || "",
      }).catch(function () {});
    } catch (_) {}
  }

  function unregisterFromBackend() {
    try {
      hass.callWS({
        type: "sendspin_browser/unregister_player",
        player_id: playerId,
      }).catch(function () {});
    } catch (_) {}
  }

  async function tick() {
    var registered = localStorage.getItem(STORAGE_REGISTERED) === "true";

    if (registered && !wasRegistered) {
      registerWithBackend();
    } else if (!registered && wasRegistered) {
      unregisterFromBackend();
    }
    wasRegistered = registered;

    if (!registered) {
      if (player) {
        try { player.disconnect("user_request"); } catch (_) {}
      }
      player = null;
      window.sendspinPlayer = null;
      window.sendspinState.connected = false;
      window.sendspinState.isPlaying = false;
      return;
    }

    sendHeartbeat();

    if (player && player.isConnected) {
      window.sendspinPlayer = player;
      window.sendspinState.connected = true;
      return;
    }

    if (connecting) return;
    connecting = true;

    try {
      if (player) {
        try { player.disconnect("restart"); } catch (_) {}
      }

      var name = localStorage.getItem(STORAGE_NAME) || "HA Browser";
      player = new SendspinPlayer({
        baseUrl: serverUrl,
        playerId: playerId,
        clientName: name,
        correctionMode: "sync",
        onStateChange: function (state) {
          updateSharedState(state);
        },
      });

      await player.connect();
      window.sendspinPlayer = player;
      window.sendspinState.connected = true;
      sendHeartbeat();
    } catch (_) {
      player = null;
      window.sendspinPlayer = null;
      window.sendspinState.connected = false;
    } finally {
      connecting = false;
    }
  }

  window.addEventListener("beforeunload", function () {
    try { if (player) player.disconnect("shutdown"); } catch (_) {}
  });

  if (localStorage.getItem(STORAGE_REGISTERED) === "true") {
    wasRegistered = true;
    registerWithBackend();
  }

  tick();
  setInterval(tick, 5000);
})();
