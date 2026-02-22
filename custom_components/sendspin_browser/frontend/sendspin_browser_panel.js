/**
 * Sendspin Dash — Home Assistant Panel
 * Reads live state from window.sendspinState (populated by connector.js).
 * Sends controller commands via window.sendspinPlayer.sendCommand().
 */

var SK_NAME = "sendspin-browser-player-name";
var SK_ID = "sendspin-browser-player-id";
var SK_REG = "sendspin-browser-registered";

function getOrCreatePlayerId() {
  try {
    var id = localStorage.getItem(SK_ID);
    if (id && id.length >= 8) return id;
    id = "sendspin-browser-" + Math.random().toString(36).slice(2) + Date.now().toString(36);
    localStorage.setItem(SK_ID, id);
    return id;
  } catch (_) {
    return "sendspin-browser-" + Date.now();
  }
}

function esc(s) {
  if (!s) return "";
  var d = document.createElement("div");
  d.textContent = s;
  return d.innerHTML;
}

class SendspinBrowserPanel extends HTMLElement {
  constructor() {
    super();
    this._hass = null;
    this._playerId = getOrCreatePlayerId();
    this._registered = localStorage.getItem(SK_REG) === "true";
    this._playerName = localStorage.getItem(SK_NAME) || "";
    this._prevState = {};
    this._timer = null;
    this.attachShadow({ mode: "open" });
  }

  set hass(h) {
    this._hass = h;
    var m = this.shadowRoot && this.shadowRoot.querySelector("ha-menu-button");
    if (m) m.hass = h;
  }
  set narrow(n) {
    var m = this.shadowRoot && this.shadowRoot.querySelector("ha-menu-button");
    if (m) m.narrow = n;
  }
  set panel(_) {}

  connectedCallback() {
    this._render();
    this._bind();
    this._poll();
    this._timer = setInterval(() => this._poll(), 500);
  }

  disconnectedCallback() {
    if (this._timer) { clearInterval(this._timer); this._timer = null; }
  }

  _poll() {
    var s = window.sendspinState || {};
    var p = this._prevState;
    var changed = s.connected !== p.connected || s.isPlaying !== p.isPlaying
      || s.title !== p.title || s.artist !== p.artist || s.album !== p.album
      || s.playbackState !== p.playbackState || s.volume !== p.volume
      || s.muted !== p.muted || s.artworkUrl !== p.artworkUrl;
    if (!changed && this._registered === (localStorage.getItem(SK_REG) === "true")) return;
    this._registered = localStorage.getItem(SK_REG) === "true";
    this._prevState = Object.assign({}, s);
    this._updateUI(s);
  }

  _updateUI(s) {
    var root = this.shadowRoot;

    // Status
    var dot = root.getElementById("status-dot");
    var txt = root.getElementById("status-text");
    if (dot) dot.className = "status-dot " + (s.connected ? "online" : "offline");
    if (txt) {
      if (s.connected) txt.textContent = "Connected to Sendspin server";
      else if (this._registered) txt.textContent = "Connecting\u2026";
      else txt.textContent = "Not registered";
    }

    // Now playing
    var np = root.getElementById("now-playing");
    var controls = root.getElementById("controls");
    if (s.connected && s.isPlaying && s.title) {
      if (np) {
        np.style.display = "";
        root.getElementById("np-title").textContent = s.title || "";
        root.getElementById("np-artist").textContent = s.artist || "";
        root.getElementById("np-album").textContent = s.album || "";
        var art = root.getElementById("np-artwork");
        if (s.artworkUrl) { art.src = s.artworkUrl; art.style.display = ""; }
        else art.style.display = "none";
      }
      if (controls) controls.style.display = "";
    } else {
      if (np) np.style.display = "none";
      if (controls) controls.style.display = s.connected ? "" : "none";
    }

    // Playback state label
    var psLabel = root.getElementById("ps-label");
    if (psLabel) {
      if (!s.connected) psLabel.textContent = "";
      else if (s.isPlaying) psLabel.textContent = "Playing";
      else if (s.playbackState === "stopped") psLabel.textContent = "Stopped";
      else psLabel.textContent = "Idle";
    }
  }

  _cmd(name, params) {
    var p = window.sendspinPlayer;
    if (p && p.isConnected) {
      try { p.sendCommand(name, params); } catch (_) {}
    }
  }

  _bind() {
    var root = this.shadowRoot;
    var self = this;

    var toggle = root.getElementById("register-toggle");
    if (toggle) toggle.addEventListener("change", function () {
      self._registered = toggle.checked;
      localStorage.setItem(SK_REG, self._registered ? "true" : "false");
      self._poll();
    });

    var nameInput = root.getElementById("player-name");
    if (nameInput) nameInput.addEventListener("input", function () {
      var n = nameInput.value.trim();
      if (n) { self._playerName = n; localStorage.setItem(SK_NAME, n); }
    });

    root.getElementById("btn-prev").addEventListener("click", function () { self._cmd("previous"); });
    root.getElementById("btn-play").addEventListener("click", function () { self._cmd("play"); });
    root.getElementById("btn-pause").addEventListener("click", function () { self._cmd("pause"); });
    root.getElementById("btn-next").addEventListener("click", function () { self._cmd("next"); });
    root.getElementById("btn-stop").addEventListener("click", function () { self._cmd("stop"); });
  }

  _render() {
    this.shadowRoot.innerHTML = "\
<style>\
:host{display:block;height:100%;min-height:100%;background:var(--primary-background-color,#1c1c1c);color:var(--primary-text-color,#e3e3e3);font-family:var(--ha-font-family-body,system-ui,-apple-system,sans-serif);-webkit-font-smoothing:antialiased;--app-header-background-color:var(--sidebar-background-color);--app-header-text-color:var(--sidebar-text-color);--app-header-border-bottom:1px solid var(--divider-color);--radius:var(--ha-config-card-border-radius,12px)}\
.content{max-width:600px;margin:0 auto;padding:16px;display:flex;flex-direction:column;gap:16px}\
.card{background:var(--ha-card-background,var(--card-background-color,#2a2a2a));border:1px solid var(--divider-color,rgba(255,255,255,.08));border-radius:var(--radius);overflow:hidden}\
.card-title{font-size:1.1rem;font-weight:600;padding:20px 20px 0;color:var(--primary-text-color)}\
.row{display:flex;align-items:center;justify-content:space-between;padding:16px 20px;gap:16px}\
.row-text{display:flex;flex-direction:column;gap:2px;flex:1}\
.row-label{font-size:1rem;font-weight:500}\
.row-sub{font-size:.85rem;color:var(--secondary-text-color,#9e9e9e);line-height:1.4}\
.toggle{position:relative;display:inline-block;width:48px;height:26px;flex-shrink:0}\
.toggle input{opacity:0;width:0;height:0}\
.toggle-slider{position:absolute;cursor:pointer;inset:0;background:var(--disabled-color,#555);border-radius:26px;transition:background .3s}\
.toggle-slider::before{content:'';position:absolute;height:20px;width:20px;left:3px;bottom:3px;background:#fff;border-radius:50%;transition:transform .3s}\
.toggle input:checked+.toggle-slider{background:var(--primary-color,#03a9f4)}\
.toggle input:checked+.toggle-slider::before{transform:translateX(22px)}\
.field-wrap{padding:0 20px 16px}\
.field-input{width:100%;background:var(--input-fill-color,rgba(0,0,0,.15));border:1px solid var(--divider-color,rgba(255,255,255,.08));border-radius:8px;padding:12px 14px;font-family:inherit;font-size:.95rem;color:var(--primary-text-color);outline:none;box-sizing:border-box;transition:border-color .2s}\
.field-input:focus{border-color:var(--primary-color,#03a9f4);box-shadow:0 0 0 2px rgba(var(--rgb-primary-color,3,169,244),.2)}\
.id-row{padding:12px 20px;border-top:1px solid var(--divider-color,rgba(255,255,255,.06));display:flex;gap:8px;align-items:center}\
.id-label{font-size:.8rem;font-weight:600;color:var(--secondary-text-color)}\
.id-val{font-size:.75rem;font-family:monospace;color:var(--secondary-text-color);opacity:.7}\
.status-dot{width:12px;height:12px;border-radius:50%;flex-shrink:0;transition:background .3s}\
.status-dot.online{background:var(--success-color,#4caf50);box-shadow:0 0 8px rgba(76,175,80,.5)}\
.status-dot.offline{background:var(--secondary-text-color,#9e9e9e);opacity:.5}\
.np{padding:16px 20px;display:flex;gap:16px;align-items:center;border-top:1px solid var(--divider-color,rgba(255,255,255,.06))}\
.np-art{width:64px;height:64px;border-radius:8px;object-fit:cover;flex-shrink:0}\
.np-info{flex:1;display:flex;flex-direction:column;gap:2px;min-width:0}\
.np-title{font-size:1rem;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}\
.np-artist{font-size:.85rem;color:var(--secondary-text-color)}\
.np-album{font-size:.8rem;color:var(--secondary-text-color);opacity:.7}\
.controls{display:flex;justify-content:center;gap:12px;padding:12px 20px;border-top:1px solid var(--divider-color,rgba(255,255,255,.06))}\
.ctrl-btn{width:40px;height:40px;border:none;border-radius:50%;background:var(--primary-color,#03a9f4);color:#fff;font-size:1.1rem;cursor:pointer;display:flex;align-items:center;justify-content:center;transition:opacity .15s}\
.ctrl-btn:hover{opacity:.8}\
.ctrl-btn.secondary{background:transparent;border:1px solid var(--divider-color,rgba(255,255,255,.15));color:var(--primary-text-color)}\
.ps-label{text-align:center;padding:4px 20px 12px;font-size:.8rem;color:var(--secondary-text-color);font-weight:500;text-transform:uppercase;letter-spacing:.05em}\
</style>\
<ha-top-app-bar-fixed>\
<ha-menu-button slot=\"navigationIcon\"></ha-menu-button>\
<div slot=\"title\">Sendspin Dash</div>\
<div class=\"content\">\
  <div class=\"card\">\
    <h2 class=\"card-title\">This Browser</h2>\
    <div class=\"row\">\
      <div class=\"row-text\">\
        <span class=\"row-label\">Connection</span>\
        <span class=\"row-sub\" id=\"status-text\">Not registered</span>\
      </div>\
      <div id=\"status-dot\" class=\"status-dot offline\"></div>\
    </div>\
    <div class=\"row\">\
      <div class=\"row-text\">\
        <span class=\"row-label\">Register as Player</span>\
        <span class=\"row-sub\">Enable this browser as a Sendspin player</span>\
      </div>\
      <label class=\"toggle\"><input type=\"checkbox\" id=\"register-toggle\" " + (this._registered ? "checked" : "") + " /><span class=\"toggle-slider\"></span></label>\
    </div>\
    <div class=\"row\"><div class=\"row-text\"><span class=\"row-label\">Player Name</span><span class=\"row-sub\">Friendly name for this device</span></div></div>\
    <div class=\"field-wrap\"><input type=\"text\" id=\"player-name\" class=\"field-input\" placeholder=\"e.g. Living Room Tablet\" autocomplete=\"off\" value=\"" + esc(this._playerName) + "\" /></div>\
    <div class=\"id-row\"><span class=\"id-label\">Browser ID:</span><span class=\"id-val\">" + esc(this._playerId) + "</span></div>\
  </div>\
  <div class=\"card\">\
    <h2 class=\"card-title\">Now Playing</h2>\
    <div id=\"now-playing\" class=\"np\" style=\"display:none\">\
      <img id=\"np-artwork\" class=\"np-art\" style=\"display:none\" />\
      <div class=\"np-info\">\
        <span id=\"np-title\" class=\"np-title\"></span>\
        <span id=\"np-artist\" class=\"np-artist\"></span>\
        <span id=\"np-album\" class=\"np-album\"></span>\
      </div>\
    </div>\
    <div id=\"ps-label\" class=\"ps-label\"></div>\
    <div id=\"controls\" class=\"controls\" style=\"display:none\">\
      <button id=\"btn-prev\" class=\"ctrl-btn secondary\" title=\"Previous\">\u23EE</button>\
      <button id=\"btn-play\" class=\"ctrl-btn\" title=\"Play\">\u25B6</button>\
      <button id=\"btn-pause\" class=\"ctrl-btn secondary\" title=\"Pause\">\u23F8</button>\
      <button id=\"btn-next\" class=\"ctrl-btn secondary\" title=\"Next\">\u23ED</button>\
      <button id=\"btn-stop\" class=\"ctrl-btn secondary\" title=\"Stop\">\u23F9</button>\
    </div>\
  </div>\
</div>\
</ha-top-app-bar-fixed>";
  }
}

customElements.define("sendspin-browser-panel", SendspinBrowserPanel);
