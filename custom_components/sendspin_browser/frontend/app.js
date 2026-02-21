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
  serverUrlInput: document.getElementById("server-url"),
  findServersBtn: document.getElementById("find-servers-btn"),
  serversList: document.getElementById("servers-list"),
  connectError: document.getElementById("connect-error"),
  discoveryHint: document.getElementById("discovery-hint"),
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
    showError("Please enter a server URL (e.g. http://host:8927)");
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
      onStateChange: () => {},
    });
    await player.connect();
    saveLastUrl(baseUrl);
    elements.registeredName.textContent = clientName || "Browser player";
    elements.registeredServer.textContent = baseUrl;
    elements.connectCard.classList.add("hidden");
    elements.registeredCard.classList.remove("hidden");
    connectionCheckInterval = setInterval(() => {
      if (player && !player.isConnected) disconnect();
    }, 2000);
  } catch (err) {
    console.error("Connection failed:", err);
    showError(err?.message || "Connection failed");
    player = null;
  } finally {
    elements.connectBtn.disabled = false;
    elements.connectBtn.textContent = "Register & connect";
  }
}

function disconnect() {
  if (connectionCheckInterval) {
    clearInterval(connectionCheckInterval);
    connectionCheckInterval = null;
  }
  if (player) {
    player.disconnect();
    player = null;
  }
  elements.registeredCard.classList.add("hidden");
  elements.connectCard.classList.remove("hidden");
  showError("");
}

loadSavedSettings();

elements.connectBtn.addEventListener("click", connect);
elements.serverUrlInput.addEventListener("keydown", (e) => { if (e.key === "Enter") connect(); });
elements.findServersBtn.addEventListener("click", findServers);
elements.disconnectBtn.addEventListener("click", disconnect);
