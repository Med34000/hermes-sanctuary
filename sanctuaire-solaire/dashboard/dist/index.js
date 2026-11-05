/* Le Sanctuaire Solaire — dashboard half (web dashboard of Hermes).
   A "Sanctuaire" tab with the full panorama, and a foldable strip above the Chat tab.
   The panorama runs in an iframe (app/frame.html, same engine as the standalone page); this bundle feeds it the
   theme and the merged activity read from the plugin's own routes. No other network call.
   2026-11-05 ≈11:35 (Europe/Zurich) — Claude (Cowork) — Anthropic, Claude Opus 5.5, pour Médéric Morin
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
  var themeCache = null;

  function loadTheme() {
    if (!themeCache) themeCache = SDK.fetchJSON(API + "/theme?id=sanctuaire").catch(function (e) { themeCache = null; throw e; });
    return themeCache;
  }

  function Panorama(props) {
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
        if (!f || ev.source !== f.contentWindow || !ev.data || ev.data.type !== "sanctuaire:ready" || started) return;
        started = true;
        loadTheme().then(function (theme) {
          if (!alive) return;
          post({ type: "sanctuaire:theme", theme: theme });
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
