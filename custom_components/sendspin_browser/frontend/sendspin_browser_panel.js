/**
 * Sendspin Dash — Home Assistant Panel
 * Shows registration controls and live connection status from the connector.
 * The connector (connector.js) exposes the active player on window.sendspinPlayer.
 */

var STORAGE_KEY_NAME = "sendspin-browser-player-name";
var STORAGE_KEY_PLAYER_ID = "sendspin-browser-player-id";
var STORAGE_KEY_REGISTERED = "sendspin-browser-registered";

function getOrCreatePlayerId() {
  try {
    var id = localStorage.getItem(STORAGE_KEY_PLAYER_ID);
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
    this._connected = false;
    this._pollTimer = null;
    this.attachShadow({ mode: "open" });
  }

  set hass(hass) {
    this._hass = hass;
    var menuBtn = this.shadowRoot && this.shadowRoot.querySelector("ha-menu-button");
    if (menuBtn) menuBtn.hass = hass;
  }

  set narrow(narrow) {
    this._narrow = narrow;
    var menuBtn = this.shadowRoot && this.shadowRoot.querySelector("ha-menu-button");
    if (menuBtn) menuBtn.narrow = narrow;
  }

  set panel(panel) {
    this._panel = panel;
  }

  connectedCallback() {
    this._render();
    this._bindEvents();
    this._updateStatus();
    this._pollTimer = setInterval(() => this._updateStatus(), 1000);
  }

  disconnectedCallback() {
    if (this._pollTimer) {
      clearInterval(this._pollTimer);
      this._pollTimer = null;
    }
  }

  _updateStatus() {
    var p = window.sendspinPlayer;
    var connected = !!(p && p.isConnected);

    if (connected !== this._connected) {
      this._connected = connected;

      var dot = this.shadowRoot.getElementById("status-dot");
      var text = this.shadowRoot.getElementById("status-text");
      if (dot) {
        dot.className = "status-dot " + (connected ? "online" : "offline");
      }
      if (text) {
        if (connected) {
          text.textContent = "Connected to Sendspin server";
        } else if (this._registered) {
          text.textContent = "Connecting\u2026";
        } else {
          text.textContent = "Not registered";
        }
      }
    }
  }

  _bindEvents() {
    var root = this.shadowRoot;
    var self = this;
    var toggle = root.getElementById("register-toggle");
    var nameInput = root.getElementById("player-name");

    if (toggle) {
      toggle.addEventListener("change", function () {
        self._registered = toggle.checked;
        localStorage.setItem(STORAGE_KEY_REGISTERED, self._registered ? "true" : "false");
        self._updateStatus();
      });
    }

    if (nameInput) {
      nameInput.addEventListener("input", function () {
        var name = nameInput.value.trim();
        if (name) {
          self._playerName = name;
          localStorage.setItem(STORAGE_KEY_NAME, name);
        }
      });
    }
  }

  _render() {
    var root = this.shadowRoot;
    root.innerHTML = "\
      <style>\
        :host {\
          display: block;\
          height: 100%;\
          min-height: 100%;\
          background: var(--primary-background-color, #1c1c1c);\
          color: var(--primary-text-color, #e3e3e3);\
          font-family: var(--ha-font-family-body, system-ui, -apple-system, sans-serif);\
          -webkit-font-smoothing: antialiased;\
          --app-header-background-color: var(--sidebar-background-color);\
          --app-header-text-color: var(--sidebar-text-color);\
          --app-header-border-bottom: 1px solid var(--divider-color);\
          --ha-card-border-radius: var(--ha-config-card-border-radius, 12px);\
        }\
\
        .content {\
          max-width: 600px;\
          margin: 0 auto;\
          padding: 16px;\
          display: flex;\
          flex-direction: column;\
          gap: 16px;\
        }\
\
        .section-card {\
          background: var(--ha-card-background, var(--card-background-color, #2a2a2a));\
          border: 1px solid var(--divider-color, rgba(255, 255, 255, 0.08));\
          border-radius: var(--ha-card-border-radius, 12px);\
          overflow: hidden;\
        }\
\
        .section-title {\
          font-size: 1.1rem;\
          font-weight: 600;\
          padding: 20px 20px 0;\
          color: var(--primary-text-color, #e3e3e3);\
        }\
\
        .card-row {\
          display: flex;\
          align-items: center;\
          justify-content: space-between;\
          padding: 16px 20px;\
          gap: 16px;\
        }\
\
        .row-text {\
          display: flex;\
          flex-direction: column;\
          gap: 2px;\
          flex: 1;\
        }\
\
        .row-label {\
          font-size: 1rem;\
          font-weight: 500;\
          color: var(--primary-text-color, #e3e3e3);\
        }\
\
        .row-sub {\
          font-size: 0.85rem;\
          color: var(--secondary-text-color, #9e9e9e);\
          line-height: 1.4;\
        }\
\
        .toggle {\
          position: relative;\
          display: inline-block;\
          width: 48px;\
          height: 26px;\
          flex-shrink: 0;\
        }\
\
        .toggle input {\
          opacity: 0;\
          width: 0;\
          height: 0;\
        }\
\
        .toggle-slider {\
          position: absolute;\
          cursor: pointer;\
          top: 0; left: 0; right: 0; bottom: 0;\
          background-color: var(--disabled-color, #555);\
          border-radius: 26px;\
          transition: background-color 0.3s;\
        }\
\
        .toggle-slider::before {\
          content: '';\
          position: absolute;\
          height: 20px;\
          width: 20px;\
          left: 3px;\
          bottom: 3px;\
          background-color: white;\
          border-radius: 50%;\
          transition: transform 0.3s;\
        }\
\
        .toggle input:checked + .toggle-slider {\
          background-color: var(--primary-color, #03a9f4);\
        }\
\
        .toggle input:checked + .toggle-slider::before {\
          transform: translateX(22px);\
        }\
\
        .field-inline {\
          padding: 0 20px 16px;\
        }\
\
        .field-input {\
          width: 100%;\
          background: var(--input-fill-color, rgba(0, 0, 0, 0.15));\
          border: 1px solid var(--divider-color, rgba(255, 255, 255, 0.08));\
          border-radius: 8px;\
          padding: 12px 14px;\
          font-family: inherit;\
          font-size: 0.95rem;\
          color: var(--primary-text-color, #e3e3e3);\
          outline: none;\
          transition: border-color 0.2s, box-shadow 0.2s;\
          box-sizing: border-box;\
        }\
\
        .field-input:focus {\
          border-color: var(--primary-color, #03a9f4);\
          box-shadow: 0 0 0 2px rgba(var(--rgb-primary-color, 3, 169, 244), 0.2);\
        }\
\
        .browser-id-row {\
          padding: 12px 20px;\
          border-top: 1px solid var(--divider-color, rgba(255, 255, 255, 0.06));\
          display: flex;\
          align-items: center;\
          gap: 8px;\
        }\
\
        .browser-id-label {\
          font-size: 0.8rem;\
          font-weight: 600;\
          color: var(--secondary-text-color, #9e9e9e);\
        }\
\
        .browser-id-value {\
          font-size: 0.75rem;\
          font-family: monospace;\
          color: var(--secondary-text-color, #9e9e9e);\
          opacity: 0.7;\
        }\
\
        .status-dot {\
          width: 12px;\
          height: 12px;\
          border-radius: 50%;\
          flex-shrink: 0;\
          transition: background-color 0.3s;\
        }\
\
        .status-dot.online {\
          background: var(--success-color, #4caf50);\
          box-shadow: 0 0 8px rgba(76, 175, 80, 0.5);\
        }\
\
        .status-dot.offline {\
          background: var(--secondary-text-color, #9e9e9e);\
          opacity: 0.5;\
        }\
      </style>\
\
      <ha-top-app-bar-fixed>\
        <ha-menu-button slot=\"navigationIcon\"></ha-menu-button>\
        <div slot=\"title\">Sendspin Dash</div>\
\
        <div class=\"content\">\
          <div class=\"section-card\">\
            <h2 class=\"section-title\">This Browser</h2>\
\
            <div class=\"card-row\">\
              <div class=\"row-text\">\
                <span class=\"row-label\">Connection Status</span>\
                <span class=\"row-sub\" id=\"status-text\">Not registered</span>\
              </div>\
              <div id=\"status-dot\" class=\"status-dot offline\"></div>\
            </div>\
\
            <div class=\"card-row\">\
              <div class=\"row-text\">\
                <span class=\"row-label\">Register as Player</span>\
                <span class=\"row-sub\">Enable this browser as a Sendspin player</span>\
              </div>\
              <label class=\"toggle\">\
                <input type=\"checkbox\" id=\"register-toggle\" " + (this._registered ? "checked" : "") + " />\
                <span class=\"toggle-slider\"></span>\
              </label>\
            </div>\
\
            <div class=\"card-row\">\
              <div class=\"row-text\">\
                <span class=\"row-label\">Player Name</span>\
                <span class=\"row-sub\">A friendly name for this browser device</span>\
              </div>\
            </div>\
            <div class=\"field-inline\">\
              <input type=\"text\" id=\"player-name\" class=\"field-input\"\
                placeholder=\"e.g. Living Room Tablet\" autocomplete=\"off\"\
                value=\"" + (this._playerName || "") + "\" />\
            </div>\
\
            <div class=\"browser-id-row\">\
              <span class=\"browser-id-label\">Browser ID:</span>\
              <span class=\"browser-id-value\">" + this._playerId + "</span>\
            </div>\
          </div>\
        </div>\
      </ha-top-app-bar-fixed>\
    ";
  }
}

customElements.define("sendspin-browser-panel", SendspinBrowserPanel);
