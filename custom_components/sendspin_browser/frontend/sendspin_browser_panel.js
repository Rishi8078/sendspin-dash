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
    this._registered = e.target.checked;
    localStorage.setItem(SK_REG, this._registered ? "true" : "false");
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
        background: var(--primary-background-color, #1c1c1c);
        color: var(--primary-text-color, #e3e3e3);
        font-family: var(--ha-font-family-body, system-ui, -apple-system, sans-serif);
        -webkit-font-smoothing: antialiased;
        --app-header-background-color: var(--sidebar-background-color);
        --app-header-text-color: var(--sidebar-text-color);
        --app-header-border-bottom: 1px solid var(--divider-color);
        --radius: var(--ha-config-card-border-radius, 12px);
      }
      .content {
        max-width: 600px;
        margin: 0 auto;
        padding: 16px;
        display: flex;
        flex-direction: column;
        gap: 16px;
      }
      .card {
        background: var(--ha-card-background, var(--card-background-color, #2a2a2a));
        border: 1px solid var(--divider-color, rgba(255, 255, 255, 0.08));
        border-radius: var(--radius);
        overflow: hidden;
      }
      .card-title {
        font-size: 1.1rem;
        font-weight: 600;
        padding: 20px 20px 0;
        margin: 0;
        color: var(--primary-text-color);
      }
      .row {
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
      }
      .row-sub {
        font-size: 0.85rem;
        color: var(--secondary-text-color, #9e9e9e);
        line-height: 1.4;
      }
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
        inset: 0;
        background: var(--disabled-color, #555);
        border-radius: 26px;
        transition: background 0.3s;
      }
      .toggle-slider::before {
        content: "";
        position: absolute;
        height: 20px;
        width: 20px;
        left: 3px;
        bottom: 3px;
        background: #fff;
        border-radius: 50%;
        transition: transform 0.3s;
      }
      .toggle input:checked + .toggle-slider {
        background: var(--primary-color, #03a9f4);
      }
      .toggle input:checked + .toggle-slider::before {
        transform: translateX(22px);
      }
      .field-wrap {
        padding: 0 20px 16px;
      }
      .field-input {
        width: 100%;
        background: var(--input-fill-color, rgba(0, 0, 0, 0.15));
        border: 1px solid var(--divider-color, rgba(255, 255, 255, 0.08));
        border-radius: 8px;
        padding: 12px 14px;
        font-family: inherit;
        font-size: 0.95rem;
        color: var(--primary-text-color);
        outline: none;
        box-sizing: border-box;
        transition: border-color 0.2s;
      }
      .field-input:focus {
        border-color: var(--primary-color, #03a9f4);
        box-shadow: 0 0 0 2px rgba(var(--rgb-primary-color, 3, 169, 244), 0.2);
      }
      .id-row {
        padding: 12px 20px;
        border-top: 1px solid var(--divider-color, rgba(255, 255, 255, 0.06));
        display: flex;
        gap: 8px;
        align-items: center;
      }
      .id-label {
        font-size: 0.8rem;
        font-weight: 600;
        color: var(--secondary-text-color);
      }
      .id-val {
        font-size: 0.75rem;
        font-family: monospace;
        color: var(--secondary-text-color);
        opacity: 0.7;
      }
      .status-dot {
        width: 12px;
        height: 12px;
        border-radius: 50%;
        flex-shrink: 0;
        transition: background 0.3s;
      }
      .status-dot.connected {
        background: var(--success-color, #4caf50);
        box-shadow: 0 0 8px rgba(76, 175, 80, 0.5);
      }
      .status-dot.offline {
        background: var(--secondary-text-color, #9e9e9e);
        opacity: 0.5;
      }
      .player-row {
        display: flex;
        align-items: center;
        gap: 12px;
        padding: 12px 20px;
        border-top: 1px solid var(--divider-color, rgba(255, 255, 255, 0.06));
      }
      .player-row.is-me {
        background: rgba(var(--rgb-primary-color, 3, 169, 244), 0.06);
      }
      .player-dot {
        width: 10px;
        height: 10px;
        border-radius: 50%;
        flex-shrink: 0;
      }
      .player-dot.connected {
        background: var(--success-color, #4caf50);
        box-shadow: 0 0 6px rgba(76, 175, 80, 0.4);
      }
      .player-dot.warn {
        background: var(--warning-color, #ff9800);
        box-shadow: 0 0 6px rgba(255, 152, 0, 0.4);
      }
      .player-dot.offline {
        background: var(--secondary-text-color, #9e9e9e);
        opacity: 0.4;
      }
      .player-info {
        flex: 1;
        min-width: 0;
      }
      .player-name {
        font-size: 0.95rem;
        font-weight: 500;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }
      .me-badge {
        font-size: 0.7rem;
        font-weight: 600;
        color: var(--primary-color, #03a9f4);
        background: rgba(var(--rgb-primary-color, 3, 169, 244), 0.12);
        padding: 2px 6px;
        border-radius: 4px;
        margin-left: 6px;
        vertical-align: middle;
      }
      .player-meta {
        font-size: 0.8rem;
        color: var(--secondary-text-color, #9e9e9e);
        margin-top: 2px;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }
      .remove-btn {
        background: none;
        border: none;
        color: var(--secondary-text-color, #9e9e9e);
        font-size: 1.2rem;
        cursor: pointer;
        padding: 4px 8px;
        border-radius: 4px;
        opacity: 0.5;
        transition: opacity 0.15s, color 0.15s;
        flex-shrink: 0;
      }
      .remove-btn:hover {
        opacity: 1;
        color: var(--error-color, #f44336);
      }
      .empty-msg {
        padding: 16px 20px;
        font-size: 0.9rem;
        color: var(--secondary-text-color, #9e9e9e);
        text-align: center;
      }
      .np {
        padding: 16px 20px;
        display: flex;
        gap: 16px;
        align-items: center;
        border-top: 1px solid var(--divider-color, rgba(255, 255, 255, 0.06));
      }
      .np-art {
        width: 64px;
        height: 64px;
        border-radius: 8px;
        object-fit: cover;
        flex-shrink: 0;
      }
      .np-info {
        flex: 1;
        display: flex;
        flex-direction: column;
        gap: 2px;
        min-width: 0;
      }
      .np-title {
        font-size: 1rem;
        font-weight: 600;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }
      .np-artist {
        font-size: 0.85rem;
        color: var(--secondary-text-color);
      }
      .np-album {
        font-size: 0.8rem;
        color: var(--secondary-text-color);
        opacity: 0.7;
      }
      .controls {
        display: flex;
        justify-content: center;
        gap: 12px;
        padding: 12px 20px;
        border-top: 1px solid var(--divider-color, rgba(255, 255, 255, 0.06));
      }
      .ctrl-btn {
        width: 40px;
        height: 40px;
        border: none;
        border-radius: 50%;
        background: var(--primary-color, #03a9f4);
        color: #fff;
        font-size: 1.1rem;
        cursor: pointer;
        display: flex;
        align-items: center;
        justify-content: center;
        transition: opacity 0.15s;
      }
      .ctrl-btn:hover {
        opacity: 0.8;
      }
      .ctrl-btn.secondary {
        background: transparent;
        border: 1px solid var(--divider-color, rgba(255, 255, 255, 0.15));
        color: var(--primary-text-color);
      }
      .ps-label {
        text-align: center;
        padding: 4px 20px 12px;
        font-size: 0.8rem;
        color: var(--secondary-text-color);
        font-weight: 500;
        text-transform: uppercase;
        letter-spacing: 0.05em;
      }
      .count-badge {
        font-size: 0.8rem;
        font-weight: 400;
        color: var(--secondary-text-color);
        margin-left: 8px;
      }
    `;
  }

  render() {
    const s = this._state;
    const connected = s.connected;

    let statusText = "Not registered";
    if (connected) statusText = "Connected to Sendspin server";
    else if (this._registered) statusText = "Connecting\u2026";

    let psText = "";
    if (connected) {
      if (s.isPlaying) psText = "Playing";
      else if (s.playbackState === "stopped") psText = "Stopped";
      else psText = "Idle";
    }

    const showNp = connected && s.isPlaying && s.title;

    return html`
      <ha-top-app-bar-fixed>
        <ha-menu-button slot="navigationIcon" .hass=${this.hass} .narrow=${this.narrow}></ha-menu-button>
        <div slot="title">Sendspin Dash</div>
        <div class="content">
          <div class="card">
            <h2 class="card-title">This Browser</h2>
            <div class="row">
              <div class="row-text">
                <span class="row-label">Connection</span>
                <span class="row-sub">${statusText}</span>
              </div>
              <div class="status-dot ${connected ? "connected" : "offline"}"></div>
            </div>
            <div class="row">
              <div class="row-text">
                <span class="row-label">Register as Player</span>
                <span class="row-sub">Enable this browser as a Sendspin player</span>
              </div>
              <label class="toggle">
                <input type="checkbox" .checked=${this._registered} @change=${this._handleRegisterToggle} />
                <span class="toggle-slider"></span>
              </label>
            </div>
            <div class="row">
              <div class="row-text">
                <span class="row-label">Player Name</span>
                <span class="row-sub">Friendly name for this device</span>
              </div>
            </div>
            <div class="field-wrap">
              <input type="text" class="field-input" placeholder="e.g. Living Room Tablet" autocomplete="off" 
                .value=${this._playerName} @input=${this._handleNameInput} />
            </div>
            <div class="id-row">
              <span class="id-label">Browser ID:</span>
              <span class="id-val">${this._playerId}</span>
            </div>
          </div>
          
          <div class="card">
            <h2 class="card-title">Registered Players<span class="count-badge"></span></h2>
            <div class="players-list">
              ${this._players.length === 0
        ? html`<div class="empty-msg">No registered players yet. Toggle the switch above to register this browser.</div>`
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
          if (/Android/.test(ua)) os = "Android";
          else if (/iPhone|iPad/.test(ua)) os = "iOS";
          else if (/Linux/.test(ua)) os = "Linux";
          else if (/Mac OS/.test(ua)) os = "macOS";
          else if (/Windows/.test(ua)) os = "Windows";

          const device = browser + (os ? " on " + os : "");

          return html`
                      <div class="player-row ${isMe ? 'is-me' : ''}">
                        <div class="player-dot ${statusClass}"></div>
                        <div class="player-info">
                          <div class="player-name">${p.name || "Unnamed Browser"}${isMe ? html`<span class="me-badge">This browser</span>` : ""}</div>
                          <div class="player-meta">${device} &middot; ${statusLabel} &middot; ${seen}</div>
                        </div>
                        <button class="remove-btn" title="Remove player" @click=${() => this._removePlayer(p.player_id)}>&times;</button>
                      </div>
                    `;
        })
      }
            </div>
          </div>

          <div class="card">
            <h2 class="card-title">Now Playing</h2>
            ${showNp ? html`
              <div class="np">
                ${s.artworkUrl ? html`<img class="np-art" src="${s.artworkUrl}" />` : ""}
                <div class="np-info">
                  <span class="np-title">${s.title}</span>
                  <span class="np-artist">${s.artist}</span>
                  <span class="np-album">${s.album}</span>
                </div>
              </div>
            ` : ""}
            <div class="ps-label">${psText}</div>
            ${connected ? html`
              <div class="controls">
                <button class="ctrl-btn secondary" title="Previous" @click=${() => this._cmd("previous")}>\u23EE</button>
                <button class="ctrl-btn" title="Play" @click=${() => this._cmd("play")}>\u25B6</button>
                <button class="ctrl-btn secondary" title="Pause" @click=${() => this._cmd("pause")}>\u23F8</button>
                <button class="ctrl-btn secondary" title="Next" @click=${() => this._cmd("next")}>\u23ED</button>
                <button class="ctrl-btn secondary" title="Stop" @click=${() => this._cmd("stop")}>\u23F9</button>
              </div>
            ` : ""}
          </div>
        </div>
      </ha-top-app-bar-fixed>
    `;
  }
}

customElements.define("sendspin-browser-panel", SendspinBrowserPanel);
