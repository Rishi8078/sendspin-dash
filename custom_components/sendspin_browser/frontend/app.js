/**
 * Sendspin Browser Player (Home Assistant panel).
 * Register this tab as a Sendspin player; control playback from Music Assistant or another controller.
 */

const STORAGE_KEY_URL = "sendspin-browser-player-last-url";
const STORAGE_KEY_NAME = "sendspin-browser-player-name";
const STORAGE_KEY_PLAYER_ID = "sendspin-browser-player-id";
const DISCOVERY_URL = "/api/sendspin_browser/servers";

const elements = {
  connectCard: document.getElementById("connect-card"),
  playerNameInput: document.getElementById("player-name"),
  connectError: document.getElementById("connect-error"),
  connectBtn: document.getElementById("connect-btn"),
  registeredCard: document.getElementById("registered-card"),
  registeredName: document.getElementById("registered-name"),
  registeredServer: document.getElementById("registered-server"),
  disconnectBtn: document.getElementById("disconnect-btn"),
};

let player = null;
let connectionCheckInterval = null;

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
    const name = params.player_name || localStorage.getItem(STORAGE_KEY_NAME) || "";
    if (name) elements.playerNameInput.value = name;
  } catch (_) { }
}

function saveLastUrl(url) {
  try {
    if (url) localStorage.setItem(STORAGE_KEY_URL, url);
  } catch (_) { }
}

function savePlayerName(name) {
  try {
    if (name) localStorage.setItem(STORAGE_KEY_NAME, name);
  } catch (_) { }
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



async function connect() {
  const params = getUrlParams();
  const baseUrl = normalizeBaseUrl(params.server_url || localStorage.getItem(STORAGE_KEY_URL));

  if (!baseUrl) {
    showError("Server URL is missing. Please configure the Sendspin Browser integration in Home Assistant.");
    return;
  }
  showError("");
  elements.connectBtn.disabled = true;
  elements.connectBtn.textContent = "Saving…";

  try {
    const clientName = getPlayerName();
    if (clientName) savePlayerName(clientName);

    // UI Panel does not connect to the SDK anymore to prevent loops.
    // We just save the settings, and let connector.js handle the connection lock.
    saveLastUrl(baseUrl);

    elements.registeredName.textContent = clientName || "Browser player";
    elements.registeredServer.textContent = baseUrl;
    elements.connectCard.classList.add("hidden");
    elements.registeredCard.classList.remove("hidden");
  } catch (err) {
    showError(err?.message || "Registration failed");
  } finally {
    elements.connectBtn.disabled = false;
    elements.connectBtn.textContent = "Save Settings";
  }
}

function disconnect() {
  elements.registeredCard.classList.add("hidden");
  elements.connectCard.classList.remove("hidden");
  showError("");
}

const PLAYERS_URL = "/api/sendspin_browser/players";
let playersInterval = null;

async function updateActivePlayers() {
  try {
    const res = await fetch(PLAYERS_URL, { method: "GET" });
    if (!res.ok) return;
    const playersMap = await res.json();

    const activePlayers = Array.isArray(playersMap) ? playersMap : Object.values(playersMap);
    const myId = getOrCreatePlayerId();

    // Check if this browser is currently recognized as actively connected by Home Assistant
    const amIConnected = activePlayers.some(p => p.player_id === myId);

    if (amIConnected && elements.connectCard.classList.contains("hidden") === false) {
      elements.connectCard.classList.add("hidden");
      elements.registeredCard.classList.remove("hidden");
      elements.registeredName.textContent = getPlayerName() || "Browser player";

      const params = getUrlParams();
      elements.registeredServer.textContent = normalizeBaseUrl(params.server_url || localStorage.getItem(STORAGE_KEY_URL));
    } else if (!amIConnected && elements.registeredCard.classList.contains("hidden") === false) {
      elements.registeredCard.classList.add("hidden");
      elements.connectCard.classList.remove("hidden");
    }

    // Filter out our own player ID for the "Other dashboards" list
    const otherPlayers = activePlayers.filter(p => p.player_id !== myId);

    const listElement = document.getElementById("active-players-list");
    const cardElement = document.getElementById("active-players-card");

    if (otherPlayers.length === 0) {
      listElement.innerHTML = '<div class="player-item-empty">No other connected dashboards found.</div>';
      cardElement.classList.remove("hidden");
      return;
    }

    cardElement.classList.remove("hidden");
    listElement.innerHTML = "";

    for (const p of otherPlayers) {
      const item = document.createElement("div");
      item.className = "player-item";

      const info = document.createElement("div");
      info.className = "player-info";

      const nameEl = document.createElement("span");
      nameEl.className = "player-item-name";
      nameEl.textContent = p.name || "Unknown Browser";

      const idEl = document.createElement("span");
      idEl.className = "player-item-id";
      idEl.textContent = p.player_id;

      info.appendChild(nameEl);
      info.appendChild(idEl);

      const statusWrap = document.createElement("div");
      statusWrap.title = "Connected";
      const statusIcon = document.createElement("div");
      statusIcon.className = "player-item-status";
      statusWrap.appendChild(statusIcon);

      item.appendChild(info);
      item.appendChild(statusWrap);

      listElement.appendChild(item);
    }
  } catch (_) { }
}

loadSavedSettings();

elements.connectBtn.addEventListener("click", connect);
elements.playerNameInput.addEventListener("keydown", (e) => { if (e.key === "Enter") connect(); });
elements.disconnectBtn.addEventListener("click", disconnect);

// Start polling for other active players
updateActivePlayers();
playersInterval = setInterval(updateActivePlayers, 5000);
