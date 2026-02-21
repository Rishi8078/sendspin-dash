/**
 * Sendspin Browser — Settings Panel (app.js)
 * Displays registering configuration and active Sendspin browsers via the MA API.
 */

const STORAGE_KEY_NAME = "sendspin-browser-player-name";
const STORAGE_KEY_PLAYER_ID = "sendspin-browser-player-id";
const STORAGE_KEY_REGISTERED = "sendspin-browser-registered";
const CONFIG_URL = "/api/sendspin_browser/config";

// ── Helpers ──

function getOrCreatePlayerId() {
  try {
    let id = localStorage.getItem(STORAGE_KEY_PLAYER_ID);
    if (id && id.length >= 8) return id;
    id = "sendspin-browser-" + Math.random().toString(36).slice(2) + Date.now().toString(36);
    localStorage.setItem(STORAGE_KEY_PLAYER_ID, id);
    return id;
  } catch (_) {
    return "sendspin-browser-" + Date.now();
  }
}

// ── DOM Refs ──

const registerToggle = document.getElementById("register-toggle");
const registerFields = document.getElementById("register-fields");
const playerNameInput = document.getElementById("player-name");
const browserIdInput = document.getElementById("browser-id");
const playersList = document.getElementById("players-list");

// ── Init ──

const myId = getOrCreatePlayerId();
browserIdInput.value = myId;

const savedName = localStorage.getItem(STORAGE_KEY_NAME) || "";
if (savedName) playerNameInput.value = savedName;

const wasRegistered = localStorage.getItem(STORAGE_KEY_REGISTERED) === "true";
if (wasRegistered) {
  registerToggle.checked = true;
  registerFields.classList.remove("hidden");
}

let maUrl = "";
let maToken = "";

// ── Events ──

registerToggle.addEventListener("change", () => {
  if (registerToggle.checked) {
    registerFields.classList.remove("hidden");
    localStorage.setItem(STORAGE_KEY_REGISTERED, "true");
  } else {
    registerFields.classList.add("hidden");
    localStorage.setItem(STORAGE_KEY_REGISTERED, "false");
  }
});

playerNameInput.addEventListener("input", () => {
  const name = playerNameInput.value.trim();
  if (name) {
    localStorage.setItem(STORAGE_KEY_NAME, name);
  }
});

// ── Polling: Music Assistant API ──

async function updatePlayersList() {
  if (!maUrl) return;

  try {
    const headers = {};
    if (maToken) {
      headers["Authorization"] = `Bearer ${maToken}`;
    }

    const res = await fetch(`${maUrl}/api/players`, { method: "GET", headers });
    if (!res.ok) return;
    const data = await res.json();

    // Filter for our browsers
    const browsers = Object.values(data).filter(p =>
      p.device_info && p.device_info.manufacturer === "Home Assistant"
    );

    if (browsers.length === 0) {
      playersList.innerHTML = '<div class="players-empty">No registered browsers yet.</div>';
      return;
    }

    playersList.innerHTML = "";

    for (const p of browsers) {
      const isSelf = p.player_id === myId;

      const row = document.createElement("div");
      row.className = "player-row" + (isSelf ? " is-self" : "");

      const icon = document.createElement("div");
      icon.className = "player-icon";
      icon.textContent = "🖥️";

      const details = document.createElement("div");
      details.className = "player-details";

      const name = document.createElement("span");
      name.className = "player-name";
      name.textContent = p.name || p.display_name || "Unknown";

      const meta = document.createElement("span");
      meta.className = "player-meta";
      meta.textContent = p.state === "playing" ? "Playing Audio" : p.state === "idle" ? "Online, Idle" : "Offline / Unavailable";

      details.appendChild(name);
      if (isSelf) {
        const badge = document.createElement("span");
        badge.className = "player-self-badge";
        badge.textContent = "This browser";
        details.appendChild(badge);
      }
      details.appendChild(meta);

      const status = document.createElement("div");
      const isOnline = p.state !== "unavailable";
      status.className = "player-status " + (isOnline ? "online" : "offline");
      if (p.state === "playing") {
        status.classList.add("pulse-animation"); // Let's add a pulse if playing!
      }

      row.appendChild(icon);
      row.appendChild(details);
      row.appendChild(status);
      playersList.appendChild(row);
    }
  } catch (_) { }
}

async function startPolling() {
  try {
    const res = await fetch(CONFIG_URL, { method: "GET" });
    if (res.ok) {
      const config = await res.json();
      maUrl = config.ma_url;
      maToken = config.ma_token;

      if (maUrl && maUrl.endsWith('/')) {
        maUrl = maUrl.slice(0, -1);
      }
    }
  } catch (_) { }

  updatePlayersList();
  setInterval(updatePlayersList, 5000);
}

startPolling();
