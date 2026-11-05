/* Le Sanctuaire Solaire — dashboard half (web dashboard of Hermes).
   A "Sanctuaire" tab with the full panorama, and a foldable strip above the Chat tab.
   The panorama runs in an iframe (app/frame.html, same engine as the standalone page); this bundle feeds it the
   theme and the merged activity read from the plugin's own routes. No other network call.
   2026-11-05 ≈11:35, mis à jour ≈15:20 (choix de l'univers) et ≈16:10 (budget, image « Ma journée », replay) (Europe/Zurich) — Claude (Cowork) — Anthropic, Claude Opus 5.5, pour Médéric Morin
   Copyright 2026 Médéric Morin — Apache License 2.0 */
(function () {
  "use strict";
  var SDK = window.__HERMES_PLUGIN_SDK__;
  if (!SDK || !window.__HERMES_PLUGINS__) return;
  var React = SDK.React, h = React.createElement;
  var useEffect = SDK.hooks.useEffect, useRef = SDK.hooks.useRef, useState = SDK.hooks.useState;
  var NAME = "sanctuaire-solaire";
  var API = "/api/plugins/" + NAME;
  var FRAME = "/dashboard-plugins/" + NAME + "/app/frame.html";
  var POLL_MS = 1500;
  var DEFAULT_WORLD = "olympe", WORLD_KEY = "sanctuaire.world";
  var themeCache = {}, worldsCache = null, worldListeners = [];
  var world = readWorld();

  function readWorld() {
    try { return (localStorage.getItem(WORLD_KEY) || DEFAULT_WORLD).replace(/[^a-z0-9_-]/g, "") || DEFAULT_WORLD; }
    catch (e) { return DEFAULT_WORLD; }
  }
  function setWorld(id) {
    if (typeof id !== "string" || !/^[a-z0-9_-]{1,40}$/.test(id) || id === world) return;
    world = id;
    try { localStorage.setItem(WORLD_KEY, id); } catch (e) { /* stockage indisponible */ }
    worldListeners.slice().forEach(function (fn) { try { fn(id); } catch (e) { /* rien */ } });
  }
  /* réglages du panorama (budget du jour), gardés par la page */
  function readSettings() {
    try {
      var s = JSON.parse(localStorage.getItem("sanctuaire.settings") || "{}") || {}, out = {};
      if (typeof s.budget === "number" && s.budget > 0 && s.budget < 1e5) out.budget = s.budget;
      if (typeof s.budgetDay === "string") out.budgetDay = s.budgetDay.slice(0, 40);
      return out;
    } catch (e) { return {}; }
  }
  function saveSettings(s) {
    if (!s || typeof s !== "object") return;
    var out = {};
    if (typeof s.budget === "number" && s.budget > 0 && s.budget < 1e5) out.budget = Math.round(s.budget * 100) / 100;
    if (typeof s.budgetDay === "string") out.budgetDay = s.budgetDay.slice(0, 40);
    try { localStorage.setItem("sanctuaire.settings", JSON.stringify(out)); } catch (e) { /* stockage indisponible */ }
  }
  function download(msg) {
    var u = typeof msg.url === "string" ? msg.url : "", name = typeof msg.name === "string" && /^[a-z0-9-]{1,60}\.png$/.test(msg.name) ? msg.name : "sanctuaire.png";
    if (u.indexOf("data:image/png;base64,") !== 0 || u.length > 15 * 1024 * 1024) return;
    var a = document.createElement("a"); a.href = u; a.download = name; a.style.display = "none";
    document.body.appendChild(a); a.click(); setTimeout(function () { a.remove(); }, 0);
  }
  /* les univers connus du serveur ; un serveur plus ancien n'a que la clairière */
  function loadWorlds() {
    if (!worldsCache) worldsCache = SDK.fetchJSON(API + "/themes")
      .then(function (l) { return Array.isArray(l) && l.length ? l : [{ id: "sanctuaire", names: {} }]; },
            function () { return [{ id: "sanctuaire", names: {} }]; });
    return worldsCache;
  }
  function loadTheme(want) {
    return loadWorlds().then(function (worlds) {
      var id = worlds.some(function (w) { return w.id === want; }) ? want : worlds[0].id;
      if (!themeCache[id]) themeCache[id] = SDK.fetchJSON(API + "/theme?id=" + encodeURIComponent(id))
        .catch(function (e) { delete themeCache[id]; throw e; });
      return themeCache[id].then(function (theme) { return { theme: theme, worlds: worlds, world: id }; });
    });
  }

  function Panorama(props) {
    var ws = useState(world), want = ws[0], setWant = ws[1];
    useEffect(function () {
      worldListeners.push(setWant);
      return function () { worldListeners = worldListeners.filter(function (f) { return f !== setWant; }); };
    }, []);
    return h(Frame, { key: want, want: want, height: props.height });
  }

  function Frame(props) {
    var ref = useRef(null);
    useEffect(function () {
      var alive = true, timer = 0, started = false;
      function post(msg) {
        var f = ref.current;
        if (f && f.contentWindow) f.contentWindow.postMessage(msg, window.location.origin);
      }
      function poll() {
        if (!alive) return;
        if (document.hidden) { timer = setTimeout(poll, POLL_MS * 2); return; }
        SDK.fetchJSON(API + "/state")
          .then(function (st) { post({ type: "sanctuaire:state", state: st }); },
                function () { post({ type: "sanctuaire:lost" }); })
          .then(function () { if (alive) timer = setTimeout(poll, POLL_MS); });
      }
      function onMessage(ev) {
        var f = ref.current;
        if (!f || ev.source !== f.contentWindow || !ev.data) return;
        if (ev.data.type === "sanctuaire:world") { setWorld(ev.data.id); return; }
        if (ev.data.type === "sanctuaire:settings") { saveSettings(ev.data.settings); return; }
        if (ev.data.type === "sanctuaire:download") { download(ev.data); return; }
        if (ev.data.type === "sanctuaire:timeline-request") {
          SDK.fetchJSON(API + "/timeline").then(function (r) { post({ type: "sanctuaire:timeline", events: r && Array.isArray(r.events) ? r.events : [] }); },
            function () { post({ type: "sanctuaire:timeline", events: [] }); });
          return;
        }
        if (ev.data.type !== "sanctuaire:ready" || started) return;
        started = true;
        loadTheme(props.want).then(function (b) {
          if (!alive) return;
          post({ type: "sanctuaire:theme", theme: b.theme, worlds: b.worlds, world: b.world, settings: readSettings() });
          poll();
        }, function () { started = false; });
      }
      window.addEventListener("message", onMessage);
      return function () { alive = false; clearTimeout(timer); window.removeEventListener("message", onMessage); };
    }, []);
    return h("iframe", {
      ref: ref, src: FRAME, title: "Le Sanctuaire Solaire",
      style: { width: "100%", height: props.height, border: 0, borderRadius: "12px", display: "block", background: "#142016" }
    });
  }

  function Page() {
    return h("div", { style: { padding: "8px 0" } },
      h(Panorama, { height: "calc(100vh - 160px)" }));
  }

  function readOpen() { try { return localStorage.getItem("sanctuaire.strip") !== "0"; } catch (e) { return true; } }

  function Strip() {
    var st = useState(readOpen), open = st[0], setOpen = st[1];
    function toggle() {
      var v = !open; setOpen(v);
      try { localStorage.setItem("sanctuaire.strip", v ? "1" : "0"); } catch (e) { /* stockage indisponible */ }
    }
    return h("div", { style: { margin: "0 0 8px" } },
      h("button", {
        type: "button", onClick: toggle, "aria-expanded": open ? "true" : "false",
        className: "text-xs text-muted-foreground",
        style: { background: "none", border: 0, padding: "2px 4px", cursor: "pointer" }
      }, (open ? "\u25BE " : "\u25B8 ") + "\u2600 Sanctuaire"),
      open ? h(Panorama, { height: "200px" }) : null);
  }

  window.__HERMES_PLUGINS__.register(NAME, Page);
  window.__HERMES_PLUGINS__.registerSlot(NAME, "chat:top", Strip);
})();
