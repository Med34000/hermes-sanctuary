/* Sanctuaire — moteur commun à tous les environnements.
   Le moteur gère : lecture de l'activité de Hermes (etat.json + sentinelle.json), les 5 rôles et leurs états,
   le coordinateur qui se déplace, l'envol, les boucles animées, le journal et la démo.
   L'habillage (décor, personnages, positions, textes) vient d'un fichier themes/<id>/theme.json.
   Rôles fixes : coordination, fabrication, recherche, analyse, securite.
   2026-11-02 ≈19:00 (Europe/Zurich) — Claude (Cowork) — Anthropic, Claude Opus 5.5
   2026-11-03 ≈07:15 (Europe/Zurich) — Claude (Cowork) — Anthropic, Claude Opus 5.5 : le coordinateur crie + lance un avion
   en papier (< 1 s) au lieu de marcher ; la marche devient une promenade quand tout est calme.
   2026-11-05 ≈11:00 (Europe/Zurich) — Claude (Cowork) — Anthropic, Claude Opus 5.5 : mode « hôte » pour le plugin Hermes
   (Desktop et tableau de bord) : l'état, l'habillage et les images arrivent par postMessage depuis la page qui
   contient le cadre (meta sanctuaire-source = "host"), au lieu d'être lus sur le serveur. */
(function () {
  "use strict";

  var ROLES = ["coordination", "fabrication", "recherche", "analyse", "securite"];
  var WORKERS = ["fabrication", "recherche", "analyse", "securite"];
  /* noms des clés écrites par le hook Hermes (historiques) → rôles */
  var KEY2ROLE = { renard: "coordination", castor: "fabrication", chouette: "recherche", taupe: "analyse", shiba: "securite" };
  var reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  /* outils de Hermes → rôle (même répartition que le hook côté serveur) */
  var TOOL_ROLE = {
    fabrication: ["write_file", "patch", "terminal", "process", "execute_code", "skill_manage"],
    analyse: ["read_file", "search_files", "memory", "session_search", "skill_view", "skills_list", "todo"],
    recherche: ["web_search", "web_extract", "vision_analyze"],
    coordination: ["send_message", "delegate_task", "clarify", "cronjob"]
  };
  function roleOfTool(name) {
    name = String(name || "");
    for (var r in TOOL_ROLE) if (TOOL_ROLE[r].indexOf(name) >= 0) return r;
    if (/^(browser_|web_)/.test(name)) return "recherche";
    return "fabrication";
  }

  function $(id) { return document.getElementById(id); }
  function el(tag, cls, parent) { var e = document.createElement(tag); if (cls) e.className = cls; if (parent) parent.appendChild(e); return e; }
  function fmt(t, v) { return String(t || "").replace(/\{(\w+)\}/g, function (_, k) { return v[k] != null ? v[k] : ""; }); }
  function sheetPos(f, cols, rows) { return ((f % cols) / Math.max(1, cols - 1) * 100) + "% " + (Math.floor(f / cols) / Math.max(1, rows - 1) * 100) + "%"; }
  function frameOf(elapsed, l) {
    var raw = Math.floor(elapsed / (1000 / l.fps));
    if (l.pingpong) { var per = 2 * (l.frames - 1), r = raw % per; return r < l.frames ? r : per - r; }
    return raw % l.frames;
  }


  /* ---- langue (2026-11-04) : ?lang=fr|en (mémorisée, ?lang=auto pour revenir au navigateur), sinon la langue du
     navigateur ; français pour fr-*, anglais pour tout le reste. Textes du thème : theme.json → "i18n": { "en": {…} } ---- */
  var UI = { fr: {"srcLive": "En direct · Hermes", "srcLost": "Connexion perdue · Hermes", "srcDemo": "Démo · événements simulés", "logLive": "flux en direct", "logLost": "connexion perdue", "logDemo": "flux simulé", "hlLive": "En direct de Hermes", "hlLost": "Connexion perdue · nouvelle tentative", "done": "Terminé", "listening": "Écoute", "and": " et ", "themeMissing": "Habillage introuvable ({e}).", "docTitle": "Sanctuaire · Panorama", "demoBtn": "Démo auto", "scenes": "Les 5 scènes", "loading": "Chargement…", "logTitle": "Sous le capot", "logAria": "Journal", "chatAria": "Discussion avec Kitsune", "folderMenuTitle": "Renommer ou archiver ce dossier", "newBtn": "Nouvelle", "newTitle": "Commencer une nouvelle conversation", "open": "Ouvrir", "close": "Fermer", "foldersTitle": "Dossiers / Projets", "foldersAria": "Dossiers et projets", "folderAdd": "+ Nouveau", "folderAddTitle": "Créer un dossier ou un projet (une conversation à part, gardée par Hermes)", "foldersHint": "Crée un dossier par projet pour ranger tes conversations.", "attach": "Joindre une image", "attachTitle": "Joindre une image (tu peux aussi la coller ou la glisser ici)", "inputAria": "Ton message pour Kitsune", "send": "Envoyer", "removeImg": "Retirer l'image {n}", "activity": "Activité", "sessionTitle": "Sanctuaire", "locale": "fr-CH",
      "src_discord": "Discord", "src_telegram": "Telegram", "src_slack": "Slack", "src_whatsapp": "WhatsApp", "src_signal": "Signal",
      "src_email": "e-mail", "src_api_server": "API", "src_cron": "Tâche planifiée", "srcStart": "{coord} part sur {src}.",
      "srcStartCron": "{coord} lance la tâche planifiée « {name} ».", "fallback": "{name} aboie : Hermes a basculé de {de} vers {vers} (modèle de secours).",
      "fallbackTitle": "Modèle de secours", "approvalWhat": "{name} monte la garde : Hermes demande l'autorisation ({quoi}){ou}.",
      "approvalWhere": ", à valider sur {ou}", "approvalTitle": "Autorisation demandée", "todayBtn": "Aujourd'hui",
      "todayTitle": "Journal du jour", "todayTurns": "Tours", "todayTools": "Outils", "todayAlerts": "Alertes",
      "todaySources": "D'où ça vient", "todayTokens": "Tokens (entrée / sortie)", "todayErrTools": "erreurs d'outils",
      "todayErrApi": "erreurs de fournisseur", "todayFallbacks": "bascules", "todayApprovals": "autorisations",
      "todayEmpty": "Rien encore aujourd'hui.", "todayHours": "Heure par heure", "todayBusiest": "Le plus actif : {name}",
      "srcInteractive": "toi", "src_gateway": "ta messagerie (Discord, Telegram…)",
      "src_desktop": "Desktop", "src_gui": "Desktop", "src_tui": "Terminal (TUI)", "src_cli": "Terminal", "src_local": "Local",
      "src_dashboard": "Tableau de bord", "src_webapp": "Tableau de bord", "src_web": "Web", "src_acp": "Éditeur (ACP)",
      "src_mattermost": "Mattermost", "src_matrix": "Matrix", "src_sms": "SMS", "todayPeak": "Pic : {h} h – {h2} h · {t} tours, {o} outils",
      "todayNow": "maintenant", "heavy": "{name} grogne : un tour vient de lire {tokens} tokens ({src}). La conversation est longue : pense à /new.",
      "heavyTitle": "Tour très lourd", "todayHeavy": "tours trop lourds", "todayHeavyList": "Tours les plus lourds",
      "cardToday": "aujourd'hui", "cardLast": "dernier passage", "cardNever": "pas encore aujourd'hui", "cardRecent": "Derniers outils",
      "cardRole_coordination": "Coordonne chaque tour : reçoit ta demande, répartit le travail et répond. Envoie aussi les messages et délègue.",
      "cardRole_fabrication": "Écrit et exécute : fichiers, modifications, terminal, code.",
      "cardRole_recherche": "Cherche dehors : web, pages, images, navigateur.",
      "cardRole_analyse": "Fouille ce qui existe déjà : fichiers, mémoire, anciennes conversations, skills.",
      "cardRole_securite": "Veille : erreurs d'outils et de fournisseur, bascules de modèle, tours trop lourds, autorisations.",
      "subagents": "{coord} délègue à {n} sous-agent(s).", "soundOn": "Sons activés", "soundOff": "Sons coupés", "soundTitle": "Sons", "worldTitle": "Changer d'univers : {name}",
      "loop": "{name} aboie : Hermes tourne en rond ({outil} {fois} fois avec les mêmes arguments). Jette un œil à la conversation ou arrête-le.",
      "loopTitle": "Hermes tourne en rond", "todayLoops": "boucles", "todayCost": "Coût", "costIncluded": "inclus", "costNone": "—",
      "costNote": "Estimation avec les tarifs de Hermes.", "costPart": " {n} appel(s) sans tarif connu.", "costIncl": " {n} appel(s) inclus dans un abonnement.",
      "costOff": "Coût indisponible avec cette version de Hermes.", "budgetLabel": "Budget du jour ($)", "budgetSave": "OK", "budgetUsed": "Budget : {cost} sur {budget} ({pct} %)",
      "budgetAlert": "{name} aboie : le budget du jour est dépassé ({cost} pour {budget}).", "budgetTitle": "Budget du jour dépassé",
      "shareBtn": "📸 Partager", "shareTitle": "Ma journée avec Hermes", "shareDownload": "Télécharger l'image", "shareClose": "Fermer",
      "shareAlert1": "alerte", "shareBusiest": "le plus actif", "shareFooter": "Hermes Sanctuary · plugin pour Hermes Agent", "shareFile": "ma-journee-avec-hermes",
      "shareMaking": "Préparation de l'image…", "replayBtn": "⏪ Rejouer la journée", "replayEmpty": "Rien à rejouer aujourd'hui.", "replayStop": "Arrêter le replay",
      "replayStart": "Replay de ta journée : {n} événements en accéléré.", "replayDone": "Fin du replay, retour en direct.", "replayLoading": "Chargement de la journée…",
      "loopShort": "Hermes tourne en rond : {outil} ×{fois}", "budgetShort": "Budget du jour dépassé : {cost}", "fallbackShort": "Modèle de secours : {vers}",
      "heavyShort": "Tour très lourd ({tokens} tokens) : pense à /new", "approvalShort": "Autorisation demandée : {quoi}", "apiShort": "Le fournisseur ne répond pas"},
    en: {"srcLive": "Live · Hermes", "srcLost": "Connection lost · Hermes", "srcDemo": "Demo · simulated events", "logLive": "live feed", "logLost": "connection lost", "logDemo": "simulated feed", "hlLive": "Live from Hermes", "hlLost": "Connection lost · retrying", "done": "Done", "listening": "Listening", "and": " and ", "themeMissing": "Theme not found ({e}).", "docTitle": "Sanctuary · Panorama", "demoBtn": "Auto demo", "scenes": "The 5 scenes", "loading": "Loading…", "logTitle": "Under the hood", "logAria": "Log", "chatAria": "Chat with Kitsune", "folderMenuTitle": "Rename or archive this folder", "newBtn": "New", "newTitle": "Start a new conversation", "open": "Open", "close": "Close", "foldersTitle": "Folders / Projects", "foldersAria": "Folders and projects", "folderAdd": "+ New", "folderAddTitle": "Create a folder or project (a separate conversation, kept by Hermes)", "foldersHint": "Create one folder per project to keep your conversations tidy.", "attach": "Attach an image", "attachTitle": "Attach an image (you can also paste or drop it here)", "inputAria": "Your message to Kitsune", "send": "Send", "removeImg": "Remove image {n}", "activity": "Activity", "sessionTitle": "Sanctuary", "locale": "en-US",
      "src_discord": "Discord", "src_telegram": "Telegram", "src_slack": "Slack", "src_whatsapp": "WhatsApp", "src_signal": "Signal",
      "src_email": "e-mail", "src_api_server": "API", "src_cron": "Scheduled task", "srcStart": "{coord} heads off to {src}.",
      "srcStartCron": "{coord} starts the scheduled task “{name}”.", "fallback": "{name} barks: Hermes switched from {de} to {vers} (fallback model).",
      "fallbackTitle": "Fallback model", "approvalWhat": "{name} stands guard: Hermes asks for permission ({quoi}){ou}.",
      "approvalWhere": ", to approve on {ou}", "approvalTitle": "Permission requested", "todayBtn": "Today",
      "todayTitle": "Today's journal", "todayTurns": "Turns", "todayTools": "Tools", "todayAlerts": "Alerts",
      "todaySources": "Where it came from", "todayTokens": "Tokens (in / out)", "todayErrTools": "tool errors",
      "todayErrApi": "provider errors", "todayFallbacks": "fallbacks", "todayApprovals": "permissions",
      "todayEmpty": "Nothing yet today.", "todayHours": "Hour by hour", "todayBusiest": "Busiest: {name}",
      "srcInteractive": "you", "src_gateway": "your messaging app (Discord, Telegram…)",
      "src_desktop": "Desktop", "src_gui": "Desktop", "src_tui": "Terminal (TUI)", "src_cli": "Terminal", "src_local": "Local",
      "src_dashboard": "Dashboard", "src_webapp": "Dashboard", "src_web": "Web", "src_acp": "Editor (ACP)",
      "src_mattermost": "Mattermost", "src_matrix": "Matrix", "src_sms": "SMS", "todayPeak": "Peak: {h}:00 – {h2}:00 · {t} turns, {o} tools",
      "todayNow": "now", "heavy": "{name} growls: a turn just read {tokens} tokens ({src}). The conversation is long: consider /new.",
      "heavyTitle": "Very heavy turn", "todayHeavy": "heavy turns", "todayHeavyList": "Heaviest turns",
      "cardToday": "today", "cardLast": "last seen", "cardNever": "not yet today", "cardRecent": "Recent tools",
      "cardRole_coordination": "Runs every turn: takes your request, hands out the work and answers. Also sends messages and delegates.",
      "cardRole_fabrication": "Writes and runs: files, edits, terminal, code.",
      "cardRole_recherche": "Searches outside: web, pages, images, browser.",
      "cardRole_analyse": "Digs through what already exists: files, memory, past conversations, skills.",
      "cardRole_securite": "Keeps watch: tool and provider errors, model fallbacks, heavy turns, permissions.",
      "subagents": "{coord} delegates to {n} subagent(s).", "soundOn": "Sound on", "soundOff": "Sound off", "soundTitle": "Sound", "worldTitle": "Switch world: {name}",
      "loop": "{name} barks: Hermes is going in circles ({outil} {fois} times with the same arguments). Check the conversation or stop it.",
      "loopTitle": "Hermes is going in circles", "todayLoops": "loops", "todayCost": "Cost", "costIncluded": "included", "costNone": "—",
      "costNote": "Estimated with Hermes's own pricing.", "costPart": " {n} call(s) without a known price.", "costIncl": " {n} call(s) included in a subscription.",
      "costOff": "Cost unavailable with this Hermes version.", "budgetLabel": "Daily budget ($)", "budgetSave": "OK", "budgetUsed": "Budget: {cost} of {budget} ({pct}%)",
      "budgetAlert": "{name} barks: today's budget is exceeded ({cost} for {budget}).", "budgetTitle": "Daily budget exceeded",
      "shareBtn": "📸 Share", "shareTitle": "My day with Hermes", "shareDownload": "Download image", "shareClose": "Close",
      "shareAlert1": "alert", "shareBusiest": "busiest", "shareFooter": "Hermes Sanctuary · a plugin for Hermes Agent", "shareFile": "my-day-with-hermes",
      "shareMaking": "Preparing the image…", "replayBtn": "⏪ Replay the day", "replayEmpty": "Nothing to replay today.", "replayStop": "Stop the replay",
      "replayStart": "Replaying your day: {n} events, sped up.", "replayDone": "Replay over, back to live.", "replayLoading": "Loading the day…",
      "loopShort": "Hermes is going in circles: {outil} ×{fois}", "budgetShort": "Daily budget exceeded: {cost}", "fallbackShort": "Fallback model: {vers}",
      "heavyShort": "Very heavy turn ({tokens} tokens): consider /new", "approvalShort": "Permission requested: {quoi}", "apiShort": "The provider isn't responding"} };
  var LANG = (function () {
    var q = new URLSearchParams(location.search).get("lang") || (window.SANCTUAIRE_LANG || null), s = null;
    try {
      if (!window.SANCTUAIRE_LANG) {
        if (q === "auto") localStorage.removeItem("sanctuaire.lang"); else if (q) localStorage.setItem("sanctuaire.lang", q);
        s = localStorage.getItem("sanctuaire.lang");
      }
    } catch (e) { /* stockage indisponible */ }
    var l = String((q !== "auto" && q) || s || (navigator.languages && navigator.languages[0]) || navigator.language || "en").toLowerCase().slice(0, 2);
    return UI[l] ? l : "en";
  })();
  var LOG_TAGS = { en: { "ALERTE": "ALERT", "DEBUT": "START", "EN DIRECT": "LIVE", "ENVOL": "TAKE-OFF", "GARDE": "GUARD",
    "RESEAU": "NETWORK", "RETOUR": "BACK", "TERMINE": "DONE", "MESSAGE": "MESSAGE" } };
  var QUOTES = { fr: ["« ", " »"], en: ["“", "”"] };
  function ui(k, v) { var t = (UI[LANG] && UI[LANG][k]) || UI.fr[k] || ""; return v ? fmt(t, v) : t; }
  function merge(dst, src) {
    Object.keys(src).forEach(function (k) {
      var a = dst[k], b = src[k];
      if (a && b && typeof a === "object" && typeof b === "object" && !Array.isArray(a) && !Array.isArray(b)) merge(a, b); else dst[k] = b;
    });
    return dst;
  }
  (function applyUI() {
    document.documentElement.lang = LANG;
    document.title = ui("docTitle");
    [["data-i18n", null], ["data-i18n-title", "title"], ["data-i18n-aria", "aria-label"]].forEach(function (x) {
      document.querySelectorAll("[" + x[0] + "]").forEach(function (e) {
        var t = ui(e.getAttribute(x[0])); if (x[1]) e.setAttribute(x[1], t); else e.textContent = t;
      });
    });
  })();

  /* animations du décor : injectées par le moteur pour que tout habillage en profite (page autonome et cadre du plugin) */
  function injectAmbientCSS() {
    if (document.getElementById("sanctuaire-ambient-css")) return;
    var st = document.createElement("style"); st.id = "sanctuaire-ambient-css";
    st.textContent = [
      ".layer{position:absolute;pointer-events:none;background-repeat:no-repeat}",
      ".a-sway{animation:s-sway 7s ease-in-out infinite alternate;will-change:transform}",
      "@keyframes s-sway{0%{transform:rotate(-.32deg) skewX(-.35deg)}100%{transform:rotate(.32deg) skewX(.35deg)}}",
      ".a-flow{background-repeat:repeat-y!important;animation:s-flow 1.3s linear infinite}",
      "@keyframes s-flow{from{background-position:0 0}to{background-position:0 100%}}",
      ".a-flicker,.t-glow{animation:s-flicker 2.6s ease-in-out infinite}",
      ".t-glow{background:radial-gradient(closest-side,var(--c,rgba(255,150,40,.55)),rgba(255,120,30,0));mix-blend-mode:screen}",
      "@keyframes s-flicker{0%,100%{opacity:.55}18%{opacity:.85}31%{opacity:.6}47%{opacity:.95}63%{opacity:.7}82%{opacity:.9}}",
      ".t-smoke i{position:absolute;bottom:0;width:55%;aspect-ratio:1;border-radius:50%;background:radial-gradient(circle,rgba(238,232,222,.8),rgba(225,218,205,.35) 45%,rgba(225,218,205,0) 70%);filter:blur(1.5px);animation:s-smoke 6s linear infinite;opacity:0}",
      "@keyframes s-smoke{0%{transform:translate(-50%,0) scale(.35);opacity:0}12%{opacity:.85}60%{opacity:.55}100%{transform:translate(-5%,-210%) scale(1.9);opacity:0}}",
      ".t-sparkle i{position:absolute;width:5px;height:2px;border-radius:2px;background:rgba(255,248,220,.95);box-shadow:0 0 6px 2px rgba(255,236,170,.7);animation:s-twinkle 2.5s ease-in-out infinite;opacity:0}",
      "@keyframes s-twinkle{0%,100%{opacity:0;transform:scaleX(.4)}50%{opacity:1;transform:scaleX(1.4)}}",
      ".pano.still .layer,.pano.still .layer i{animation:none!important}",
      /* habillage réaliste (« calm ») : pas de respiration ni de sautillement, pas de halo au sol */
      ".pano.calm .actor .breath{animation:none!important}",
      ".pano.calm .actor::before{display:none}",
      /* colombes (sous-agents) : un vol en boucle autour d'un point, ailes qui battent */
      ".dove{position:absolute;width:var(--w,2.4%);aspect-ratio:3/2;margin:0 0 0 calc(var(--w,2.4%) / -2);opacity:0;transition:opacity .8s ease;pointer-events:none;z-index:6;animation:dv-orbit var(--d,9s) linear infinite}",
      ".dove.on{opacity:1}",
      ".dove .dv{position:absolute;inset:0;animation:dv-face var(--d,9s) linear infinite;animation-direction:inherit;animation-delay:inherit}",
      ".dove svg{position:absolute;inset:0;width:100%;height:100%;overflow:visible;filter:drop-shadow(0 1px 1.5px rgba(60,50,35,.35));animation:dv-bob .5s ease-in-out infinite alternate}",
      ".dove .w{transform-box:fill-box;transform-origin:85% 100%;animation:dv-flap .32s ease-in-out infinite alternate}",
      ".dove .w2{animation-delay:-.04s}",
      "@keyframes dv-flap{from{transform:scaleY(1)}to{transform:scaleY(-.55)}}",
      "@keyframes dv-bob{from{transform:translateY(-6%)}to{transform:translateY(6%)}}",
      "@keyframes dv-face{0%,49.9%{transform:scaleX(1)}50%,100%{transform:scaleX(-1)}}",
      "@keyframes dv-orbit{0%{left:calc(var(--cx) - var(--rx));top:var(--cy)}12.5%{left:calc(var(--cx) - var(--rx) * .707);top:calc(var(--cy) - var(--ry) * .707)}25%{left:var(--cx);top:calc(var(--cy) - var(--ry))}37.5%{left:calc(var(--cx) + var(--rx) * .707);top:calc(var(--cy) - var(--ry) * .707)}50%{left:calc(var(--cx) + var(--rx));top:var(--cy)}62.5%{left:calc(var(--cx) + var(--rx) * .707);top:calc(var(--cy) + var(--ry) * .707)}75%{left:var(--cx);top:calc(var(--cy) + var(--ry))}87.5%{left:calc(var(--cx) - var(--rx) * .707);top:calc(var(--cy) + var(--ry) * .707)}100%{left:calc(var(--cx) - var(--rx));top:var(--cy)}}",
      "@media (prefers-reduced-motion: reduce){.dove,.dove .dv,.dove svg,.dove .w{animation:none!important}}"
    ].join("\n");
    document.head.appendChild(st);
  }

  function themeId() {
    var q = new URLSearchParams(location.search).get("theme");
    var m = document.querySelector('meta[name="sanctuaire-theme"]');
    return (q || (m && m.content) || "sanctuaire").replace(/[^a-z0-9_-]/gi, "");
  }

  /* mode hôte (plugin) : la page qui contient le cadre envoie l'habillage, les images (data:/blob:) et l'activité */
  var srcMeta = document.querySelector('meta[name="sanctuaire-source"]');
  var HOSTED = !!(srcMeta && srcMeta.content === "host");
  var ASSETS = {}, WORLDS = [], WORLD = "", SETTINGS = {};
  var hostQueue = [], hostHandler = null;
  function toHost(msg) { try { if (window.parent && window.parent !== window) window.parent.postMessage(msg, "*"); } catch (e) { /* rien */ } }
  if (HOSTED) {
    var started = false;
    window.addEventListener("message", function (ev) {
      var d = ev.data;
      if (!d || typeof d !== "object" || typeof d.type !== "string" || d.type.indexOf("sanctuaire:") !== 0) return;
      if (ev.source && window.parent && ev.source !== window.parent) return;
      if (d.type === "sanctuaire:theme" && !started && d.theme && typeof d.theme === "object") {
        started = true;
        if (Array.isArray(d.worlds)) WORLDS = d.worlds.filter(function (w) {
          return w && typeof w.id === "string" && /^[a-z0-9_-]{1,40}$/.test(w.id);
        }).slice(0, 8);
        WORLD = typeof d.world === "string" ? d.world : "";
        if (d.settings && typeof d.settings === "object") SETTINGS = JSON.parse(JSON.stringify(d.settings));
        if (d.assets && typeof d.assets === "object") Object.keys(d.assets).forEach(function (k) {
          var v = d.assets[k]; if (typeof v === "string" && /^(data:image\/|blob:)/.test(v)) ASSETS[k] = v;
        });
        try { start(d.theme); } catch (e) { var h = $("hl-txt"); if (h) h.textContent = ui("themeMissing", { e: e.message }); }
        return;
      }
      if (hostHandler) hostHandler(d); else if (hostQueue.length < 50) hostQueue.push(d);
    });
    toHost({ type: "sanctuaire:ready" });
  } else {
    fetch("themes/" + themeId() + "/theme.json", { cache: "no-cache" })
      .then(function (r) { if (!r.ok) throw new Error("theme " + r.status); return r.json(); })
      .then(start)
      .catch(function (e) { var h = $("hl-txt"); if (h) h.textContent = ui("themeMissing", { e: e.message }); });
  }

  function start(T) {
    if (T.i18n && T.i18n[LANG] && (T.lang || "fr") !== LANG) merge(T, T.i18n[LANG]);
    var base = T.base || "", url = function (f) { return ASSETS[f] || base + f; };
    var pano = $("pano"), logEl = $("log"), hlTxt = $("hl-txt");
    var R = T.roles, TX = T.texts || {}, A = {};
    var coord = R.coordination;

    /* ---- habillage général ---- */
    document.title = T.title || document.title;
    if ($("title")) $("title").textContent = T.title || "";
    if ($("subtitle")) $("subtitle").textContent = (T.subtitle || "") + " · panorama";
    if (T.colors) Object.keys(T.colors).forEach(function (k) { document.documentElement.style.setProperty("--" + k, T.colors[k]); });
    var bg = "url('" + url(T.background.src) + "')";
    document.documentElement.style.setProperty("--ratio", String(T.background.w / T.background.h));
    pano.style.aspectRatio = T.background.w + " / " + T.background.h;
    pano.style.backgroundImage = bg;
    if ($("backdrop")) $("backdrop").style.backgroundImage = bg;
    if (T.ambience === "rays") el("div", "rays", pano);
    injectAmbientCSS();
    if (HOSTED) T.scenes = null;
    var scenesLink = $("scenes-link");
    /* la vue « 5 scènes » n'existe qu'en français pour l'instant : masquée dans les autres langues */
    if (scenesLink) { if (T.scenes && LANG === (T.lang || "fr")) scenesLink.href = T.scenes; else scenesLink.remove(); }

    /* ---- personnages ---- */
    ROLES.forEach(function (role) {
      var c = R[role]; if (!c) return;
      var a = A[role] = { role: role, c: c, state: "rest", hit: null, vStart: 0 };
      var e = a.el = el("div", "actor", pano);
      e.id = "a-" + role; e.setAttribute("data-role", role); e.setAttribute("data-state", "rest");
      e.tabIndex = 0; e.title = c.name;
      e.style.left = c.pos.x + "%"; e.style.top = c.pos.y + "%"; e.style.height = c.pos.h + "%";
      e.style.aspectRatio = c.aspect[0] + " / " + c.aspect[1];
      if (c.doneSprite === "work") e.setAttribute("data-done-sprite", "work");
      var tag = el("span", "tag", e); el("i", "", tag); a.label = el("b", "", tag); a.label.textContent = c.name;
      /* décalage horizontal de l'étiquette (fraction de sa largeur) quand deux voisins se chevauchent */
      if (c.tagShift) tag.style.transform = "translate(" + (-50 + c.tagShift * 100) + "%, -6px)";
      var sprite = a.sprite = el("div", "sprite", e), breath = el("div", "breath", sprite);
      /* bas de l'image effacé en fondu (personnage derrière un objet du décor) — 2026-11-05 */
      if (c.fade) { var mk = "linear-gradient(to top, transparent 0%, #000 " + c.fade + "%)"; sprite.style.webkitMaskImage = mk; sprite.style.maskImage = mk; }
      ["rest", "work", "hit"].forEach(function (k) {
        if (!c.sprites[k]) return;
        var im = el("img", "p-" + k, breath); im.src = url(c.sprites[k]); im.alt = "";
      });
      function addLoop(l, cls) {
        var v = el("div", "vsheet " + cls, sprite);
        v.style.left = l.place.left + "%"; v.style.top = l.place.top + "%"; v.style.width = l.place.width + "%"; v.style.height = l.place.height + "%";
        v.style.backgroundImage = "url('" + url(l.src) + "')"; v.style.backgroundSize = (l.cols * 100) + "% " + (l.rows * 100) + "%";
        return v;
      }
      if (c.loop) a.vMain = addLoop(c.loop, "main");
      if (c.alertLoop) a.vAlert = addLoop(c.alertLoop, "alert");
      if (c.intro) a.vIntro = addLoop(c.intro, "intro");
      if (c.listen) a.vListen = addLoop(c.listen, "listen");
      /* petite vidéo de pause (2026-11-05) : jouée de temps en temps quand le personnage n'a rien à faire */
      if (c.idle) {
        a.vIdle = addLoop(c.idle, "idle");
        a.idleSrc = c.idle.src;
        var pi = new Image(); pi.onload = function () { a.idleReady = true; }; pi.src = url(c.idle.src);
      }
      if (c.loop) {
        var im = new Image();
        im.onload = function () { e.classList.add("has-video"); clearInterval(a.hit); };
        im.src = url(c.loop.src);
        [c.alertLoop, c.intro, c.listen].forEach(function (l) { if (l) new Image().src = url(l.src); });
      }
      if (T.scenes) {
        var go = function () { location.href = T.scenes + "#" + (Object.keys(KEY2ROLE).filter(function (k) { return KEY2ROLE[k] === role; })[0] || ""); };
        e.addEventListener("click", go);
        e.addEventListener("keydown", function (ev) { if (ev.key === "Enter" || ev.key === " ") { ev.preventDefault(); go(); } });
      }
    });

    /* ---- décor vivant et plans de profondeur (2026-11-05) : theme.layers ----
       type "img" : une découpe du décor (src) placée en % du panorama, devant ("front") ou derrière ("back") les personnages,
                    animée ou non (anim : sway = feuillage, flow = eau qui coule, flicker = lueur) ;
       type "smoke" : des volutes qui montent ; "sparkle" : des reflets (eau, mer) dans une zone (clip en polygon CSS) ;
       type "glow" : une lueur chaude qui vacille (feu). */
    var firstActor = pano.querySelector(".actor");
    (T.layers || []).forEach(function (L) {
      var d = el("div", "layer" + (L.anim ? " a-" + L.anim : "") + (L.type ? " t-" + L.type : ""), pano);
      d.style.left = L.x + "%"; d.style.top = L.y + "%"; d.style.width = L.w + "%"; d.style.height = L.h + "%";
      if (L.z === "back" && firstActor) pano.insertBefore(d, firstActor); else d.style.zIndex = L.zIndex || 4;
      if (L.origin) d.style.transformOrigin = L.origin;
      if (L.blend) d.style.mixBlendMode = L.blend;
      if (L.opacity != null) d.style.opacity = L.opacity;
      if (L.dur) d.style.animationDuration = L.dur + "s";
      if (L.clip) d.style.clipPath = L.clip;
      if (L.mask) { d.style.webkitMaskImage = L.mask; d.style.maskImage = L.mask; }
      if (L.src) {
        d.style.backgroundImage = "url('" + url(L.src) + "')";
        d.style.backgroundSize = L.anim === "flow" ? "100% 50%" : "100% 100%";
      }
      if (L.color) d.style.setProperty("--c", L.color);
      var n = L.count || 0, i;
      for (i = 0; i < n; i++) {
        var p = el("i", "", d);
        if (L.type === "smoke") {
          p.style.left = (40 + Math.random() * 20) + "%"; p.style.animationDelay = (-i * (L.dur || 6) / n).toFixed(2) + "s";
          p.style.animationDuration = (L.dur || 6) + "s";
        } else if (L.type === "sparkle") {
          p.style.left = (Math.random() * 100) + "%"; p.style.top = (Math.random() * 100) + "%";
          p.style.animationDelay = (Math.random() * 3).toFixed(2) + "s"; p.style.animationDuration = (1.6 + Math.random() * 2.4).toFixed(2) + "s";
        }
      }
    });
    if (reduce) pano.classList.add("still");
    if (T.calm) pano.classList.add("calm");

    /* ---- journal et titre ---- */
    function headline(t) {
      if (!hlTxt) return;
      hlTxt.style.opacity = "0";
      setTimeout(function () { hlTxt.textContent = t; hlTxt.style.opacity = "1"; }, 250);
    }
    function log(k, t) {
      headline(t);
      var li = el("li"), tm = el("time", "", li), s = el("span", "", li), g = el("span", "k", s);
      tm.textContent = new Date().toTimeString().slice(0, 8);
      g.textContent = "[" + ((LOG_TAGS[LANG] && LOG_TAGS[LANG][k]) || k) + "] "; s.appendChild(document.createTextNode(t));
      logEl.insertBefore(li, logEl.firstChild);
      while (logEl.children.length > 5) logEl.removeChild(logEl.lastChild);
    }
    function say(key, role) { return fmt(TX[key], { name: role ? R[role].name : "", coord: coord.name }); }

    /* ---- états ---- */
    var fly = {};
    function setState(role, s) {
      var a = A[role]; if (!a || a.state === s) return;
      a.state = s; a.el.setAttribute("data-state", s); a.el.setAttribute("data-hit", "0");
      var c = a.c, alarm = a.el.getAttribute("data-alert") === "1" && c.alert;
      a.label.textContent = s === "work" ? c.short + " · " + (alarm ? c.alert : c.work) : s === "done" ? c.short + " \u2713" : s === "listen" ? c.short + " · " + (c.listening || ui("listening")) : c.name;
      clearInterval(a.hit);
      if (s === "work" || s === "listen") a.vStart = performance.now();
      if (s === "work" && c.sprites.hit && !reduce && !a.el.classList.contains("has-video"))
        a.hit = setInterval(function () { a.el.setAttribute("data-hit", "1"); setTimeout(function () { a.el.setAttribute("data-hit", "0"); }, 180); }, 1000);
      if (fly[role]) fly[role].state(s);
      if (s === "work" && role !== "coordination") log(c.short.toUpperCase(), say("work", role));
      if (s === "work" && role === "fabrication") sound("clink");
      if (s === "work" && role === "analyse") sound("dig");
      if (s === "done") log("TERMINE", say("done", role));
    }

    /* ---- boucles animées (fabrication, analyse, sécurité…) ---- */
    function loops(now) {
      ROLES.forEach(function (role) {
        var a = A[role]; if (!a || !a.vMain || reduce || !a.el.classList.contains("has-video")) return;
        var c = a.c, el2 = now - a.vStart, l, v, ph;
        if (a.state === "listen" && a.vListen) { l = c.listen; v = a.vListen; ph = "listen"; }
        else if (a.state !== "work") return;
        else if (a.vAlert && a.el.getAttribute("data-alert") === "1") { l = c.alertLoop; v = a.vAlert; ph = "alert"; }
        else if (a.vIntro && el2 < c.intro.frames * 1000 / c.intro.fps) { l = c.intro; v = a.vIntro; ph = "intro"; }
        else { l = c.loop; v = a.vMain; ph = "main"; if (a.vIntro) el2 -= c.intro.frames * 1000 / c.intro.fps; }
        if (a.el.getAttribute("data-vphase") !== ph) a.el.setAttribute("data-vphase", ph);
        var f = frameOf(el2, l), key = ph + f;
        if (key !== a.vLast) { a.vLast = key; v.style.backgroundPosition = sheetPos(f, l.cols, l.rows); }
      });
      requestAnimationFrame(loops);
    }
    requestAnimationFrame(loops);

    /* ---- pauses (2026-11-05) : les personnages au repos jouent leur petite vidéo « j'attends du travail »,
       au hasard, presque tout le temps : au plus idleMax à la fois (2 par défaut), un nouveau départ toutes les
       idleEvery secondes ([2, 6] par défaut), et chacun se repose un peu entre deux de ses pauses ---- */
    var idleOn = {}, idleEnd = {}, nextIdle = performance.now() + 2500 + Math.random() * 2500;
    var IDLE_EVERY = Array.isArray(T.idleEvery) ? T.idleEvery : [2, 6], IDLE_MAX = T.idleMax || 2, IDLE_REST = 4000;
    function idleDur(c) { return (c.idle.pingpong ? 2 * (c.idle.frames - 1) : c.idle.frames) * 1000 / c.idle.fps; }
    function idleStop(role, now) { var a = A[role]; if (a) a.el.removeAttribute("data-idle"); delete idleOn[role]; idleEnd[role] = now; }
    function idleTick(now) {
      if (reduce) return;
      Object.keys(idleOn).forEach(function (role) {
        var a = A[role], c = a.c, t = now - idleOn[role];
        if (a.state !== "rest" || a.sprite.style.opacity === "0" || (walking && role === "coordination") || t >= idleDur(c)) { idleStop(role, now); return; }
        var f = frameOf(t, c.idle);
        if (f !== a.idleF) { a.idleF = f; a.vIdle.style.backgroundPosition = sheetPos(f, c.idle.cols, c.idle.rows); }
      });
      if (now < nextIdle || document.hidden || Object.keys(idleOn).length >= IDLE_MAX) return;
      var cand = ROLES.filter(function (r) {
        var x = A[r];
        return x && x.vIdle && x.idleReady && !idleOn[r] && x.state === "rest" && x.sprite.style.opacity !== "0"
          && now - (idleEnd[r] || 0) > IDLE_REST && !(walking && r === "coordination");
      });
      nextIdle = now + (IDLE_EVERY[0] + Math.random() * (IDLE_EVERY[1] - IDLE_EVERY[0])) * 1000;
      if (!cand.length) return;
      var role = cand[Math.floor(Math.random() * cand.length)], b = A[role];
      idleOn[role] = now; b.idleF = 0; b.vIdle.style.backgroundPosition = sheetPos(0, b.c.idle.cols, b.c.idle.rows);
      b.el.setAttribute("data-idle", "1");
    }
    (function idleLoop(now) { idleTick(now); requestAnimationFrame(idleLoop); })(performance.now());
    /* images arrivées après coup (le Desktop envoie les vidéos de pause une fois le panorama affiché) */
    function lateAssets(assets) {
      if (!assets || typeof assets !== "object") return;
      Object.keys(assets).forEach(function (k) { var v = assets[k]; if (typeof v === "string" && /^(data:image\/|blob:)/.test(v)) ASSETS[k] = v; });
      ROLES.forEach(function (r) {
        var a = A[r]; if (!a || !a.vIdle || !ASSETS[a.idleSrc]) return;
        a.vIdle.style.backgroundImage = "url('" + ASSETS[a.idleSrc] + "')";
        var pi = new Image(); pi.onload = function () { a.idleReady = true; }; pi.src = ASSETS[a.idleSrc];
      });
    }

    /* ---- envol (ex. la Chouette part chercher et revient) ---- */
    ROLES.forEach(function (role) {
      var c = R[role]; if (!c || !c.fly) return;
      var F = c.fly, box = el("div", "flyer", pano), sh = el("div", "sheet", box);
      box.style.height = F.h + "%"; box.style.aspectRatio = F.aspect[0] + " / " + F.aspect[1];
      /* point d'ancrage = le corps de l'oiseau dans l'image (et non le centre), pour partir exactement de la branche */
      if (F.anchor) box.style.transform = "translate(" + (-F.anchor[0] * 100) + "%, " + (-F.anchor[1] * 100) + "%)";
      sh.style.backgroundImage = "url('" + url(F.src) + "')"; sh.style.backgroundSize = (F.cols * 100) + "% " + (F.rows * 100) + "%";
      var mode = "perched", wantBack = false, raf = 0, ready = false, img = new Image();
      img.onload = function () { ready = true; }; img.src = url(F.src);
      function hide(h) { A[role].sprite.style.opacity = h ? "0" : ""; }
      function go(from, to, flip, ease, done) {
        cancelAnimationFrame(raf);
        var t0 = performance.now(); box.style.display = "block"; sh.style.transform = flip ? "scaleX(-1)" : "";
        function step(now) {
          var k = Math.min(1, (now - t0) / (F.duration || 2600)), e = ease(k);
          box.style.left = (from[0] + (to[0] - from[0]) * e) + "%";
          box.style.top = (from[1] + (to[1] - from[1]) * e - Math.sin(k * Math.PI) * 6) + "%";
          sh.style.backgroundPosition = sheetPos(frameOf(now - t0, F), F.cols, F.rows);
          if (k < 1) raf = requestAnimationFrame(step); else done();
        }
        raf = requestAnimationFrame(step);
      }
      function leave() {
        mode = "leaving"; wantBack = false; hide(true); sound("hoot");
        go(F.perch, F.away, false, function (k) { return k * k; }, function () {
          box.style.display = "none"; mode = "away"; log("ENVOL", say("flyAway", role));
          if (wantBack) setTimeout(back, 300);
        });
      }
      function back() {
        mode = "returning";
        go(F.away, F.perch, true, function (k) { return 1 - (1 - k) * (1 - k); }, function () {
          box.style.display = "none"; mode = "perched"; hide(false); log("RETOUR", say("flyBack", role));
        });
      }
      fly[role] = {
        state: function (s) {
          if (!ready || reduce) return;
          if (s === "work") { if (mode === "perched") leave(); else if (mode === "leaving") wantBack = false; }
          else { if (mode === "away") back(); else if (mode === "leaving") wantBack = true; }
        }
      };
    });

    /* ---- le coordinateur envoie la tâche : il crie (bulle) et lance un avion en papier, en moins d'une seconde.
       La marche ne sert plus qu'aux promenades quand tout est calme (le travail n'attend jamais le trajet). ---- */
    var W = coord.walk, HOME = [coord.pos.x, coord.pos.y], MS = coord.messenger || {}, ST = coord.stroll || null;
    var FLY_MS = MS.duration || 750, STAGGER = MS.stagger || 160, SHOUT_MS = MS.shoutMs || 3500, RATIO = T.background.w / T.background.h;
    var walker = el("div", "walker", pano), flipBox = el("div", "flip", walker), wSheet = el("div", "sheet", flipBox);
    walker.setAttribute("aria-hidden", "true");
    walker.style.height = W.h + "%"; walker.style.aspectRatio = W.aspect[0] + " / " + W.aspect[1];
    wSheet.style.backgroundImage = "url('" + url(W.src) + "')"; wSheet.style.backgroundSize = (W.cols * 100) + "% " + (W.rows * 100) + "%";
    var walking = false, walkId = 0, pos = HOME.slice(), lastBusy = Date.now();
    function place(x, y, dir) { walker.style.left = x + "%"; walker.style.top = y + "%"; flipBox.style.transform = dir < 0 ? "scaleX(-1)" : ""; }
    function showWalker(on) {
      walking = on; walker.style.display = on ? "block" : "none"; pano.setAttribute("data-walking", on ? "1" : "0");
      if (on) place(pos[0], pos[1], 1); else pos = HOME.slice();
    }
    function walkTo(target, done) {
      var id = ++walkId, from = pos.slice(), dx = target[0] - from[0], dist = Math.abs(dx) + Math.abs(target[1] - from[1]) * .4;
      var dur = Math.max(700, dist / (W.speed || 6) * 1000), t0 = performance.now(), dir = dx >= 0 ? 1 : -1;
      function step(now) {
        if (id !== walkId) return;   /* trajet annulé */
        var k = Math.min(1, (now - t0) / dur);
        pos = [from[0] + dx * k, from[1] + (target[1] - from[1]) * k];
        place(pos[0], pos[1], dir);
        wSheet.style.backgroundPosition = sheetPos(Math.floor((now - t0) / (1000 / (W.fps || 24))) % W.frames, W.cols, W.rows);
        if (k < 1) requestAnimationFrame(step); else done();
      }
      requestAnimationFrame(step);
    }
    function goHome() { if (!walking) return; walkTo(HOME, function () { showWalker(false); }); }

    /* bulle au-dessus du coordinateur */
    var shoutEl = el("div", "shout", pano), shoutT = 0;
    shoutEl.setAttribute("aria-hidden", "true");
    function pick(list) { return list && list.length ? list[Math.floor(Math.random() * list.length)] : ""; }
    function names(roles) {
      var n = roles.map(function (r) { return R[r].short; });
      return n.length < 2 ? n.join("") : n.slice(0, -1).join(", ") + ui("and") + n[n.length - 1];
    }
    /* bulles toujours entières à l'écran (2026-11-06) : dans le cadre recadré et hors de la barre d'outils ;
       la pointe (--ax) reste sur le personnage quand la bulle est décalée sur le côté */
    function fitBubble(b, xPct, yPct) {
      b.style.left = xPct + "%"; b.style.top = yPct + "%"; b.style.removeProperty("--ax");
      var pr = pano.getBoundingClientRect(); if (!pr.width || !pr.height) return;
      var w = b.offsetWidth, h = b.offsetHeight, m = 6, bar = document.querySelector(".bar");
      var x = pr.left + xPct / 100 * pr.width, y = pr.top + yPct / 100 * pr.height;
      var minL = Math.max(pr.left, 0) + m, maxR = Math.min(pr.right, window.innerWidth) - m, minT = Math.max(pr.top, 0) + m;
      var left = Math.max(minL, Math.min(x - w / 2, maxR - w)), top = y - h;
      var br = bar && getComputedStyle(bar).visibility !== "hidden" ? bar.getBoundingClientRect() : null;
      if (br && br.width && left < br.right + 4 && left + w > br.left - 4) minT = Math.max(minT, br.bottom + 6);
      if (top < minT) top = minT;
      b.style.left = ((left + w / 2 - pr.left) / pr.width * 100) + "%";
      b.style.top = ((top + h - pr.top) / pr.height * 100) + "%";
      b.style.setProperty("--ax", Math.round(Math.min(Math.max(x - left, 14), w - 14)) + "px");
    }
    function shout(roles, from) {
      var t = (roles.length === 1 && pick(R[roles[0]].shouts)) || fmt(TX.shoutMany || "Hé {names}, au boulot !", { names: names(roles) });
      if (!t) return;
      shoutEl.textContent = t;
      /* juste au-dessus de la tête : l'étiquette du coordinateur s'efface pendant qu'il crie */
      fitBubble(shoutEl, from[0], from[1] - from[2] * 1.03 - 1);
      shoutEl.classList.remove("show"); void shoutEl.offsetWidth; shoutEl.classList.add("show"); pano.classList.add("shouting");
      clearTimeout(shoutT); shoutT = setTimeout(function () { shoutEl.classList.remove("show"); pano.classList.remove("shouting"); }, SHOUT_MS);
      return t;
    }

    /* avion en papier : arc du coordinateur vers le compagnon, nez dans le sens du vol */
    var PLANE = '<svg viewBox="0 0 40 40" aria-hidden="true"><path d="M2 9 L38 20 L12 20 Z" fill="#FFF8EA" stroke="#7A5A3C" stroke-width="1.3" stroke-linejoin="round"/>' +
                '<path d="M2 31 L38 20 L12 20 Z" fill="#EAD7B5" stroke="#7A5A3C" stroke-width="1.3" stroke-linejoin="round"/></svg>';
    function launch(from, role, cb) {
      var c = R[role], p = el("div", "plane", pano); p.innerHTML = PLANE; sound("whoosh");
      var a = [from[0], from[1] - from[2] * .55], b = [c.pos.x, c.pos.y - c.pos.h * .6];
      var dx = b[0] - a[0], dy = b[1] - a[1], lift = Math.max(7, Math.hypot(dx, dy / RATIO * 2.4) * .22), t0 = performance.now();
      function at(k) { return [a[0] + dx * k, a[1] + dy * k - Math.sin(k * Math.PI) * lift]; }
      function step(now) {
        var k = Math.min(1, (now - t0) / FLY_MS), e = k < .5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2;
        var q = at(e), q2 = at(Math.min(1, e + .02)), ang = Math.atan2(q2[1] - q[1], (q2[0] - q[0]) * RATIO) * 180 / Math.PI;
        p.style.left = q[0] + "%"; p.style.top = q[1] + "%";
        p.style.transform = "translate(-50%, -50%) rotate(" + (k < 1 ? ang : 0) + "deg)";
        if (k < 1) { requestAnimationFrame(step); return; }
        p.remove();
        var poof = el("div", "poof", pano); poof.style.left = b[0] + "%"; poof.style.top = b[1] + "%";
        setTimeout(function () { poof.remove(); }, 500);
        cb();
      }
      requestAnimationFrame(step);
    }

    /* les envois qui arrivent ensemble partent ensemble : une seule bulle, plusieurs avions en éventail */
    var batch = [], batchT = 0;
    function deliver(role, cb) {
      lastBusy = Date.now();
      if (reduce || !R[role]) { cb(); return; }
      batch.push({ role: role, cb: cb });
      clearTimeout(batchT); batchT = setTimeout(flush, 60);
    }
    function flush() {
      var jobs = batch; batch = [];
      if (!jobs.length) return;
      var from = walking ? [pos[0], pos[1], W.h] : [HOME[0], HOME[1], coord.pos.h];
      if (walking) walkId++;   /* en promenade : il s'arrête pour lancer */
      var cri = shout(jobs.map(function (j) { return j.role; }), from);
      if (cri) log(coord.short.toUpperCase(), (QUOTES[LANG] || QUOTES.fr)[0] + cri + (QUOTES[LANG] || QUOTES.fr)[1]);
      jobs.forEach(function (j, i) {
        setTimeout(function () { launch(from, j.role, j.cb); }, i * STAGGER);
      });
      if (walking) setTimeout(goHome, jobs.length * STAGGER + FLY_MS + 300);
    }

    /* promenade : seulement quand personne ne travaille depuis un moment */
    if (ST && !reduce) setInterval(function () {
      var calm = ROLES.every(function (k) { return !A[k] || A[k].state === "rest"; }) && !batch.length;
      if (!calm) { lastBusy = Date.now(); return; }
      if (walking || demoOn || document.hidden || Date.now() - lastBusy < (ST.after || 45000)) return;
      var spots = WORKERS.filter(function (k) { return R[k] && R[k].visit; });
      if (!spots.length) return;
      var target = R[pick(spots)].visit, id;
      pos = HOME.slice(); showWalker(true); lastBusy = Date.now();
      walkTo(target, function () {
        id = walkId;
        setTimeout(function () { if (walking && id === walkId) goHome(); }, ST.pause || 2500);
      });
    }, 3000);

    /* ---- mode direct : lit l'activité écrite par le hook et le plugin ---- */
    var meta = document.querySelector('meta[name="sanctuaire-source"]');
    var SRC = (meta && meta.content) || "etat.json", SRC_SENT = SRC.replace(/etat\.json/, "sentinelle.json");
    var POLL = 2000, WORK_HOLD = 9000, DONE_HOLD = 4000, STALE = 15 * 60;
    var prev = null, prevSen = null, isLive = false, fails = 0, lastWork = {}, phase = {}, inFlight = {}, approval = false, alertUntil = 0;
    var coordBusy = false, chatBusyFlag = false, coordDoneAt = 0, demoOn = false, demoTimer = null, chatActive = false;
    function badge(m) {
      var pill = $("src-pill"), srcT = ui(m === "live" ? "srcLive" : m === "lost" ? "srcLost" : "srcDemo");
      if (pill) { pill.setAttribute("data-src", m); pill.title = srcT; }
      if ($("src-txt")) $("src-txt").textContent = srcT;
      if ($("log-src")) $("log-src").textContent = ui(m === "live" ? "logLive" : m === "lost" ? "logLost" : "logDemo");
      if ($("hl-sub")) $("hl-sub").textContent = ui(m === "live" ? "hlLive" : m === "lost" ? "hlLost" : "srcDemo");
    }
    /* Kitsune arrive chez le compagnon : il travaille au moins un moment, même si la réponse est déjà arrivée */
    function arrived(role) {
      inFlight[role] = false;
      lastWork[role] = Math.max(lastWork[role] || 0, Date.now() - WORK_HOLD + 3000);
      phase[role] = "work"; tick();
    }
    function set(role, s) { phase[role] = s; if (!inFlight[role] && !demoOn) setState(role, s); }
    /* d'où vient le travail (2026-11-05) : plateforme du tour ou nom de la tâche planifiée — noms seulement */
    var INTERACTIVE = ["", "?", "cli", "tui", "desktop", "gui", "dashboard", "webapp", "web", "local", "acp"];
    /* nom lisible d'une plateforme de Hermes (2026-11-05) : Desktop, Terminal, Discord… ; inconnue → son nom, avec une majuscule */
    function platformName(p) {
      p = String(p || "").toLowerCase();
      if (!p || p === "?") return ui("srcInteractive");
      return ui("src_" + p.replace(/[^a-z0-9_]/g, "")) || (p.charAt(0).toUpperCase() + p.slice(1, 24));
    }
    var lastTourT = 0, bgSrc = "", lastState = null;
    function srcName(tr) {
      if (!tr) return "";
      var p = String(tr.plateforme || "").toLowerCase();
      if (tr.tache || p === "cron") return tr.tache ? "\u23F0 " + String(tr.tache).slice(0, 24) : ui("src_cron");
      if (INTERACTIVE.indexOf(p) >= 0) return "";
      return platformName(p);
    }
    function sources(e) {
      var tours = Array.isArray(e.tours) ? e.tours : [], maxT = lastTourT;
      bgSrc = "";
      tours.forEach(function (tr) {
        if (!tr || typeof tr !== "object") return;
        var n = srcName(tr);
        if (n) bgSrc = n;
        if (prev && tr.debut > lastTourT && n)
          log("HERMES", tr.tache ? ui("srcStartCron", { coord: coord.short, name: String(tr.tache).slice(0, 60) }) : ui("srcStart", { coord: coord.short, src: n }));
        if (tr.debut > maxT) maxT = tr.debut;
      });
      lastTourT = maxT;
    }
    function apply(e) {
      var now = Date.now(), r = e.renard || {};
      lastState = e; sources(e); renderToday(); renderCard(); checkBudget();
      showSubagents(((e.sous_agents || {}).actifs) || 0);
      if (!prev) { prev = e; return; }
      var pr = prev.renard || {};
      coordBusy = !!r.en_cours && (e.maj - (r.debut || 0) < STALE);
      if (r.debut !== pr.debut && r.en_cours) log("HERMES", say("request"));
      Object.keys(KEY2ROLE).forEach(function (key) {
        var role = KEY2ROLE[key]; if (role === "coordination") return;
        var cur = (e.animaux || {})[key] || {}, old = (prev.animaux || {})[key] || {};
        if (cur.dernier && cur.dernier !== old.dernier) {
          var idle = phase[role] !== "work"; lastWork[role] = now;
          if (idle && !demoOn) { phase[role] = "work"; inFlight[role] = true; deliver(role, function () { arrived(role); }); }
          else set(role, "work");
        }
      });
      if (r.fin !== pr.fin && !r.en_cours) coordDoneAt = now;
      prev = e; tick();
    }
    function applySen(sen) {
      if (!sen || !sen.approbation) return;
      approval = !!sen.approbation.en_attente && (sen.maj - (sen.approbation.debut || 0) < STALE);
      if (!prevSen) { prevSen = sen; return; }
      if (sen.dernier !== prevSen.dernier) {
        lastWork.securite = Date.now();
        if (sen.erreurs_api > prevSen.erreurs_api || sen.erreurs_outils > prevSen.erreurs_outils) alertUntil = Date.now() + WORK_HOLD;
        if (sen.approbation.n > prevSen.approbation.n) alertUntil = 0;
        if (A.securite) A.securite.el.setAttribute("data-alert", Date.now() < alertUntil ? "1" : "0");
        set("securite", "work");
        if (sen.erreurs_api > prevSen.erreurs_api) { log("ALERTE", say("errorApi", "securite")); guardSay(ui("apiShort")); sound("bark"); }
        if (sen.erreurs_outils > prevSen.erreurs_outils) log("ALERTE", say("errorTool", "securite"));
        if (sen.approbation.n > prevSen.approbation.n) {
          var ap = sen.approbation, ou = ap.ou === "gateway" ? ui("approvalWhere", { ou: ui("src_gateway") }) : "";
          var msgA = ap.quoi ? ui("approvalWhat", { name: R.securite.short, quoi: String(ap.quoi).slice(0, 80), ou: ou }) : say("approval", "securite");
          log("GARDE", msgA); if (ap.quoi) guardSay(ui("approvalShort", { quoi: String(ap.quoi).slice(0, 60) }));
          if (ap.ou === "gateway") toHost({ type: "sanctuaire:notify", kind: "approval", title: ui("approvalTitle"), body: msgA });
        }
        var bs = sen.bascule || {}, pbs = prevSen.bascule || {};
        if ((bs.n || 0) > (pbs.n || 0)) {
          alertUntil = Date.now() + WORK_HOLD;
          if (A.securite) A.securite.el.setAttribute("data-alert", "1");
          var msgB = ui("fallback", { name: R.securite.short, de: shortModel(bs.de), vers: shortModel(bs.vers) });
          log("ALERTE", msgB); guardSay(ui("fallbackShort", { vers: shortModel(bs.vers) }));
          toHost({ type: "sanctuaire:notify", kind: "fallback", title: ui("fallbackTitle"), body: msgB });
          sound("bark");
        }
        var bo = sen.boucle || {}, pbo = prevSen.boucle || {};
        if ((bo.n || 0) > (pbo.n || 0))
          bark(ui("loop", { name: R.securite.short, outil: String(bo.outil || "?").slice(0, 40), fois: bo.fois || 4 }), "loop", ui("loopTitle"),
            ui("loopShort", { outil: String(bo.outil || "?").slice(0, 40), fois: bo.fois || 4 }));
        var lo = sen.lourd || {}, plo = prevSen.lourd || {};
        if ((lo.n || 0) > (plo.n || 0)) {
          alertUntil = Date.now() + WORK_HOLD;
          if (A.securite) A.securite.el.setAttribute("data-alert", "1");
          var msgH = ui("heavy", { name: R.securite.short, tokens: fmtN(lo.tokens), src: platformName(lo.plateforme) });
          log("ALERTE", msgH); guardSay(ui("heavyShort", { tokens: fmtN(lo.tokens) }));
          toHost({ type: "sanctuaire:notify", kind: "heavy", title: ui("heavyTitle"), body: msgH });
          sound("bark");
        }
      }
      prevSen = sen;
    }
    function shortModel(m) { m = String(m || "?"); return m.slice(m.lastIndexOf("/") + 1).slice(0, 40); }
    function tick() {
      var now = Date.now();
      if (!demoOn && A.securite) A.securite.el.setAttribute("data-alert", now < alertUntil ? "1" : "0");
      if (approval) lastWork.securite = now;
      var cs = (coordBusy || chatBusyFlag) ? "work" : now - coordDoneAt < DONE_HOLD ? "done" : "rest";
      if (!(cs === "rest" && A.coordination && A.coordination.state === "listen")) set("coordination", cs);
      /* Kitsune affiche d'où vient le travail en cours (Discord, tâche planifiée…) */
      var ac = A.coordination;
      if (ac && !demoOn) {
        if (ac.state === "work" && bgSrc && coordBusy) { ac.label.textContent = ac.c.short + " \u00B7 " + bgSrc; ac.srcShown = true; }
        else if (ac.srcShown) { ac.srcShown = false; if (ac.state === "work") ac.label.textContent = ac.c.short + " \u00B7 " + ac.c.work; }
      }
      WORKERS.forEach(function (role) {
        if (!lastWork[role]) return;
        var age = now - lastWork[role];
        set(role, age < WORK_HOLD ? "work" : age < WORK_HOLD + DONE_HOLD ? "done" : "rest");
      });
    }
    function poll() {
      fetch(SRC + "?t=" + Date.now(), { cache: "no-store" })
        .then(function (r) { if (!r.ok) throw 0; return r.json(); })
        .then(function (e) {
          if (!e || !e.animaux) throw 0;
          fails = 0;
          if (!isLive) { isLive = true; stopDemo(); log("EN DIRECT", say("live")); }
          badge("live"); apply(e);
          return fetch(SRC_SENT + "?t=" + Date.now(), { cache: "no-store" }).then(function (r) { return r.ok ? r.json() : null; }).then(applySen, function () {});
        })
        .catch(function () { fails++; if (isLive && fails === 3) { badge("lost"); log("RESEAU", say("lost")); } })
        .then(function () { setTimeout(poll, isLive || fails < 2 ? POLL : 30000); });
    }
    setInterval(function () { if (isLive || chatActive) tick(); }, 1000);
    /* mode hôte : l'état fusionné arrive par message (même format que etat.json, avec « sentinelle » dedans),
       plus des événements instantanés du Desktop (outil, début et fin de tour, erreur) */
    function fromHost(d) {
      if (d.type === "sanctuaire:timeline") { startReplay(d.events); return; }
      if (d.type === "sanctuaire:assets") { lateAssets(d.assets); return; }
      if (replaying && d.type === "sanctuaire:state") {
        /* pendant le replay, l'activité réelle est suivie sans être jouée (pas de rattrapage à la fin) */
        if (d.state && d.state.animaux) { lastState = d.state; prev = d.state; if (d.state.sentinelle && d.state.sentinelle.approbation) prevSen = d.state.sentinelle; }
        return;
      }
      if (replaying && d.type === "sanctuaire:event") return;
      if (d.type === "sanctuaire:state") {
        var e = d.state;
        if (!e || typeof e !== "object" || !e.animaux) return;
        fails = 0;
        if (!isLive) { isLive = true; stopDemo(); log("EN DIRECT", say("live")); }
        badge("live"); apply(e); applySen(e.sentinelle);
      } else if (d.type === "sanctuaire:lost") {
        fails++; if (isLive && fails === 3) { badge("lost"); log("RESEAU", say("lost")); }
      } else if (d.type === "sanctuaire:event") {
        if (d.kind === "tool" && typeof d.name === "string") pulse(roleOfTool(d.name.slice(0, 80)));
        else if (d.kind === "turn") { window.Sanctuaire.chatBusy(!!d.busy); if (!d.busy) window.Sanctuaire.settle(); }
        else if (d.kind === "error") window.Sanctuaire.toolFailed();
      }
    }
    /* un compagnon se met au travail (événement venu du chat) : même logique que le mode direct */
    function pulse(role) {
      if (!A[role]) return;
      chatActive = true; if (demoOn) stopDemo();
      var now = Date.now(); lastWork[role] = now;
      if (role === "coordination") { tick(); return; }
      if (phase[role] !== "work") { phase[role] = "work"; inFlight[role] = true; deliver(role, function () { arrived(role); }); }
      else set(role, "work");
    }

    /* ---- journal du jour (2026-11-05) : sommes heure par heure envoyées par le plugin, jour local du navigateur ---- */
    var todayBox = $("today"), todayBody = $("today-body"), todayBtn = $("today-btn");
    function fmtN(n) { n = Number(n) || 0; return n >= 1e6 ? (n / 1e6).toFixed(1) + "M" : n >= 1e4 ? Math.round(n / 1e3) + "k" : n >= 1e3 ? (n / 1e3).toFixed(1) + "k" : String(n); }
    function sameDay(dt, now) { return dt.getFullYear() === now.getFullYear() && dt.getMonth() === now.getMonth() && dt.getDate() === now.getDate(); }
    /* sommes du jour local à partir du journal par heure (tours, outils, alertes, tokens, coût estimé) */
    function todayTotals() {
      var H = (lastState && lastState.h) || {}, now = new Date(), i,
        tot = { t: 0, e: 0, a: 0, b: 0, p: 0, g: 0, r: 0, c: 0, cu: 0, ci: 0, o: {}, s: {}, k: {}, cm: {} }, hours = [], hT = [], hO = [];
      for (i = 0; i < 24; i++) { hours.push(0); hT.push(0); hO.push(0); }
      Object.keys(H).forEach(function (k) {
        var dt = new Date(Number(k) * 3600000), b = H[k] || {};
        if (!sameDay(dt, now)) return;
        ["t", "e", "a", "b", "p", "g", "r", "c", "cu", "ci"].forEach(function (f) { tot[f] += Number(b[f]) || 0; });
        var act = Number(b.t) || 0;
        Object.keys(b.o || {}).forEach(function (x) { tot.o[x] = (tot.o[x] || 0) + (Number(b.o[x]) || 0); act += Number(b.o[x]) || 0; });
        Object.keys(b.s || {}).forEach(function (x) { tot.s[x] = (tot.s[x] || 0) + (Number(b.s[x]) || 0); });
        Object.keys(b.k || {}).forEach(function (x) { var c = tot.k[x] || [0, 0], v = b.k[x] || []; tot.k[x] = [c[0] + (Number(v[0]) || 0), c[1] + (Number(v[1]) || 0)]; });
        Object.keys(b.cm || {}).forEach(function (x) { tot.cm[x] = (tot.cm[x] || 0) + (Number(b.cm[x]) || 0); });
        hours[dt.getHours()] += act; hT[dt.getHours()] += Number(b.t) || 0; hO[dt.getHours()] += act - (Number(b.t) || 0);
      });
      tot.tools = Object.keys(tot.o).reduce(function (n, x) { return n + tot.o[x]; }, 0);
      tot.alerts = tot.e + tot.a + tot.b + tot.p + tot.g + tot.r;
      return { tot: tot, hours: hours, hT: hT, hO: hO };
    }
    function fmtUsd(x) {
      x = Number(x) || 0;
      var v = x > 0 && x < 0.01 ? "<0.01" : x.toFixed(2);
      return LANG === "fr" ? v.replace(".", ",") + " $" : "$" + v;
    }
    function costLabel(tot) {
      if (tot.c > 0) return fmtUsd(tot.c);
      if (tot.ci && !tot.cu) return ui("costIncluded");
      return tot.cu ? ui("costNone") : fmtUsd(0);
    }
    function renderToday() {
      if (!todayBox || !todayBody || todayBox.hidden || !lastState) return;
      var X = todayTotals(), tot = X.tot, hours = X.hours, hT = X.hT, hO = X.hO, now = new Date(), tools = tot.tools, alerts = tot.alerts;
      todayBody.textContent = "";
      if (!tot.t && !tools && !alerts) { el("p", "t-empty", todayBody).textContent = ui("todayEmpty"); return; }
      var big = el("div", "t-big", todayBody);
      [[fmtN(tot.t), "todayTurns"], [fmtN(tools), "todayTools"], [fmtN(alerts), "todayAlerts"], [costLabel(tot), "todayCost"]].forEach(function (x) {
        var c = el("div", "", big); el("b", "", c).textContent = x[0]; el("span", "", c).textContent = ui(x[1]);
      });
      var bud = Number(SETTINGS.budget) || 0;
      if (bud > 0) {
        var pct = Math.round(tot.c / bud * 100), bw = el("div", "t-budget" + (pct >= 100 ? " over" : ""), todayBody);
        el("span", "", bw).textContent = ui("budgetUsed", { cost: fmtUsd(tot.c), budget: fmtUsd(bud), pct: pct });
        el("i", "", el("div", "t-gauge", bw)).style.width = Math.min(100, pct) + "%";
      }
      function section(title) { var sct = el("section", "", todayBody); el("h3", "", sct).textContent = title; return el("ul", "", sct); }
      var keys = Object.keys(tot.o).sort(function (a, b) { return tot.o[b] - tot.o[a]; });
      if (keys.length) {
        var ul = section(ui("todayTools"));
        keys.forEach(function (k) { var role = KEY2ROLE[k], li = el("li", "", ul); el("span", "", li).textContent = role && R[role] ? R[role].name : k; el("b", "", li).textContent = fmtN(tot.o[k]); });
      }
      var srcs = Object.keys(tot.s).sort(function (a, b) { return tot.s[b] - tot.s[a]; });
      if (srcs.length) {
        var ul2 = section(ui("todaySources"));
        srcs.forEach(function (k) { var li = el("li", "", ul2); el("span", "", li).textContent = platformName(k); el("b", "", li).textContent = fmtN(tot.s[k]); });
      }
      if (alerts) {
        var ul3 = section(ui("todayAlerts"));
        [[tot.e, "todayErrTools"], [tot.a, "todayErrApi"], [tot.b, "todayFallbacks"], [tot.r, "todayLoops"], [tot.g, "todayHeavy"], [tot.p, "todayApprovals"]].forEach(function (x) {
          if (!x[0]) return; var li = el("li", "", ul3); el("span", "", li).textContent = ui(x[1]); el("b", "", li).textContent = fmtN(x[0]);
        });
      }
      var heavy = (lastState.lourds || []).filter(function (x) { var d = new Date(x.t * 1000); return d.toDateString() === now.toDateString(); });
      if (heavy.length) {
        var ul5 = section(ui("todayHeavyList"));
        heavy.slice(0, 5).forEach(function (x) {
          var li = el("li", "", ul5), d = new Date(x.t * 1000);
          el("span", "", li).textContent = d.toTimeString().slice(0, 5) + " · " + (x.tache ? "⏰ " + x.tache : platformName(x.plateforme));
          el("b", "", li).textContent = fmtN(x.tokens);
        });
      }
      var models = Object.keys(tot.k);
      if (models.length) {
        var ul4 = section(ui("todayTokens"));
        models.forEach(function (k) {
          var li = el("li", "", ul4), cm = tot.cm[k];
          el("span", "", li).textContent = shortModel(k);
          el("b", "", li).textContent = fmtN(tot.k[k][0]) + " / " + fmtN(tot.k[k][1]) + (cm ? " · " + fmtUsd(cm) : "");
        });
        var note = lastState.prix === false ? ui("costOff") : ui("costNote") + (tot.cu ? ui("costPart", { n: tot.cu }) : "") + (tot.ci ? ui("costIncl", { n: tot.ci }) : "");
        el("p", "t-note", todayBody).textContent = note;
      }
      var hs = el("section", "", todayBody); el("h3", "", hs).textContent = ui("todayHours");
      var bars = el("div", "t-bars", hs), mx = Math.max.apply(null, hours) || 1, peak = hours.indexOf(Math.max.apply(null, hours));
      hours.forEach(function (v, h) {
        var bar = el("i", (h === now.getHours() ? "now" : "") + (h === peak && v ? " peak" : ""), bars);
        bar.style.height = Math.max(2, Math.round(v / mx * 100)) + "%"; bar.title = h + ":00 – " + (h + 1) + ":00 · " + hT[h] + " / " + hO[h];
      });
      var axis = el("div", "t-axis", hs);
      [0, 6, 12, 18, 24].forEach(function (h) { var t = el("span", "", axis); t.textContent = h + (LANG === "fr" ? " h" : ":00"); t.style.left = (h / 24 * 100) + "%"; });
      if (hours[peak]) el("p", "t-peak", hs).textContent = ui("todayPeak", { h: peak, h2: peak + 1, t: hT[peak], o: hO[peak] });
    }

    /* ---- réglages gardés par la page hôte (le cadre du Desktop n'a pas de stockage à lui) ---- */
    if (!HOSTED) { try { SETTINGS = JSON.parse(localStorage.getItem("sanctuaire.settings") || "{}") || {}; } catch (e) { SETTINGS = {}; } }
    function saveSettings() {
      if (HOSTED) toHost({ type: "sanctuaire:settings", settings: SETTINGS });
      else { try { localStorage.setItem("sanctuaire.settings", JSON.stringify(SETTINGS)); } catch (e) { /* stockage indisponible */ } }
    }

    /* ---- le gardien aboie (alerte commune : boucle, budget…) ---- */
    function bark(msg, kind, title, short) {
      alertUntil = Date.now() + WORK_HOLD; lastWork.securite = Date.now();
      if (A.securite) {
        A.securite.el.setAttribute("data-alert", "1");
        if (R.securite.alert && A.securite.state === "work") A.securite.label.textContent = R.securite.short + " \u00B7 " + R.securite.alert;
      }
      set("securite", "work"); log("ALERTE", msg); guardSay(short || msg);
      if (kind) toHost({ type: "sanctuaire:notify", kind: kind, title: title || "", body: msg });
      sound("bark");
    }
    /* la bulle du gardien : l'alerte en clair, au-dessus de lui, quelques secondes (le journal défilant est caché dans le cadre) */
    var guardEl = el("div", "shout guard", pano), guardT = 0;
    guardEl.setAttribute("role", "status");
    function guardHide() { guardEl.classList.remove("show"); pano.classList.remove("guard-on"); }
    guardEl.addEventListener("click", function (ev) { ev.stopPropagation(); guardHide(); });
    function guardSay(text) {
      var c = R.securite; if (!c || !c.pos || !text) return;
      guardEl.textContent = "\u26A0 " + String(text).slice(0, 110);
      /* juste au-dessus du gardien, pointe sur lui ; son étiquette s'efface le temps de la bulle */
      fitBubble(guardEl, c.pos.x, c.pos.y - c.pos.h - 1.5);
      guardEl.classList.remove("show"); void guardEl.offsetWidth; guardEl.classList.add("show"); pano.classList.add("guard-on");
      clearTimeout(guardT); guardT = setTimeout(guardHide, 9000);
    }

    /* ---- budget du jour (2026-11-05) : coût estimé du jour comparé au seuil réglé dans le journal ---- */
    function checkBudget() {
      var bud = Number(SETTINGS.budget) || 0;
      if (!(bud > 0) || !lastState) return;
      var c = todayTotals().tot.c, day = new Date().toDateString();
      if (c >= bud && SETTINGS.budgetDay !== day) {
        SETTINGS.budgetDay = day; saveSettings();
        bark(ui("budgetAlert", { name: R.securite.short, cost: fmtUsd(c), budget: fmtUsd(bud) }), "budget", ui("budgetTitle"), ui("budgetShort", { cost: fmtUsd(c) }));
      }
    }
    /* en haut du journal : les deux boutons, puis le réglage du budget ; les chiffres viennent dessous */
    var actions = todayBox && todayBody ? el("div", "t-actions", null) : null;
    if (actions) {
      todayBox.insertBefore(actions, todayBody);
      var brow2 = el("div", "t-btns", actions), shareBtn = el("button", "", brow2), replayBtn = el("button", "", brow2);
      var brow = el("label", "t-brow", actions), bin = document.createElement("input"), bok = el("button", "", null);
      el("span", "", brow).textContent = ui("budgetLabel");
      bin.type = "number"; bin.min = "0"; bin.step = "0.5"; bin.inputMode = "decimal"; bin.placeholder = "—";
      if (Number(SETTINGS.budget) > 0) bin.value = String(SETTINGS.budget);
      brow.appendChild(bin); bok.type = "button"; bok.textContent = ui("budgetSave"); brow.appendChild(bok);
      var saveBudget = function () {
        var v = Math.round((parseFloat(String(bin.value).replace(",", ".")) || 0) * 100) / 100;
        SETTINGS.budget = v > 0 ? Math.min(v, 100000) : 0; delete SETTINGS.budgetDay; saveSettings(); renderToday(); checkBudget();
      };
      bok.addEventListener("click", saveBudget);
      bin.addEventListener("keydown", function (ev) { if (ev.key === "Enter") saveBudget(); });
      shareBtn.type = replayBtn.type = "button"; shareBtn.textContent = ui("shareBtn"); replayBtn.textContent = ui("replayBtn");
      shareBtn.addEventListener("click", function () { openShare(); });
      if (HOSTED) replayBtn.addEventListener("click", function () { headline(ui("replayLoading")); toHost({ type: "sanctuaire:timeline-request" }); });
      else replayBtn.hidden = true;
    }

    /* ---- carte « Ma journée avec Hermes » (2026-11-05) : le panorama et les chiffres du jour, en image ---- */
    function loadImg(src) {
      return new Promise(function (ok) { var im = new Image(); im.onload = function () { ok(im); }; im.onerror = function () { ok(null); }; im.src = src; });
    }
    function buildCard() {
      var W = 1600, Hc = 900, ratio = T.background.w / T.background.h, PH = Math.round(W / ratio), cv = document.createElement("canvas");
      cv.width = W; cv.height = Hc;
      var g = cv.getContext("2d"), roles = Object.keys(R), layers = (T.layers || []).filter(function (L) { return L.type === "img" && L.src; });
      var srcs = [url(T.background.src)].concat(roles.map(function (k) { var c = R[k]; return url((c.sprites && (c.sprites.rest || c.sprites.work)) || ""); }), layers.map(function (L) { return url(L.src); }));
      return Promise.all(srcs.map(loadImg)).then(function (ims) {
        g.fillStyle = "#1c140c"; g.fillRect(0, 0, W, Hc);
        if (ims[0]) g.drawImage(ims[0], 0, 0, W, PH);
        function layer(L, im) { if (im) g.drawImage(im, L.x / 100 * W, L.y / 100 * PH, L.w / 100 * W, L.h / 100 * PH); }
        layers.forEach(function (L, i) { if (L.z === "back") layer(L, ims[1 + roles.length + i]); });
        roles.forEach(function (k, i) {
          var c = R[k], im = ims[1 + i]; if (!im || !c.pos) return;
          var h = c.pos.h / 100 * PH, ar = c.aspect ? c.aspect[0] / c.aspect[1] : im.width / im.height, w = h * ar;
          g.drawImage(im, c.pos.x / 100 * W - w / 2, c.pos.y / 100 * PH - h, w, h);
        });
        layers.forEach(function (L, i) { if (L.z !== "back") layer(L, ims[1 + roles.length + i]); });
        var fade = g.createLinearGradient(0, PH - 120, 0, PH);
        fade.addColorStop(0, "rgba(28,20,12,0)"); fade.addColorStop(1, "rgba(28,20,12,1)");
        g.fillStyle = fade; g.fillRect(0, PH - 120, W, 120);
        var X = todayTotals(), tot = X.tot, accent = (T.colors && T.colors.accent) || "#E4802F", top = 0, topN = 0;
        Object.keys(tot.o).forEach(function (k) { if (tot.o[k] > topN) { topN = tot.o[k]; top = k; } });
        var serif = "Georgia, 'Times New Roman', serif", sans = "system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif";
        g.textBaseline = "alphabetic"; g.fillStyle = "#F6EAD3"; g.font = "600 46px " + serif;
        g.fillText(ui("shareTitle"), 56, PH + 40);
        g.font = "600 22px " + sans; g.fillStyle = "rgba(246,234,211,.7)"; g.textAlign = "right";
        g.fillText(new Date().toLocaleDateString(LANG === "fr" ? "fr-CH" : "en-US", { weekday: "long", day: "numeric", month: "long", year: "numeric" }), W - 56, PH + 40);
        var role = top ? KEY2ROLE[top] : "", cells = [[fmtN(tot.t), ui("todayTurns")], [fmtN(tot.tools), ui("todayTools")],
          [role && R[role] ? R[role].short : "—", ui("shareBusiest") + (topN ? " · " + topN : "")], [costLabel(tot), ui("todayCost")]];
        var cw = (W - 112) / cells.length;
        cells.forEach(function (c, i) {
          var cx = 56 + cw * i + cw / 2;
          g.textAlign = "center"; g.fillStyle = accent; g.font = "600 " + (String(c[0]).length > 9 ? 38 : 52) + "px " + serif; g.fillText(String(c[0]), cx, PH + 128);
          g.fillStyle = "rgba(246,234,211,.72)"; g.font = "700 17px " + sans; g.fillText(String(c[1]).toUpperCase(), cx, PH + 158);
        });
        g.textAlign = "right"; g.font = "600 17px " + sans; g.fillStyle = "rgba(246,234,211,.55)";
        g.fillText("☀ " + ui("shareFooter") + " · github.com/Med34000/hermes-sanctuary", W - 56, Hc - 22);
        if (tot.alerts) { g.textAlign = "left"; g.fillText((T.roles.securite ? R.securite.short + " · " : "") + tot.alerts + " " + (tot.alerts > 1 ? ui("todayAlerts").toLowerCase() : ui("shareAlert1")), 56, Hc - 22); }
        return cv.toDataURL("image/png");
      });
    }
    var shareBox = null;
    function openShare() {
      if (!shareBox) {
        shareBox = el("div", "share", document.body); shareBox.setAttribute("role", "dialog");
        var inner = el("div", "share-in", shareBox); el("img", "", inner).alt = "";
        var row = el("div", "share-btns", inner), dl = el("button", "primary", row), cl = el("button", "", row);
        dl.type = cl.type = "button"; dl.textContent = ui("shareDownload"); cl.textContent = ui("shareClose");
        cl.addEventListener("click", function () { shareBox.hidden = true; });
        shareBox.addEventListener("click", function (ev) { if (ev.target === shareBox) shareBox.hidden = true; });
        dl.addEventListener("click", function () {
          var u = shareBox.dataset.url || "", name = ui("shareFile") + "-" + new Date().toISOString().slice(0, 10) + ".png";
          if (!u) return;
          if (HOSTED) toHost({ type: "sanctuaire:download", name: name, url: u });
          else { var a = document.createElement("a"); a.href = u; a.download = name; document.body.appendChild(a); a.click(); a.remove(); }
        });
      }
      shareBox.hidden = false; shareBox.dataset.url = "";
      var img = shareBox.querySelector("img"); img.removeAttribute("src"); img.alt = ui("shareMaking");
      buildCard().then(function (u) { shareBox.dataset.url = u; img.src = u; img.alt = ui("shareTitle"); }, function () { img.alt = "?"; });
    }

    /* ---- rejouer ma journée (2026-11-05) : les événements du jour (codes et heures) en accéléré ---- */
    var replaying = false, replayTimer = 0, replayBar = null, CODE2ROLE = { c: "fabrication", o: "recherche", m: "analyse", f: "coordination" };
    function stopReplay(done) {
      if (!replaying) return;
      replaying = false; clearTimeout(replayTimer);
      if (replayBar) replayBar.hidden = true;
      document.body.classList.remove("replay");
      chatBusyFlag = false; coordBusy = false; alertUntil = 0; showSubagents(0);
      WORKERS.forEach(function (role) { lastWork[role] = 0; });
      tick();
      if (done) log("HERMES", ui("replayDone"));
    }
    function startReplay(events) {
      var now = new Date(), ev = (Array.isArray(events) ? events : []).filter(function (e) {
        return Array.isArray(e) && typeof e[1] === "string" && sameDay(new Date(Number(e[0]) * 1000), now);
      });
      if (!ev.length) { headline(ui("replayEmpty")); return; }
      if (todayBox && !todayBox.hidden) { todayBox.hidden = true; if (todayBtn) todayBtn.setAttribute("aria-pressed", "false"); }
      if (demoOn) stopDemo();
      var delays = [], total = 0, i;
      for (i = 0; i < ev.length; i++) {
        var gap = i + 1 < ev.length ? ev[i + 1][0] - ev[i][0] : 2;
        var d = Math.min(Math.max(gap / 60, 0.35), gap > 1200 ? 1.6 : 1.1);
        delays.push(d); total += d;
      }
      var scale = total > 75 ? 75 / total : 1;
      delays = delays.map(function (d) { return Math.max(d * scale, 0.12) * 1000; });
      if (!replayBar) {
        replayBar = el("div", "replay-bar", document.body);
        el("span", "rb-clock", replayBar); el("i", "", el("span", "rb-track", replayBar));
        var stop = el("button", "", replayBar); stop.type = "button"; stop.textContent = "✕"; stop.title = ui("replayStop"); stop.setAttribute("aria-label", ui("replayStop"));
        stop.addEventListener("click", function () { stopReplay(true); });
      }
      replaying = true; coordBusy = false; chatBusyFlag = false; replayBar.hidden = false; document.body.classList.add("replay");
      if (!card.hidden) { card.hidden = true; cardRole = null; }
      log("HERMES", ui("replayStart", { n: ev.length }));
      var clock = replayBar.querySelector(".rb-clock"), bar = replayBar.querySelector(".rb-track i"), subs = 0;
      function act(code) {
        if (CODE2ROLE[code]) { pulse(CODE2ROLE[code]); return; }
        if (code === "T") { chatBusyFlag = true; tick(); }
        else if (code === "E") { chatBusyFlag = false; coordDoneAt = Date.now(); window.Sanctuaire.settle(); }
        else if (code === "e" || code === "a") window.Sanctuaire.toolFailed();
        else if (code === "b" || code === "g" || code === "r" || code === "p") { alertUntil = Date.now() + WORK_HOLD; lastWork.securite = Date.now(); if (A.securite) A.securite.el.setAttribute("data-alert", code === "p" ? "0" : "1"); set("securite", "work"); if (code !== "p") sound("bark"); }
        else if (code === "s") { subs = Math.min(subs + 1, 4); showSubagents(subs); setTimeout(function () { subs = Math.max(0, subs - 1); if (replaying) showSubagents(subs); }, 4000); }
      }
      (function step(k) {
        if (!replaying) return;
        if (k >= ev.length) { replayTimer = setTimeout(function () { stopReplay(true); }, 2500); return; }
        act(ev[k][1]);
        clock.textContent = "⏪ Replay · " + new Date(ev[k][0] * 1000).toTimeString().slice(0, 5);
        bar.style.width = Math.round((k + 1) / ev.length * 100) + "%";
        replayTimer = setTimeout(function () { step(k + 1); }, delays[k]);
      })(0);
    }
    if (todayBtn && todayBox) {
      todayBtn.addEventListener("click", function () {
        todayBox.hidden = !todayBox.hidden; todayBtn.setAttribute("aria-pressed", todayBox.hidden ? "false" : "true"); renderToday();
      });
      var todayClose = $("today-close");
      if (todayClose) todayClose.addEventListener("click", function () { todayBox.hidden = true; todayBtn.setAttribute("aria-pressed", "false"); });
    }

    /* ---- fiche d'un compagnon (2026-11-05) : clic → rôle, compteur du jour, derniers outils ---- */
    var card = el("div", "card", pano), cardRole = null;
    card.hidden = true; card.setAttribute("role", "dialog");
    function roleKey(role) { return Object.keys(KEY2ROLE).filter(function (k) { return KEY2ROLE[k] === role; })[0]; }
    function renderCard() {
      if (!cardRole || card.hidden) return;
      var c = R[cardRole], key = roleKey(cardRole), st = lastState || {}, an = (st.animaux || {})[key] || {}, now = new Date(), n = 0;
      Object.keys(st.h || {}).forEach(function (k) { var d = new Date(Number(k) * 3600000); if (d.toDateString() === now.toDateString()) n += Number(((st.h[k] || {}).o || {})[key]) || 0; });
      if (cardRole === "coordination") Object.keys(st.h || {}).forEach(function (k) { var d = new Date(Number(k) * 3600000); if (d.toDateString() === now.toDateString()) n += Number((st.h[k] || {}).t) || 0; });
      card.textContent = "";
      var head = el("header", "", card); el("b", "", head).textContent = c.name;
      var x = el("button", "", head); x.type = "button"; x.textContent = "\u00D7"; x.setAttribute("aria-label", ui("close"));
      x.addEventListener("click", function (ev) { ev.stopPropagation(); card.hidden = true; cardRole = null; });
      el("p", "c-role", card).textContent = c.desc || ui("cardRole_" + cardRole);
      var stats = el("p", "c-stats", card), last = Number(an.dernier) || 0;
      stats.textContent = n + " \u00B7 " + ui("cardToday") + (last && new Date(last * 1000).toDateString() === now.toDateString() ? " \u00B7 " + ui("cardLast") + " " + new Date(last * 1000).toTimeString().slice(0, 5) : n ? "" : " \u00B7 " + ui("cardNever"));
      var rec = (an.recents || []).slice(0, 5);
      if (rec.length) {
        el("h4", "", card).textContent = ui("cardRecent");
        var ul = el("ul", "", card);
        rec.forEach(function (r) { var li = el("li", "", ul); el("code", "", li).textContent = String(r[0]).slice(0, 40); el("span", "", li).textContent = new Date(r[1] * 1000).toTimeString().slice(0, 5); });
      }
      card.style.left = Math.min(Math.max(c.pos.x, 14), 86) + "%";
      card.style.top = Math.max(4, c.pos.y - c.pos.h - 4) + "%";
      card.setAttribute("aria-label", c.name);
    }
    function openCard(role) {
      if (cardRole === role && !card.hidden) { card.hidden = true; cardRole = null; return; }
      cardRole = role; card.hidden = false; renderCard();
    }
    if (!T.scenes) ROLES.forEach(function (role) {
      var a = A[role]; if (!a) return;
      a.el.addEventListener("click", function (ev) { ev.stopPropagation(); openCard(role); });
      a.el.addEventListener("keydown", function (ev) { if (ev.key === "Enter" || ev.key === " ") { ev.preventDefault(); openCard(role); } });
    });
    pano.addEventListener("click", function () { if (!card.hidden) { card.hidden = true; cardRole = null; } });

    /* ---- sous-agents (2026-11-05) : de petits clones du coordinateur travaillent à côté de lui ---- */
    var subs = [], subsShown = 0, SUB_SLOTS = coord.subagents || [[-4.8, -6], [5.2, -5.5], [-8.8, -4.5], [9.2, -4]];
    /* colombes (2026-11-05, habillage Olympe) : à la place des clones, des colombes tournent au-dessus du temple */
    var DOVES = Array.isArray(T.doves) ? T.doves.slice(0, 4) : null;
    if (DOVES && DOVES.length) SUB_SLOTS = DOVES;
    var DOVE_SVG = '<svg viewBox="0 0 60 40" aria-hidden="true">' +
      '<path class="w w2" d="M31 21 C27 11 20 5 11 5 C17 9 20 14 24 21 Z" fill="#d9d4c8"/>' +
      '<path d="M15 23 C21 17 35 17 43 20 C46 17 51 17 54 20 L59 21.5 L54 23 C51 26 46 26 42 25 C34 29 22 29 15 25 L4 29 L6 24 L2 18 Z" fill="#fbf8f1" stroke="rgba(110,100,85,.45)" stroke-width=".7"/>' +
      '<circle cx="51.3" cy="20.2" r=".9" fill="#2b2620"/>' +
      '<path class="w" d="M33 21 C30 9 23 1 12 1 C19 6 22 13 26 22 Z" fill="#fffdf8" stroke="rgba(110,100,85,.4)" stroke-width=".6"/></svg>';
    function showSubagents(n) {
      n = Math.max(0, Math.min(Number(n) || 0, SUB_SLOTS.length));
      if (n === subsShown) return;
      if (n > subsShown && lastState) log("HERMES", ui("subagents", { coord: coord.short, n: (lastState.sous_agents || {}).actifs || n }));
      subsShown = n;
      var src = coord.sprites && (coord.sprites.work || coord.sprites.rest);
      while (DOVES && subs.length < n) {
        var dv = DOVES[subs.length], d = el("div", "dove", pano), inner = el("div", "dv", d);
        inner.innerHTML = DOVE_SVG;
        d.style.setProperty("--cx", dv.cx + "%"); d.style.setProperty("--cy", dv.cy + "%");
        d.style.setProperty("--rx", dv.rx + "%"); d.style.setProperty("--ry", dv.ry + "%");
        d.style.setProperty("--d", (dv.dur || 9) + "s"); if (dv.w) d.style.setProperty("--w", dv.w + "%");
        d.style.animationDelay = (-(dv.phase || 0) * (dv.dur || 9)).toFixed(2) + "s";
        if (dv.reverse) d.style.animationDirection = "reverse";
        subs.push(d);
      }
      while (subs.length < n) {
        var i = subs.length, slot = SUB_SLOTS[i], m = el("div", "subag", pano), im = el("img", "", m);
        im.src = url(src); im.alt = "";
        m.style.left = (coord.pos.x + slot[0]) + "%"; m.style.top = (coord.pos.y + slot[1]) + "%";
        m.style.height = (coord.pos.h * .5) + "%"; m.style.animationDelay = (i * .17) + "s";
        if (slot[0] > 0) im.style.transform = "translateX(-50%) scaleX(-1)";
        subs.push(m);
      }
      subs.forEach(function (m, i) { m.classList.toggle("on", i < n); });
    }

    /* ---- nuit (2026-11-05) : le soir le panorama s'assombrit et des lucioles apparaissent (heure locale) ---- */
    var night = el("div", "night", pano), flies = el("div", "flies", pano), forced = new URLSearchParams(location.search).get("night");
    pano.insertBefore(night, pano.firstChild);
    for (var fi = 0; fi < 14; fi++) {
      var fl = el("i", "", flies);
      fl.style.left = (8 + Math.random() * 84) + "%"; fl.style.top = (45 + Math.random() * 45) + "%";
      fl.style.animationDelay = (Math.random() * 6).toFixed(2) + "s"; fl.style.animationDuration = (4 + Math.random() * 5).toFixed(2) + "s";
    }
    function nightLevel() {
      if (forced === "1") return 1; if (forced === "0") return 0;
      var d = new Date(), h = d.getHours() + d.getMinutes() / 60;
      if (h >= 21 || h < 5.5) return 1;
      if (h >= 18.5) return (h - 18.5) / 2.5;
      if (h < 7) return (7 - h) / 1.5;
      return 0;
    }
    function applyNight() {
      var lv = reduce ? Math.round(nightLevel()) : nightLevel();
      pano.style.setProperty("--night", lv.toFixed(2));
      pano.setAttribute("data-night", lv > .6 ? "1" : "0");
    }
    applyNight(); setInterval(applyNight, 60000);

    /* ---- sons (2026-11-05) : synthétisés sur place (aucun fichier, aucun réseau), coupés par défaut ---- */
    var soundOn = false, actx = null, lastSound = {}, soundBtn = $("sound-btn");
    try { soundOn = localStorage.getItem("sanctuaire.sound") === "1"; } catch (e) { soundOn = false; }
    function audio() {
      if (!actx) { var AC = window.AudioContext || window.webkitAudioContext; if (!AC) return null; actx = new AC(); }
      if (actx.state === "suspended") actx.resume();
      return actx;
    }
    function tone(ctx, type, f0, f1, t0, dur, vol) {
      var o = ctx.createOscillator(), g = ctx.createGain();
      o.type = type; o.frequency.setValueAtTime(f0, t0); o.frequency.exponentialRampToValueAtTime(f1, t0 + dur);
      g.gain.setValueAtTime(0.0001, t0); g.gain.exponentialRampToValueAtTime(vol, t0 + .02); g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
      o.connect(g); g.connect(ctx.destination); o.start(t0); o.stop(t0 + dur + .05);
    }
    function sound(kind) {
      if (!soundOn || document.hidden) return;
      var now = Date.now(); if (now - (lastSound[kind] || 0) < 1500) return; lastSound[kind] = now;
      var ctx = audio(); if (!ctx) return;
      var t = ctx.currentTime + .01;
      if (kind === "hoot") { tone(ctx, "sine", 420, 380, t, .35, .12); tone(ctx, "sine", 400, 330, t + .45, .55, .12); }
      else if (kind === "bark") { tone(ctx, "sawtooth", 520, 260, t, .12, .07); tone(ctx, "sawtooth", 560, 240, t + .2, .14, .07); }
      else if (kind === "whoosh") { tone(ctx, "triangle", 900, 300, t, .35, .05); }
      else if (kind === "clink") { tone(ctx, "triangle", 1650, 1500, t, .18, .06); tone(ctx, "triangle", 1650, 1480, t + .3, .16, .05); }
      else if (kind === "dig") { tone(ctx, "square", 140, 90, t, .09, .04); tone(ctx, "square", 150, 95, t + .22, .09, .04); }
    }
    function paintSound() {
      if (!soundBtn) return;
      soundBtn.textContent = soundOn ? "\uD83D\uDD0A" : "\uD83D\uDD07";
      soundBtn.setAttribute("aria-pressed", soundOn ? "true" : "false");
      soundBtn.setAttribute("aria-label", ui(soundOn ? "soundOn" : "soundOff")); soundBtn.title = ui("soundTitle");
    }
    if (soundBtn) {
      paintSound();
      soundBtn.addEventListener("click", function () {
        soundOn = !soundOn; paintSound();
        try { localStorage.setItem("sanctuaire.sound", soundOn ? "1" : "0"); } catch (e) { /* stockage indisponible */ }
        if (soundOn) { audio(); sound("hoot"); }
      });

    /* ---- changer d'univers (plugin : la page hôte recharge le cadre avec l'autre habillage) ---- */
    var worldBtn = $("world-btn");
    if (worldBtn && HOSTED && WORLDS.length > 1) {
      var wi = 0;
      WORLDS.forEach(function (w, k) { if (w.id === (WORLD || T.id)) wi = k; });
      var next = WORLDS[(wi + 1) % WORLDS.length];
      var wname = function (w) { var n = (w.names && (w.names[LANG] || w.names.fr)) || w.id; return String(n).slice(0, 24); };
      /* le bouton montre l'univers où l'on va (l'univers actuel est déjà dans le titre) */
      /* bouton rond de la barre épurée (2026-11-06) : l'icône seule, le nom est dans l'infobulle */
      worldBtn.textContent = worldBtn.classList.contains("ico") ? (next.icon ? String(next.icon).slice(0, 4) : "\u21C4")
        : (next.icon ? String(next.icon).slice(0, 4) + " " : "\u21C4 ") + wname(next);
      worldBtn.title = ui("worldTitle", { name: wname(next) });
      worldBtn.setAttribute("aria-label", worldBtn.title);
      worldBtn.hidden = false;
      worldBtn.addEventListener("click", function () { toHost({ type: "sanctuaire:world", id: next.id }); });
    }
    }

    /* ---- démo : le coordinateur distribue des tâches au hasard ---- */
    var demoBtn = $("demo");
    function demoStep() {
      if (!demoOn) return;
      var idle = WORKERS.filter(function (k) { return A[k] && A[k].state === "rest" && !inFlight[k]; });
      if (idle.length) {
        var role = idle[Math.floor(Math.random() * idle.length)]; inFlight[role] = true;
        if (role === "securite") A.securite.el.setAttribute("data-alert", Math.random() < .5 ? "1" : "0");
        setState("coordination", "work");
        deliver(role, function () {
          inFlight[role] = false; if (!demoOn) return;
          setState(role, "work"); setState("coordination", "rest");
          setTimeout(function () { if (demoOn) { setState(role, "done"); setTimeout(function () { if (demoOn) setState(role, "rest"); }, 3000); } }, 5000 + Math.random() * 4000);
        });
      }
      demoTimer = setTimeout(demoStep, 4500 + Math.random() * 3500);
    }
    function startDemo() { demoOn = true; if (demoBtn) demoBtn.setAttribute("aria-pressed", "true"); demoStep(); }
    function stopDemo() { demoOn = false; clearTimeout(demoTimer); if (demoBtn) demoBtn.setAttribute("aria-pressed", "false"); ROLES.forEach(function (k) { inFlight[k] = false; setState(k, phase[k] || "rest"); }); }
    if (demoBtn) demoBtn.addEventListener("click", function () { if (demoOn) stopDemo(); else startDemo(); });

    /* ---- mise en page : titre au-dessus, journal en dessous quand il y a de la place ---- */
    var vp = $("viewport"), bar = document.querySelector(".bar"), logBox = document.querySelector(".log"), hl = $("headline");
    requestAnimationFrame(function () { vp.scrollLeft = (pano.offsetWidth - vp.clientWidth) * .5; });
    function layout() {
      if (!bar || !logBox || !hl) return;
      var r = pano.getBoundingClientRect(), hb = bar.getBoundingClientRect().bottom;
      var top = r.top - hb, bottom = window.innerHeight - r.bottom;
      var ok = top >= 90 && bottom >= logBox.offsetHeight + 24 && window.innerWidth > 700;
      document.body.classList.toggle("bands", ok);
      if (ok) { hl.style.top = (hb + top / 2) + "px"; logBox.style.bottom = Math.max(12, (bottom - logBox.offsetHeight) / 2) + "px"; }
      else logBox.style.bottom = "";
    }
    window.addEventListener("resize", layout);
    new MutationObserver(layout).observe(logEl, { childList: true });
    layout();

    /* API pour le futur chat et les tests */
    window.Sanctuaire = {
      theme: T, lang: LANG, ui: ui, setState: setState, deliver: deliver, log: log,
      alert: function (on) { if (A.securite) A.securite.el.setAttribute("data-alert", on ? "1" : "0"); },
      /* le futur chat : Kitsune écoute pendant qu'on écrit */
      listen: function (on) { var a = A.coordination; if (!a) return; if (on) { lastBusy = Date.now(); goHome(); } if (on && a.state === "rest") setState("coordination", "listen"); else if (!on && a.state === "listen") setState("coordination", "rest"); },
      isLive: function () { return isLive; },
      roleOfTool: roleOfTool, pulse: pulse,
      chatBusy: function (on) {
        chatActive = true; if (demoOn) stopDemo();
        if (on) { lastBusy = Date.now(); goHome(); }
        chatBusyFlag = !!on; if (!on) coordDoneAt = Date.now(); tick();
      },
      /* la réponse arrive : les compagnons encore « au travail » terminent tout de suite (la Chouette rentre) */
      settle: function () {
        var now = Date.now();
        WORKERS.forEach(function (role) { if (lastWork[role] && now - lastWork[role] < WORK_HOLD) lastWork[role] = now - WORK_HOLD; });
        tick();
      },
      toolFailed: function () { chatActive = true; alertUntil = Date.now() + WORK_HOLD; lastWork.securite = Date.now(); if (A.securite) A.securite.el.setAttribute("data-alert", "1"); set("securite", "work"); },
      demoOn: function () { return demoOn; }
    };

    log("DEBUT", say("start"));
    if (HOSTED) { hostHandler = fromHost; hostQueue.splice(0).forEach(fromHost); toHost({ type: "sanctuaire:started" }); }
    else poll();
    setTimeout(function () { if (!isLive && !demoOn && !chatActive) startDemo(); }, 1500);
  }
})();
