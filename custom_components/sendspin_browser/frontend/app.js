/**
 * Sendspin Browser Player (Home Assistant panel).
 * Same logic as standalone browser-player; prefills from URL params (from HA config).
 */

const STORAGE_KEY_URL = "sendspin-browser-player-last-url";
const STORAGE_KEY_NAME = "sendspin-browser-player-name";
const STORAGE_KEY_PLAYER_ID = "sendspin-browser-player-id";
// Use the integration's discovery API (mDNS via Home Assistant); same origin when in panel
const DISCOVERY_URL = "/api/sendspin_browser/servers";

const elements = {
  connectCard: document.getElementById("connect-card"),
  playerNameInput: document.getElementById("player-name"),
  serverUrlInput: document.getElementById("server-url"),
  findServersBtn: document.getElementById("find-servers-btn"),
  serversList: document.getElementById("servers-list"),
  connectError: document.getElementById("connect-error"),
  discoveryHint: document.getElementById("discovery-hint"),
  connectBtn: document.getElementById("connect-btn"),
  playerCard: document.getElementById("player-card"),
  nowPlayingTitle: document.getElementById("now-playing-title"),
  nowPlayingArtist: document.getElementById("now-playing-artist"),
  progressRange: document.getElementById("progress-range"),
  timeCurrent: document.getElementById("time-current"),
  timeTotal: document.getElementById("time-total"),
  btnPrev: document.getElementById("btn-prev"),
  btnPlayPause: document.getElementById("btn-play-pause"),
  btnNext: document.getElementById("btn-next"),
  muteBtn: document.getElementById("mute-btn"),
  iconVolume: document.getElementById("icon-volume"),
  iconMuted: document.getElementById("icon-muted"),
  iconPlay: document.querySelector("#btn-play-pause .icon-play"),
  iconPause: document.querySelector("#btn-play-pause .icon-pause"),
  volumeSlider: document.getElementById("volume-slider"),
  syncStatus: document.getElementById("sync-status"),
  disconnectBtn: document.getElementById("disconnect-btn"),
};

let player = null;
let syncUpdateInterval = null;
let progressUpdateInterval = null;
let supportedCommands = [];
let isPlaying = false;
let lastPositionMs = 0;
let lastDurationMs = 0;
let lastProgressUpdate = 0;

const sdkImport = import(
  "https://unpkg.com/@music-assistant/sendspin-js@1.0/dist/index.js"
);

function getUrlParams() {
  const p = new URLSearchParams(window.location.search);
  return {
    server_url: p.get("server_url") || "",
    player_name: p.get("player_name") || "",
  };
}

function formatTime(ms) {
  if (ms == null || !Number.isFinite(ms) || ms < 0) return "0:00";
  const totalSec = Math.floor(ms / 1000);
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

function normalizeBaseUrl(input) {
  const s = String(input).trim();
  if (!s) return null;
  const url = s.replace(/\/+$/, "");
  if (url.startsWith("http://") || url.startsWith("https://")) return url;
  return `http://${url}`;
}

function showError(msg) {
  elements.connectError.textContent = msg || "";
  elements.connectError.classList.toggle("hidden", !msg);
}

function loadSavedSettings() {
  const params = getUrlParams();
  try {
    const url = params.server_url || localStorage.getItem(STORAGE_KEY_URL) || "";
    if (url) elements.serverUrlInput.value = url;
    const name = params.player_name || localStorage.getItem(STORAGE_KEY_NAME) || "";
    if (name) elements.playerNameInput.value = name;
  } catch (_) {}
}

function saveLastUrl(url) {
  try {
    if (url) localStorage.setItem(STORAGE_KEY_URL, url);
  } catch (_) {}
}

function savePlayerName(name) {
  try {
    if (name) localStorage.setItem(STORAGE_KEY_NAME, name);
  } catch (_) {}
}

function getPlayerName() {
  const s = elements.playerNameInput?.value?.trim();
  return s || undefined;
}

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

function setNowPlaying(title, artist) {
  elements.nowPlayingTitle.textContent = title || "—";
  elements.nowPlayingArtist.textContent = artist || "—";
}

function setPlayPauseIcon(playing) {
  isPlaying = playing;
  if (elements.iconPlay && elements.iconPause) {
    elements.iconPlay.classList.toggle("hidden", playing);
    elements.iconPause.classList.toggle("hidden", !playing);
  }
  elements.btnPlayPause.setAttribute("title", playing ? "Pause" : "Play");
  elements.btnPlayPause.setAttribute("aria-label", playing ? "Pause" : "Play");
}

function updateTimeline(positionMs, durationMs) {
  lastPositionMs = positionMs;
  lastDurationMs = durationMs;
  lastProgressUpdate = Date.now();
  elements.timeCurrent.textContent = formatTime(positionMs);
  elements.timeTotal.textContent = formatTime(durationMs);
  if (durationMs > 0) {
    const pct = Math.min(100, (positionMs / durationMs) * 100);
    elements.progressRange.value = String(Math.round((pct / 100) * 1000));
  } else {
    elements.progressRange.value = "0";
  }
}

function tickProgress() {
  if (!isPlaying || lastDurationMs <= 0) return;
  const elapsed = Date.now() - lastProgressUpdate;
  const newPos = Math.min(lastPositionMs + elapsed, lastDurationMs);
  lastPositionMs = newPos;
  lastProgressUpdate = Date.now();
  elements.timeCurrent.textContent = formatTime(newPos);
  const pct = (newPos / lastDurationMs) * 100;
  elements.progressRange.value = String(Math.round((pct / 100) * 1000));
}

function updateTransportState(state) {
  if (!state) return;
  const meta = state.serverState?.metadata;
  if (meta) {
    setNowPlaying(meta.title ?? null, meta.artist ?? null);
    const progress = meta.progress;
    if (progress) {
      const pos = progress.position_ms ?? progress.track_progress;
      const dur = progress.duration_ms ?? progress.track_duration;
      if (pos != null && dur != null) updateTimeline(pos, dur);
    }
  }
  const group = state.groupState;
  if (group?.playback_state) setPlayPauseIcon(group.playback_state === "playing");
  const cmds = state.serverState?.controller?.supported_commands;
  if (Array.isArray(cmds)) {
    supportedCommands = cmds;
    elements.btnPrev.disabled = !cmds.includes("previous");
    elements.btnNext.disabled = !cmds.includes("next");
    elements.btnPlayPause.disabled = !cmds.includes("play") && !cmds.includes("pause");
  }
}

async function findServers() {
  elements.findServersBtn.disabled = true;
  elements.serversList.classList.add("hidden");
  elements.discoveryHint.classList.add("hidden");
  showError("");
  try {
    const res = await fetch(DISCOVERY_URL, { method: "GET" });
    if (!res.ok) throw new Error(`Discovery: ${res.status}`);
    const servers = await res.json();
    if (!Array.isArray(servers) || servers.length === 0) {
      elements.discoveryHint.classList.remove("hidden");
      return;
    }
    elements.serversList.innerHTML = "";
    for (const s of servers) {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "btn btn-ghost";
      btn.textContent = s.name || s.url || "Server";
      btn.title = s.url || "";
      btn.addEventListener("click", () => {
        elements.serverUrlInput.value = s.url || "";
        elements.serversList.classList.add("hidden");
      });
      elements.serversList.appendChild(btn);
    }
    elements.serversList.classList.remove("hidden");
  } catch (_) {
    elements.discoveryHint.classList.remove("hidden");
  } finally {
    elements.findServersBtn.disabled = false;
  }
}

async function connect() {
  const baseUrl = normalizeBaseUrl(elements.serverUrlInput.value);
  if (!baseUrl) {
    showError("Please enter a server URL (e.g. http://host:port)");
    return;
  }
  showError("");
  elements.connectBtn.disabled = true;
  elements.connectBtn.textContent = "Connecting…";
  try {
    const clientName = getPlayerName();
    if (clientName) savePlayerName(clientName);
    const playerId = getOrCreatePlayerId();
    const { SendspinPlayer } = await sdkImport;
    player = new SendspinPlayer({
      baseUrl,
      playerId,
      clientName: clientName || undefined,
      onStateChange: updateTransportState,
    });
    await player.connect();
    saveLastUrl(baseUrl);
    setNowPlaying(null, null);
    setPlayPauseIcon(false);
    updateTimeline(0, 0);
    supportedCommands = [];
    elements.btnPrev.disabled = false;
    elements.btnNext.disabled = false;
    elements.btnPlayPause.disabled = false;
    elements.volumeSlider.value = player.volume;
    setMuteIcon(player.muted);
    elements.connectCard.classList.add("hidden");
    elements.playerCard.classList.remove("hidden");
    syncUpdateInterval = setInterval(updateSyncStatus, 500);
    progressUpdateInterval = setInterval(tickProgress, 500);
  } catch (err) {
    console.error("Connection failed:", err);
    showError(err?.message || "Connection failed");
    player = null;
  } finally {
    elements.connectBtn.disabled = false;
    elements.connectBtn.textContent = "Connect";
  }
}

function setMuteIcon(muted) {
  if (elements.iconVolume && elements.iconMuted) {
    elements.iconVolume.classList.toggle("hidden", muted);
    elements.iconMuted.classList.toggle("hidden", !muted);
  }
}

function updateSyncStatus() {
  if (!player) return;
  if (!player.isConnected) {
    disconnect();
    return;
  }
  const syncInfo = player.syncInfo;
  if (syncInfo?.syncErrorMs !== undefined) {
    elements.syncStatus.textContent = `Sync: ${syncInfo.syncErrorMs.toFixed(1)}ms`;
    elements.syncStatus.classList.toggle("synced", Math.abs(syncInfo.syncErrorMs) < 10);
  }
}

function disconnect() {
  if (syncUpdateInterval) clearInterval(syncUpdateInterval);
  syncUpdateInterval = null;
  if (progressUpdateInterval) clearInterval(progressUpdateInterval);
  progressUpdateInterval = null;
  if (player) {
    player.disconnect();
    player = null;
  }
  elements.playerCard.classList.add("hidden");
  elements.connectCard.classList.remove("hidden");
  elements.syncStatus.textContent = "—";
  elements.syncStatus.classList.remove("synced");
  setNowPlaying("—", "—");
  updateTimeline(0, 0);
  showError("");
}

loadSavedSettings();

elements.connectBtn.addEventListener("click", connect);
elements.serverUrlInput.addEventListener("keydown", (e) => { if (e.key === "Enter") connect(); });
elements.findServersBtn.addEventListener("click", findServers);
elements.disconnectBtn.addEventListener("click", disconnect);
elements.btnPrev.addEventListener("click", () => { if (player && supportedCommands.includes("previous")) try { player.sendCommand("previous"); } catch (_) {} });
elements.btnPlayPause.addEventListener("click", () => { if (!player) return; try { if (isPlaying) player.sendCommand("pause"); else player.sendCommand("play"); } catch (_) {} });
elements.btnNext.addEventListener("click", () => { if (player && supportedCommands.includes("next")) try { player.sendCommand("next"); } catch (_) {} });
elements.muteBtn.addEventListener("click", () => { if (!player) return; const m = !player.muted; player.setMuted(m); setMuteIcon(m); });
elements.volumeSlider.addEventListener("input", () => { if (player) player.setVolume(parseInt(elements.volumeSlider.value, 10)); });
