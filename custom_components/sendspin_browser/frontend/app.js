/**
 * Sendspin Browser — Settings Panel (app.js)
 * Pure status dashboard, no SDK connection. connector.js handles the background connection.
 */

const STORAGE_KEY_URL = "sendspin-browser-player-last-url";
const STORAGE_KEY_NAME = "sendspin-browser-player-name";
const STORAGE_KEY_PLAYER_ID = "sendspin-browser-player-id";
const STORAGE_KEY_REGISTERED = "sendspin-browser-registered";
const PLAYERS_URL = "/api/sendspin_browser/players";

// ── Helpers ──

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

function timeAgo(unixSeconds) {
  const diff = Math.floor(Date.now() / 1000 - unixSeconds);
  if (diff < 5) return "Just now";
  if (diff < 60) return `${diff} seconds ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)} minutes ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)} hours ago`;
  if (diff < 2592000) return `${Math.floor(diff / 86400)} days ago`;
  return `${Math.floor(diff / 2592000)} months ago`;
}

function getPlayerName() {
  const el = document.getElementById("player-name");
  return el ? el.value.trim() : "";
}

// ── DOM Refs ──

const registerToggle = document.getElementById("register-toggle");
const registerFields = document.getElementById("register-fields");
const playerNameInput = document.getElementById("player-name");
const browserIdInput = document.getElementById("browser-id");
const connectError = document.getElementById("connect-error");
const playersList = document.getElementById("players-list");

// ── Init ──

const myId = getOrCreatePlayerId();
browserIdInput.value = myId;

// Restore saved state
const savedName = localStorage.getItem(STORAGE_KEY_NAME) || "";
if (savedName) playerNameInput.value = savedName;

const wasRegistered = localStorage.getItem(STORAGE_KEY_REGISTERED) === "true";
if (wasRegistered) {
  registerToggle.checked = true;
  registerFields.classList.remove("hidden");
}

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

// ── Polling: Registered Players ──

async function updatePlayersList() {
  try {
    const res = await fetch(PLAYERS_URL, { method: "GET" });
    if (!res.ok) return;
    const data = await res.json();
    const players = Array.isArray(data) ? data : Object.values(data);

    if (players.length === 0) {
      playersList.innerHTML = '<div class="players-empty">No registered players yet.</div>';
      return;
    }

    playersList.innerHTML = "";

    for (const p of players) {
      const isSelf = p.player_id === myId;

      const row = document.createElement("div");
      row.className = "player-row" + (isSelf ? " is-self" : "");

      // Icon
      const icon = document.createElement("div");
      icon.className = "player-icon";
      icon.textContent = "🖥️";

      // Details
      const details = document.createElement("div");
      details.className = "player-details";

      const name = document.createElement("span");
      name.className = "player-name";
      name.textContent = p.name || "Unknown";

      const meta = document.createElement("span");
      meta.className = "player-meta";
      meta.textContent = "Last connected: " + timeAgo(p.last_seen);

      details.appendChild(name);
      if (isSelf) {
        const badge = document.createElement("span");
        badge.className = "player-self-badge";
        badge.textContent = "This browser";
        details.appendChild(badge);
      }
      details.appendChild(meta);

      // Status dot
      const status = document.createElement("div");
      const isOnline = (Date.now() / 1000 - p.last_seen) < 15;
      status.className = "player-status " + (isOnline ? "online" : "offline");

      row.appendChild(icon);
      row.appendChild(details);
      row.appendChild(status);
      playersList.appendChild(row);
    }
  } catch (_) { }
}

// Start polling
updatePlayersList();
setInterval(updatePlayersList, 5000);
