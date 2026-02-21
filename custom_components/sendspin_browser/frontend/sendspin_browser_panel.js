/**
 * Sendspin Browser Player — Home Assistant Panel
 * Native LitElement Custom Element that inherits HA theme CSS variables.
 * No iframe needed — renders directly inside HA's Shadow DOM.
 */

const STORAGE_KEY_NAME = "sendspin-browser-player-name";
const STORAGE_KEY_PLAYER_ID = "sendspin-browser-player-id";
const STORAGE_KEY_REGISTERED = "sendspin-browser-registered";
const PLAYERS_URL = "/api/sendspin_browser/players";

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

class SendspinBrowserPanel extends HTMLElement {
  constructor() {
    super();
    this._hass = null;
    this._playerId = getOrCreatePlayerId();
    this._registered = localStorage.getItem(STORAGE_KEY_REGISTERED) === "true";
    this._playerName = localStorage.getItem(STORAGE_KEY_NAME) || "";
    this._players = [];
    this._pollInterval = null;
    this.attachShadow({ mode: "open" });
  }

  set hass(hass) {
    this._hass = hass;
  }

  connectedCallback() {
    this._render();
    this._bindEvents();
    this._startPolling();
  }

  disconnectedCallback() {
    if (this._pollInterval) {
      clearInterval(this._pollInterval);
      this._pollInterval = null;
    }
  }

  _startPolling() {
    this._fetchPlayers();
    this._pollInterval = setInterval(() => this._fetchPlayers(), 5000);
  }

  async _fetchPlayers() {
    try {
      const res = await fetch(PLAYERS_URL, { method: "GET", credentials: "same-origin" });
      if (!res.ok) return;
      const data = await res.json();
      this._players = Object.values(data).filter(
        (p) => p.player_id && p.player_id.startsWith("sendspin-browser-")
      );
    } catch (_) {
      this._players = [];
    }
    this._renderPlayersList();
  }

  _bindEvents() {
    const root = this.shadowRoot;
    const toggle = root.getElementById("register-toggle");
    const fields = root.getElementById("register-fields");
    const nameInput = root.getElementById("player-name");

    if (toggle) {
      toggle.addEventListener("change", () => {
        this._registered = toggle.checked;
        if (this._registered) {
          fields.classList.remove("hidden");
          localStorage.setItem(STORAGE_KEY_REGISTERED, "true");
        } else {
          fields.classList.add("hidden");
          localStorage.setItem(STORAGE_KEY_REGISTERED, "false");
        }
      });
    }

    if (nameInput) {
      nameInput.addEventListener("input", () => {
        const name = nameInput.value.trim();
        if (name) {
          this._playerName = name;
          localStorage.setItem(STORAGE_KEY_NAME, name);
        }
      });
    }
  }

  _renderPlayersList() {
    const container = this.shadowRoot.getElementById("players-list");
    if (!container) return;

    if (this._players.length === 0) {
      container.innerHTML = '<div class="players-empty">No active players.</div>';
      return;
    }

    container.innerHTML = "";

    for (const p of this._players) {
      const isSelf = p.player_id === this._playerId;

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
      meta.textContent =
        p.state === "playing"
          ? "Playing Audio"
          : p.state === "idle"
            ? "Online · Idle"
            : "Offline";

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

      row.appendChild(icon);
      row.appendChild(details);
      row.appendChild(status);
      container.appendChild(row);
    }
  }

  _render() {
    const root = this.shadowRoot;
    root.innerHTML = `
      <style>
        :host {
          display: block;
          height: 100%;
          min-height: 100%;
          background: var(--primary-background-color, #1c1c1c);
          color: var(--primary-text-color, #e3e3e3);
          font-family: var(--ha-font-family-body, system-ui, -apple-system, sans-serif);
          -webkit-font-smoothing: antialiased;
        }

        .app {
          max-width: 600px;
          margin: 0 auto;
          padding: 16px;
          display: flex;
          flex-direction: column;
          gap: 16px;
        }

        /* ── Section Card ── */
        .section-card {
          background: var(--ha-card-background, var(--card-background-color, #2a2a2a));
          border: 1px solid var(--divider-color, rgba(255, 255, 255, 0.08));
          border-radius: var(--ha-card-border-radius, 12px);
          overflow: hidden;
        }

        .section-title {
          font-size: 1.1rem;
          font-weight: 600;
          padding: 20px 20px 0;
          color: var(--primary-text-color, #e3e3e3);
        }

        /* ── Card Row (Register toggle) ── */
        .card-row {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 16px 20px;
          gap: 16px;
        }

        .row-text {
          display: flex;
          flex-direction: column;
          gap: 2px;
          flex: 1;
        }

        .row-label {
          font-size: 1rem;
          font-weight: 500;
          color: var(--primary-text-color, #e3e3e3);
        }

        .row-sub {
          font-size: 0.85rem;
          color: var(--secondary-text-color, #9e9e9e);
          line-height: 1.4;
        }

        /* ── Toggle Switch ── */
        .toggle {
          position: relative;
          display: inline-block;
          width: 48px;
          height: 26px;
          flex-shrink: 0;
        }

        .toggle input {
          opacity: 0;
          width: 0;
          height: 0;
        }

        .toggle-slider {
          position: absolute;
          cursor: pointer;
          top: 0; left: 0; right: 0; bottom: 0;
          background-color: var(--disabled-color, #555);
          border-radius: 26px;
          transition: background-color 0.3s;
        }

        .toggle-slider::before {
          content: "";
          position: absolute;
          height: 20px;
          width: 20px;
          left: 3px;
          bottom: 3px;
          background-color: white;
          border-radius: 50%;
          transition: transform 0.3s;
        }

        .toggle input:checked + .toggle-slider {
          background-color: var(--primary-color, #03a9f4);
        }

        .toggle input:checked + .toggle-slider::before {
          transform: translateX(22px);
        }

        /* ── Register Fields ── */
        .register-fields {
          padding: 0 20px 20px;
          display: flex;
          flex-direction: column;
          gap: 16px;
          border-top: 1px solid var(--divider-color, rgba(255, 255, 255, 0.06));
          padding-top: 16px;
        }

        .register-fields.hidden {
          display: none;
        }

        .field-group {
          display: flex;
          flex-direction: column;
          gap: 4px;
        }

        .field-label {
          font-size: 0.9rem;
          font-weight: 600;
          color: var(--primary-text-color, #e3e3e3);
        }

        .field-hint {
          font-size: 0.8rem;
          color: var(--secondary-text-color, #9e9e9e);
          margin-bottom: 4px;
        }

        .field-input {
          width: 100%;
          background: var(--input-fill-color, rgba(0, 0, 0, 0.15));
          border: 1px solid var(--divider-color, rgba(255, 255, 255, 0.08));
          border-radius: 8px;
          padding: 12px 14px;
          font-family: inherit;
          font-size: 0.95rem;
          color: var(--primary-text-color, #e3e3e3);
          outline: none;
          transition: border-color 0.2s, box-shadow 0.2s;
          box-sizing: border-box;
        }

        .field-input:focus {
          border-color: var(--primary-color, #03a9f4);
          box-shadow: 0 0 0 2px rgba(var(--rgb-primary-color, 3, 169, 244), 0.2);
        }

        .field-input[readonly] {
          opacity: 0.7;
          cursor: default;
          color: var(--secondary-text-color, #9e9e9e);
          font-family: monospace;
          font-size: 0.85rem;
        }

        /* ── Players List ── */
        .players-list {
          display: flex;
          flex-direction: column;
        }

        .players-empty {
          padding: 24px 20px;
          text-align: center;
          font-size: 0.9rem;
          color: var(--secondary-text-color, #9e9e9e);
        }

        .player-row {
          display: flex;
          align-items: center;
          padding: 14px 20px;
          gap: 14px;
          border-top: 1px solid var(--divider-color, rgba(255, 255, 255, 0.06));
          transition: background 0.15s;
        }

        .player-row:hover {
          background: rgba(var(--rgb-primary-text-color, 255, 255, 255), 0.03);
        }

        .player-icon {
          width: 40px;
          height: 40px;
          border-radius: 50%;
          background: rgba(var(--rgb-primary-color, 3, 169, 244), 0.15);
          display: flex;
          align-items: center;
          justify-content: center;
          flex-shrink: 0;
          font-size: 1.1rem;
        }

        .player-details {
          flex: 1;
          display: flex;
          flex-direction: column;
          gap: 2px;
          min-width: 0;
        }

        .player-name {
          font-size: 1rem;
          font-weight: 500;
          color: var(--primary-text-color, #e3e3e3);
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }

        .player-meta {
          font-size: 0.8rem;
          color: var(--secondary-text-color, #9e9e9e);
        }

        .player-status {
          width: 10px;
          height: 10px;
          border-radius: 50%;
          flex-shrink: 0;
        }

        .player-status.online {
          background: var(--success-color, #4caf50);
          box-shadow: 0 0 6px rgba(76, 175, 80, 0.4);
        }

        .player-status.offline {
          background: var(--secondary-text-color, #9e9e9e);
          opacity: 0.5;
        }

        .player-row.is-self {
          background: rgba(var(--rgb-primary-color, 3, 169, 244), 0.06);
        }

        .player-self-badge {
          font-size: 0.7rem;
          font-weight: 600;
          color: var(--primary-color, #03a9f4);
          text-transform: uppercase;
          letter-spacing: 0.04em;
        }
      </style>

      <div class="app">
        <!-- ── This Browser ── -->
        <div class="section-card">
          <h2 class="section-title">This Browser</h2>

          <div class="card-row">
            <div class="row-text">
              <span class="row-label">Register</span>
              <span class="row-sub">Enable this browser as a player in Music Assistant</span>
            </div>
            <label class="toggle">
              <input type="checkbox" id="register-toggle" ${this._registered ? "checked" : ""} />
              <span class="toggle-slider"></span>
            </label>
          </div>

          <div id="register-fields" class="register-fields ${this._registered ? "" : "hidden"}">
            <div class="field-group">
              <label class="field-label" for="player-name">Player Name</label>
              <span class="field-hint">A friendly name for this browser device.</span>
              <input type="text" id="player-name" class="field-input"
                placeholder="e.g. Living Room Tablet" autocomplete="off"
                value="${this._playerName}" />
            </div>

            <div class="field-group">
              <label class="field-label">Browser ID</label>
              <span class="field-hint">A unique identifier for this browser-device combination.</span>
              <input type="text" id="browser-id" class="field-input" readonly
                value="${this._playerId}" />
            </div>
          </div>
        </div>

        <!-- ── Active Players ── -->
        <div class="section-card">
          <h2 class="section-title">Active Players</h2>
          <div id="players-list" class="players-list">
            <div class="players-empty">No active players.</div>
          </div>
        </div>
      </div>
    `;
  }
}

customElements.define("sendspin-browser-panel", SendspinBrowserPanel);
