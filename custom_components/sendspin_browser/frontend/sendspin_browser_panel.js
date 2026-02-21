/**
 * Sendspin Browser Player - Home Assistant panel.
 * UI like browser_mod: ha-card, ha-settings-row, no iframe.
 */
(function () {
  const SERVERS_URL = "/api/sendspin_browser/servers";

  function getConfigFromHass(hass) {
    if (!hass || !hass.config_entries || !hass.config_entries.entries) {
      return { server_url: "", player_name: "Dashboard", entry_id: null };
    }
    const entry = hass.config_entries.entries.find(function (e) {
      return e.domain === "sendspin_browser";
    });
    const opts = (entry && entry.options) || {};
    return {
      server_url: opts.server_url || "",
      player_name: opts.player_name || "Dashboard",
      entry_id: entry ? entry.entry_id : null,
    };
  }

  class SendspinBrowserPanel extends HTMLElement {
    constructor() {
      super();
      this._hass = null;
      this._config = { server_url: "", player_name: "Dashboard" };
      this._servers = [];
      this._loadingServers = false;
      this.attachShadow({ mode: "open" });
    }

    connectedCallback() {
      this.style.display = "block";
      this.style.height = "100%";
      this.style.minHeight = "100%";
    }

    set hass(hass) {
      this._hass = hass;
      this._config = getConfigFromHass(hass);
      this._render();
    }

    _render() {
      const root = this.shadowRoot;
      if (!root) return;

      const configured = !!(this._config.server_url && this._config.server_url.trim());

      root.innerHTML = "";
      const card = document.createElement("ha-card");
      card.setAttribute("header", "This Browser");
      card.setAttribute("outlined", "");

      const header = document.createElement("h1");
      header.className = "card-header";
      header.style.cssText = "display:flex;align-items:center;justify-content:space-between;margin:0 0 16px 0;padding:0 16px;font-size:1.25rem;";
      const name = document.createElement("div");
      name.textContent = "This Browser";
      const icon = document.createElement("ha-icon");
      icon.className = "icon";
      icon.setAttribute("icon", configured ? "mdi:check-circle-outline" : "mdi:circle-outline");
      icon.style.color = configured ? "var(--success-color, green)" : "var(--secondary-text-color, #8a8a8a)";
      header.appendChild(name);
      header.appendChild(icon);
      card.appendChild(header);

      const content = document.createElement("div");
      content.className = "card-content";
      content.style.padding = "0 16px 16px";

      const alert = document.createElement("ha-alert");
      alert.setAttribute("alert-type", "info");
      alert.innerHTML = "This browser stays registered as a Sendspin player when any Home Assistant tab is open. To change server or player name: <b>Settings → Integrations → Sendspin Browser → Configure</b>.";
      content.appendChild(alert);

      const rowServer = document.createElement("ha-settings-row");
      rowServer.innerHTML = '<span slot="heading">Server URL</span><span slot="description">' + (this._config.server_url ? this._config.server_url : "Not set. Configure in Integration options.") + '</span>';
      content.appendChild(rowServer);

      const rowName = document.createElement("ha-settings-row");
      rowName.innerHTML = '<span slot="heading">Player name</span><span slot="description">' + (this._config.player_name || "Dashboard") + '</span>';
      content.appendChild(rowName);

      const entryId = this._config.entry_id;
      if (entryId) {
        const rowConfigure = document.createElement("ha-settings-row");
        rowConfigure.innerHTML = '<span slot="heading">Configure</span><span slot="description">Set server URL and player name</span>';
        const configBtn = document.createElement("ha-button");
        configBtn.textContent = "Open configuration";
        configBtn.addEventListener("click", () => {
          if (this._hass) {
            this._hass.navigate("/config/integrations/integration/" + entryId, { replace: false });
          }
        });
        rowConfigure.appendChild(configBtn);
        content.appendChild(rowConfigure);
      }

      const rowFind = document.createElement("ha-settings-row");
      rowFind.innerHTML = '<span slot="heading">Find servers</span><span slot="description">Discover Sendspin servers on your network</span>';
      const findBtn = document.createElement("ha-button");
      findBtn.textContent = "Find";
      findBtn.disabled = this._loadingServers;
      findBtn.addEventListener("click", () => this._findServers(content, findBtn));
      rowFind.appendChild(findBtn);
      content.appendChild(rowFind);

      const listWrap = document.createElement("div");
      listWrap.id = "sendspin-servers-list";
      listWrap.style.marginTop = "8px";
      if (this._servers.length > 0) {
        const list = document.createElement("div");
        list.style.display = "flex";
        list.style.flexWrap = "wrap";
        list.style.gap = "8px";
        this._servers.forEach(function (s) {
          const btn = document.createElement("ha-button");
          btn.setAttribute("outline", "");
          btn.textContent = s.name || s.url || "Server";
          btn.title = s.url || "";
          btn.addEventListener("click", function () {
            if (navigator.clipboard && navigator.clipboard.writeText) {
              navigator.clipboard.writeText(s.url || "").then(function () {
                if (window.__sendspinPanelToast) {
                  window.__sendspinPanelToast("URL copied. Paste it in Integration options.");
                }
              });
            }
          });
          list.appendChild(btn);
        });
        listWrap.appendChild(list);
      }
      content.appendChild(listWrap);

      card.appendChild(content);
      root.appendChild(card);
    }

    async _findServers(container, findBtn) {
      this._loadingServers = true;
      findBtn.disabled = true;
      this._servers = [];
      try {
        const res = await fetch(SERVERS_URL, { method: "GET", credentials: "same-origin" });
        if (res.ok) {
          const data = await res.json();
          this._servers = Array.isArray(data) ? data : [];
        }
      } catch (_) {
        this._servers = [];
      }
      this._loadingServers = false;
      findBtn.disabled = false;
      this._render();
    }
  }

  customElements.define("sendspin-browser-panel", SendspinBrowserPanel);
})();
