/**
 * Sendspin Browser Player - Home Assistant panel.
 * Embeds the player UI in an iframe with server_url and player_name from the config entry.
 */
(function () {
  const DEFAULT_SERVER_URL = "";
  const DEFAULT_PLAYER_NAME = "Dashboard";

  function getConfig(hass) {
    if (!hass || !hass.config_entries) return {};
    const entry = hass.config_entries.entries.find(
      function (e) { return e.domain === "sendspin_browser"; }
    );
    const options = (entry && entry.options) || {};
    return {
      server_url: options.server_url || DEFAULT_SERVER_URL,
      player_name: options.player_name || DEFAULT_PLAYER_NAME,
    };
  }

  function buildPlayerUrl(config) {
    const base = "/api/sendspin_browser/player.html";
    const params = new URLSearchParams();
    if (config.server_url) params.set("server_url", config.server_url);
    if (config.player_name) params.set("player_name", config.player_name);
    const qs = params.toString();
    return qs ? base + "?" + qs : base;
  }

  const template = document.createElement("template");
  template.innerHTML = "<iframe id=\"sendspin-iframe\" style=\"position:absolute;top:0;left:0;width:100%;height:100%;border:0;\"></iframe>";

  class SendspinBrowserPanel extends HTMLElement {
    constructor() {
      super();
      this._hass = null;
      this._lastPlayerUrl = "";
      this.attachShadow({ mode: "open" });
      this.shadowRoot.appendChild(template.content.cloneNode(true));
      this._iframe = this.shadowRoot.getElementById("sendspin-iframe");
    }

    connectedCallback() {
      this.style.display = "block";
      this.style.height = "100%";
      this.style.minHeight = "100%";
    }

    set hass(hass) {
      this._hass = hass;
      var config = getConfig(hass);
      var url = buildPlayerUrl(config);
      if (url !== this._lastPlayerUrl) {
        this._lastPlayerUrl = url;
        this._iframe.src = url;
      }
    }
  }

  customElements.define("sendspin-browser-panel", SendspinBrowserPanel);
})();
