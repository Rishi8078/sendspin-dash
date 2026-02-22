import {
  LitElement,
  html,
  css,
} from "https://unpkg.com/lit@3.2.1/index.js?module";

const SK_NAME = "sendspin-browser-player-name";
const SK_ID = "sendspin-browser-player-id";
const SK_REG = "sendspin-browser-registered";

function getOrCreatePlayerId() {
  try {
    let id = localStorage.getItem(SK_ID);
    if (id && id.length >= 8) return id;
    id = "sendspin-browser-" + Math.random().toString(36).slice(2) + Date.now().toString(36);
    localStorage.setItem(SK_ID, id);
    return id;
  } catch (_) {
    return "sendspin-browser-" + Date.now();
  }
}

function timeAgo(ts) {
  if (!ts) return "never";
  const diff = Math.floor(Date.now() / 1000 - ts);
  if (diff < 10) return "just now";
  if (diff < 60) return diff + "s ago";
  if (diff < 3600) return Math.floor(diff / 60) + "m ago";
  if (diff < 86400) return Math.floor(diff / 3600) + "h ago";
  return Math.floor(diff / 86400) + "d ago";
}

class SendspinBrowserPanel extends LitElement {
  static get properties() {
    return {
      hass: { type: Object },
      narrow: { type: Boolean },
      panel: { type: Object },
      _registered: { type: Boolean },
      _playerName: { type: String },
      _players: { type: Array },
      _state: { type: Object },
    };
  }

  constructor() {
    super();
    this._playerId = getOrCreatePlayerId();
    this._registered = localStorage.getItem(SK_REG) === "true";
    this._playerName = localStorage.getItem(SK_NAME) || "";
    this._players = [];
    this._state = {};
    this._timer = null;
    this._prevPlayersJson = "";
  }

  connectedCallback() {
    super.connectedCallback();
    this._poll();
    this._fetchPlayers();
    this._timer = setInterval(() => {
      this._poll();
      this._fetchPlayers();
    }, 2000);
  }

  disconnectedCallback() {
    if (this._timer) {
      clearInterval(this._timer);
      this._timer = null;
    }
    super.disconnectedCallback();
  }

  async _fetchPlayers() {
    if (!this.hass) return;
    try {
      const res = await this.hass.callWS({ type: "sendspin_browser/players" });
      const players = (res && res.players) || [];
      const json = JSON.stringify(players);
      if (json === this._prevPlayersJson) return;
      this._prevPlayersJson = json;
      this._players = players;
    } catch (_) { }
  }

  _poll() {
    const s = window.sendspinState || {};
    const p = this._state;
    const changed =
      s.connected !== p.connected ||
      s.isPlaying !== p.isPlaying ||
      s.title !== p.title ||
      s.artist !== p.artist ||
      s.album !== p.album ||
      s.playbackState !== p.playbackState ||
      s.volume !== p.volume ||
      s.muted !== p.muted ||
      s.artworkUrl !== p.artworkUrl;

    const regFlag = localStorage.getItem(SK_REG) === "true";
    if (!changed && this._registered === regFlag) return;

    this._registered = regFlag;
    this._state = { ...s };
  }

  _handleRegisterToggle(e) {
    const isChecked = e.target.checked;
    this._registered = isChecked;
    localStorage.setItem(SK_REG, isChecked ? "true" : "false");

    // Unlock Web Audio Context *immediately* upon user interaction (the click that registers the device)
    if (isChecked && window.sendspinPlayerInfo && typeof window.sendspinPlayerInfo.unlockAudioContext === 'function') {
      console.log("[Sendspin Dash] User interaction detected (toggle). Unlocking AudioContext.");
      window.sendspinPlayerInfo.unlockAudioContext();
    }

    this._poll();
    setTimeout(() => this._fetchPlayers(), 1000);
  }

  _handleNameInput(e) {
    const n = e.target.value.trim();
    if (n) {
      this._playerName = n;
      localStorage.setItem(SK_NAME, n);
    }
  }

  _removePlayer(pid) {
    if (pid === this._playerId) {
      this._registered = false;
      localStorage.setItem(SK_REG, "false");
    }
    if (this.hass) {
      this.hass.callWS({ type: "sendspin_browser/unregister_player", player_id: pid }).catch(() => { });
    }
    setTimeout(() => this._fetchPlayers(), 300);
  }

  _cmd(name, params) {
    const p = window.sendspinPlayer;
    if (p && p.isConnected) {
      try {
        const ctx = p.audioProcessor && p.audioProcessor.getAudioContext();
        if (ctx && ctx.state !== "running") ctx.resume();
        const el = p.config && p.config.audioElement;
        if (el && el.paused) el.play().catch(() => { });
      } catch (_) { }
      try {
        p.sendCommand(name, params);
      } catch (_) { }
    }
  }

  static get styles() {
    return css`
      :host {
        display: block;
        height: 100%;
        min-height: 100%;
        background-color: var(--primary-background-color, #111111);
        color: var(--primary-text-color, #ffffff);
        font-family: var(--ha-font-family-body, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif);
        -webkit-font-smoothing: antialiased;
        --app-header-background-color: var(--sidebar-background-color);
        --app-header-text-color: var(--sidebar-text-color);
        --app-header-border-bottom: 1px solid var(--divider-color);
        --radius: 20px;
        --shadow-soft: 0 10px 30px rgba(0, 0, 0, 0.15);
        --shadow-hover: 0 14px 40px rgba(0, 0, 0, 0.25);
      }
      
      .content {
        max-width: 680px;
        margin: 0 auto;
        padding: 32px 24px;
        display: flex;
        flex-direction: column;
        gap: 32px;
      }
      
      .card {
        background: var(--ha-card-background, var(--card-background-color, #1e1e1e));
        border: 1px solid var(--divider-color, rgba(255, 255, 255, 0.04));
        border-radius: var(--radius);
        box-shadow: var(--shadow-soft);
        overflow: hidden;
      }
      
      /* --- SECTIONS (SETTINGS & LISTS) --- */
      .section-header {
        padding: 24px 24px 16px;
        border-bottom: 1px solid var(--divider-color, rgba(255, 255, 255, 0.04));
      }
      
      .section-title {
        font-size: 1.1rem;
        font-weight: 600;
        margin: 0;
        letter-spacing: -0.01em;
      }
      
      .row {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 20px 24px;
        gap: 24px;
      }
      
      .row-text {
        display: flex;
        flex-direction: column;
        gap: 4px;
        flex: 1;
      }
      
      .row-label {
        font-size: 1rem;
        font-weight: 500;
        color: var(--primary-text-color);
      }
      
      .row-sub {
        font-size: 0.85rem;
        color: var(--secondary-text-color, #888);
        line-height: 1.4;
      }
      
      .row-value {
        font-size: 0.9rem;
        font-weight: 500;
        color: var(--secondary-text-color, #888);
      }
      
      /* --- TOGGLE --- */
      .toggle {
        position: relative;
        display: inline-block;
        width: 52px;
        height: 30px;
        flex-shrink: 0;
      }
      .toggle input { opacity: 0; width: 0; height: 0; }
      .toggle-slider {
        position: absolute; cursor: pointer; inset: 0;
        background: var(--disabled-color, #444);
        border-radius: 30px; transition: background 0.3s;
      }
      .toggle-slider::before {
        content: ""; position: absolute; height: 24px; width: 24px;
        left: 3px; bottom: 3px; background: #fff;
        border-radius: 50%; transition: transform 0.3s cubic-bezier(0.2, 0.8, 0.2, 1);
        box-shadow: 0 2px 4px rgba(0,0,0,0.2);
      }
      .toggle input:checked + .toggle-slider { background: var(--primary-color, #03a9f4); }
      .toggle input:checked + .toggle-slider::before { transform: translateX(22px); }
      
      /* --- INPUTS --- */
      .input-row {
        padding: 0 24px 24px;
      }
      
      .field-input {
        width: 100%;
        background: rgba(0, 0, 0, 0.2);
        border: 1px solid var(--divider-color, rgba(255, 255, 255, 0.08));
        border-radius: 12px;
        padding: 16px;
        font-family: inherit;
        font-size: 1rem;
        color: var(--primary-text-color);
        outline: none;
        box-sizing: border-box;
        transition: border-color 0.2s, box-shadow 0.2s;
      }
      
      .field-input:focus {
        border-color: var(--primary-color, #03a9f4);
        background: rgba(0, 0, 0, 0.3);
        box-shadow: 0 0 0 3px rgba(var(--rgb-primary-color, 3, 169, 244), 0.15);
      }

      /* --- PLAYER LIST --- */
      .players-list {
        display: flex;
        flex-direction: column;
      }
      
      .player-row {
        display: flex;
        align-items: center;
        gap: 16px;
        padding: 16px 24px;
        border-top: 1px solid var(--divider-color, rgba(255, 255, 255, 0.04));
        transition: background 0.2s;
      }
      
      .player-row:first-child { border-top: none; }
      .player-row:hover { background: rgba(255, 255, 255, 0.02); }
      .player-row.is-me { background: rgba(var(--rgb-primary-color, 3, 169, 244), 0.04); }
      
      .device-icon {
        width: 44px;
        height: 44px;
        border-radius: 12px;
        background: rgba(255, 255, 255, 0.05);
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 1.4rem;
        color: var(--secondary-text-color);
        flex-shrink: 0;
      }
      
      .player-row.is-me .device-icon {
        background: rgba(var(--rgb-primary-color, 3, 169, 244), 0.1);
        color: var(--primary-color, #03a9f4);
      }
      
      .player-info {
        flex: 1;
        min-width: 0;
      }
      
      .player-name {
        font-size: 1rem;
        font-weight: 500;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
        margin-bottom: 2px;
      }
      
      .player-meta {
        font-size: 0.85rem;
        color: var(--secondary-text-color, #888);
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
        display: flex;
        align-items: center;
        gap: 6px;
      }
      
      .status-dot-small {
        width: 6px;
        height: 6px;
        border-radius: 50%;
        flex-shrink: 0;
      }
      .status-dot-small.connected { background: var(--success-color, #4caf50); }
      .status-dot-small.warn { background: var(--warning-color, #ff9800); }
      .status-dot-small.offline { background: var(--secondary-text-color, #666); }
      
      .remove-btn {
        background: none;
        border: none;
        color: var(--secondary-text-color, #666);
        width: 32px;
        height: 32px;
        border-radius: 50%;
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 1.2rem;
        cursor: pointer;
        transition: all 0.2s;
        opacity: 0;
        transform: translateX(10px);
      }
      
      .player-row:hover .remove-btn {
        opacity: 0.6;
        transform: translateX(0);
      }
      
      .remove-btn:hover {
        opacity: 1 !important;
        background: rgba(255, 255, 255, 0.1);
        color: var(--error-color, #f44336);
      }
      
      .empty-msg {
        padding: 32px;
        text-align: center;
        color: var(--secondary-text-color, #888);
        font-size: 0.95rem;
      }
    `;
  }

  render() {
    const s = this._state;
    const connected = s.connected;

    let statusText = "Offline";
    if (connected) statusText = "Connected";
    else if (this._registered) statusText = "Connecting\u2026";

    const showMedia = connected && s.title;
    const isPlaying = s.isPlaying;

    return html`
      <ha-top-app-bar-fixed>
        <ha-menu-button slot="navigationIcon" .hass=${this.hass} .narrow=${this.narrow}></ha-menu-button>
        <div slot="title">Sendspin Dash</div>
        
        <div class="content">
          
          <!-- ACTIVE PLAYERS -->
          <div class="card">
            <div class="section-header">
              <h2 class="section-title">Active Players</h2>
            </div>
            <div class="players-list">
              ${this._players.length === 0
        ? html`<div class="empty-msg">No players discovered yet. Enable a browser below to register it.</div>`
        : this._players.map(p => {
          const isMe = p.player_id === this._playerId;
          const statusClass = p.status === "connected" ? "connected" : (p.status === "online" ? "warn" : "offline");
          const statusLabel = p.status === "connected" ? "Connected" : (p.status === "online" ? "Online" : "Offline");
          const seen = timeAgo(p.last_seen);

          const ua = p.user_agent || "";
          let browser = "Browser";
          if (/Edg\//.test(ua)) browser = "Edge";
          else if (/Chrome\//.test(ua)) browser = "Chrome";
          else if (/Firefox\//.test(ua)) browser = "Firefox";
          else if (/Safari\//.test(ua) && !/Chrome\//.test(ua)) browser = "Safari";

          let os = "";
          let icon = "mdi:desktop-classic"; // Desktop fallback
          if (/Android/.test(ua)) { os = "Android"; icon = "mdi:cellphone"; }
          else if (/iPhone|iPad/.test(ua)) { os = "iOS"; icon = "mdi:apple-ios"; }
          else if (/Linux/.test(ua)) { os = "Linux"; icon = "mdi:linux"; }
          else if (/Mac OS/.test(ua)) { os = "macOS"; icon = "mdi:apple"; }
          else if (/Windows/.test(ua)) { os = "Windows"; icon = "mdi:microsoft-windows"; }

          const device = browser + (os ? " on " + os : "");

          return html`
                      <div class="player-row ${isMe ? 'is-me' : ''}">
                        <div class="device-icon">
                          <ha-icon icon="${icon}"></ha-icon>
                        </div>
                        <div class="player-info">
                          <div class="player-name">${p.name || "Unnamed Browser"}${isMe ? html`<span class="me-badge">This browser</span>` : ""}</div>
                          <div class="player-meta">
                            <div class="status-dot-small ${statusClass}"></div>
                            ${statusLabel} &middot; ${device} &middot; ${seen}
                          </div>
                        </div>
                        <button class="remove-btn" title="Remove player" @click=${() => this._removePlayer(p.player_id)}>&times;</button>
                      </div>
                    `;
        })
      }
            </div>
          </div>

          <!-- DEVICE SETTINGS -->
          <div class="card">
            <div class="section-header">
              <h2 class="section-title">This Browser</h2>
            </div>
            
            <div class="row" style="padding-bottom: ${this._registered ? '20px' : '12px'};">
              <div class="row-text">
                <span class="row-label">Enable Audio Engine</span>
                <span class="row-sub">Register this browser as an active playback target</span>
              </div>
              <label class="toggle">
                <input type="checkbox" .checked=${this._registered} @change=${this._handleRegisterToggle} />
                <span class="toggle-slider"></span>
              </label>
            </div>

            ${!this._registered ? html`
              <div class="row" style="border-top: 1px solid var(--divider-color, rgba(255,255,255,0.04)); padding-top: 16px;">
                <div class="row-text">
                  <span class="row-label">Player Name</span>
                  <span class="row-sub">Friendly name for this device in Music Assistant</span>
                </div>
              </div>
              <div class="input-row">
                <input type="text" class="field-input" placeholder="e.g. Living Room Tablet" autocomplete="off" 
                  .value=${this._playerName} @input=${this._handleNameInput} />
              </div>
              
              <div class="row" style="border-top: 1px solid var(--divider-color, rgba(255,255,255,0.04)); padding-top: 16px; padding-bottom: 16px;">
                <div class="row-text">
                  <span class="row-label">Hardware ID</span>
                  <span class="row-sub" style="font-family: monospace; font-size: 0.75rem; margin-top: 4px;">${this._playerId}</span>
                </div>
              </div>
            ` : html`
              <div class="row" style="border-top: 1px solid var(--divider-color, rgba(255,255,255,0.04));">
                <div class="row-text">
                  <span class="row-label">Registered As</span>
                  <span class="row-value" style="color: var(--primary-color, #03a9f4); font-weight: 600;">${this._playerName || "Unnamed Browser"}</span>
                </div>
              </div>
            `}
          </div>

        </div>
      </ha-top-app-bar-fixed>
    `;
  }
}

customElements.define("sendspin-browser-panel", SendspinBrowserPanel);
