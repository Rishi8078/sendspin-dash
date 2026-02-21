/**
 * Sendspin Browser Player - Home Assistant panel.
 * Embeds the player UI (player.html) in an iframe. Config from API so it works reliably.
 */
(function () {
  const CONFIG_URL = "/api/sendspin_browser/config";
  const DEFAULT_PLAYER_NAME = "HA Browser";
  const PLAYER_HTML = "/api/sendspin_browser/player.html";

  const CACHE_VER = Date.now().toString();

  function buildPlayerUrl(serverUrl, playerName) {
    const params = new URLSearchParams();
    if (serverUrl) params.set("server_url", serverUrl);
    if (playerName) params.set("player_name", playerName);
    params.set("v", CACHE_VER); // Cache busting generated once per frame load
    const qs = params.toString();
    return qs ? PLAYER_HTML + "?" + qs : PLAYER_HTML;
  }

  const template = document.createElement("template");
  template.innerHTML = "<iframe id=\"sendspin-iframe\" style=\"position:absolute;top:0;left:0;width:100%;height:100%;border:0;\"></iframe>";

  class SendspinBrowserPanel extends HTMLElement {
    constructor() {
      super();
      this._hass = null;
      this._lastPlayerUrl = "";
      this._config = { server_url: "", player_name: DEFAULT_PLAYER_NAME };
      this.attachShadow({ mode: "open" });
      this.shadowRoot.appendChild(template.content.cloneNode(true));
      this._iframe = this.shadowRoot.getElementById("sendspin-iframe");
    }

    connectedCallback() {
      this.style.display = "block";
      this.style.height = "100%";
      this.style.minHeight = "100%";
      this._fetchConfig();
    }

    set hass(hass) {
      this._hass = hass;
      this._fetchConfig();
    }

    async _fetchConfig() {
      try {
        const res = await fetch(CONFIG_URL, { method: "GET", credentials: "same-origin" });
        if (res.ok) {
          const data = await res.json();
          this._config = {
            server_url: (data.server_url || "").trim(),
            player_name: (data.player_name || "").trim() || DEFAULT_PLAYER_NAME,
          };
        }
      } catch (_) {
        this._config = { server_url: "", player_name: DEFAULT_PLAYER_NAME };
      }
      this._updateIframe();
    }

    _updateIframe() {
      const url = buildPlayerUrl(this._config.server_url, this._config.player_name);
      if (url !== this._lastPlayerUrl) {
        this._lastPlayerUrl = url;
        this._iframe.src = url;
      }
    }
  }

  customElements.define("sendspin-browser-panel", SendspinBrowserPanel);
})();
