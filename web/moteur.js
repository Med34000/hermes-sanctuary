/* Sanctuaire — moteur commun à tous les environnements.
   Le moteur gère : lecture de l'activité de Hermes (etat.json + sentinelle.json), les 5 rôles et leurs états,
   le coordinateur qui se déplace, l'envol, les boucles animées, le journal et la démo.
   L'habillage (décor, personnages, positions, textes) vient d'un fichier themes/<id>/theme.json.
   Rôles fixes : coordination, fabrication, recherche, analyse, securite.
   2026-11-02 ≈19:00 (Europe/Zurich) — Claude (Cowork) — Anthropic, Claude Opus 5.5
   2026-11-03 ≈07:15 (Europe/Zurich) — Claude (Cowork) — Anthropic, Claude Opus 5.5 : le coordinateur crie + lance un avion
   en papier (< 1 s) au lieu de marcher ; la marche devient une promenade quand tout est calme. */
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
  var UI = { fr: {"srcLive": "En direct · Hermes", "srcLost": "Connexion perdue · Hermes", "srcDemo": "Démo · événements simulés", "logLive": "flux en direct", "logLost": "connexion perdue", "logDemo": "flux simulé", "hlLive": "En direct de Hermes", "hlLost": "Connexion perdue · nouvelle tentative", "done": "Terminé", "listening": "Écoute", "and": " et ", "themeMissing": "Habillage introuvable ({e}).", "docTitle": "Sanctuaire · Panorama", "demoBtn": "Démo auto", "scenes": "Les 5 scènes", "loading": "Chargement…", "logTitle": "Sous le capot", "logAria": "Journal", "chatAria": "Discussion avec Kitsune", "folderMenuTitle": "Renommer ou archiver ce dossier", "newBtn": "Nouvelle", "newTitle": "Commencer une nouvelle conversation", "open": "Ouvrir", "close": "Fermer", "foldersTitle": "Dossiers / Projets", "foldersAria": "Dossiers et projets", "folderAdd": "+ Nouveau", "folderAddTitle": "Créer un dossier ou un projet (une conversation à part, gardée par Hermes)", "foldersHint": "Crée un dossier par projet pour ranger tes conversations.", "attach": "Joindre une image", "attachTitle": "Joindre une image (tu peux aussi la coller ou la glisser ici)", "inputAria": "Ton message pour Kitsune", "send": "Envoyer", "removeImg": "Retirer l'image {n}", "activity": "Activité", "sessionTitle": "Sanctuaire", "locale": "fr-CH"},
    en: {"srcLive": "Live · Hermes", "srcLost": "Connection lost · Hermes", "srcDemo": "Demo · simulated events", "logLive": "live feed", "logLost": "connection lost", "logDemo": "simulated feed", "hlLive": "Live from Hermes", "hlLost": "Connection lost · retrying", "done": "Done", "listening": "Listening", "and": " and ", "themeMissing": "Theme not found ({e}).", "docTitle": "Sanctuary · Panorama", "demoBtn": "Auto demo", "scenes": "The 5 scenes", "loading": "Loading…", "logTitle": "Under the hood", "logAria": "Log", "chatAria": "Chat with Kitsune", "folderMenuTitle": "Rename or archive this folder", "newBtn": "New", "newTitle": "Start a new conversation", "open": "Open", "close": "Close", "foldersTitle": "Folders / Projects", "foldersAria": "Folders and projects", "folderAdd": "+ New", "folderAddTitle": "Create a folder or project (a separate conversation, kept by Hermes)", "foldersHint": "Create one folder per project to keep your conversations tidy.", "attach": "Attach an image", "attachTitle": "Attach an image (you can also paste or drop it here)", "inputAria": "Your message to Kitsune", "send": "Send", "removeImg": "Remove image {n}", "activity": "Activity", "sessionTitle": "Sanctuary", "locale": "en-US"} };
  var LANG = (function () {
    var q = new URLSearchParams(location.search).get("lang"), s = null;
    try {
      if (q === "auto") localStorage.removeItem("sanctuaire.lang"); else if (q) localStorage.setItem("sanctuaire.lang", q);
      s = localStorage.getItem("sanctuaire.lang");
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

  function themeId() {
    var q = new URLSearchParams(location.search).get("theme");
    var m = document.querySelector('meta[name="sanctuaire-theme"]');
    return (q || (m && m.content) || "sanctuaire").replace(/[^a-z0-9_-]/gi, "");
  }

  fetch("themes/" + themeId() + "/theme.json", { cache: "no-cache" })
    .then(function (r) { if (!r.ok) throw new Error("theme " + r.status); return r.json(); })
    .then(start)
    .catch(function (e) { var h = $("hl-txt"); if (h) h.textContent = ui("themeMissing", { e: e.message }); });

  function start(T) {
    if (T.i18n && T.i18n[LANG] && (T.lang || "fr") !== LANG) merge(T, T.i18n[LANG]);
    var base = T.base || "", url = function (f) { return base + f; };
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
      a.label.textContent = s === "work" ? c.short + " · " + (alarm ? c.alert : c.work) : s === "done" ? c.short + " · " + ui("done") : s === "listen" ? c.short + " · " + (c.listening || ui("listening")) : c.name;
      clearInterval(a.hit);
      if (s === "work" || s === "listen") a.vStart = performance.now();
      if (s === "work" && c.sprites.hit && !reduce && !a.el.classList.contains("has-video"))
        a.hit = setInterval(function () { a.el.setAttribute("data-hit", "1"); setTimeout(function () { a.el.setAttribute("data-hit", "0"); }, 180); }, 1000);
      if (fly[role]) fly[role].state(s);
      if (s === "work" && role !== "coordination") log(c.short.toUpperCase(), say("work", role));
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

    /* ---- envol (ex. la Chouette part chercher et revient) ---- */
    ROLES.forEach(function (role) {
      var c = R[role]; if (!c || !c.fly) return;
      var F = c.fly, box = el("div", "flyer", pano), sh = el("div", "sheet", box);
      box.style.height = F.h + "%"; box.style.aspectRatio = F.aspect[0] + " / " + F.aspect[1];
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
        mode = "leaving"; wantBack = false; hide(true);
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
    function shout(roles, from) {
      var t = (roles.length === 1 && pick(R[roles[0]].shouts)) || fmt(TX.shoutMany || "Hé {names}, au boulot !", { names: names(roles) });
      if (!t) return;
      shoutEl.textContent = t;
      shoutEl.style.left = from[0] + "%"; shoutEl.style.top = (from[1] - from[2] * 1.45) + "%";
      shoutEl.classList.remove("show"); void shoutEl.offsetWidth; shoutEl.classList.add("show");
      clearTimeout(shoutT); shoutT = setTimeout(function () { shoutEl.classList.remove("show"); }, SHOUT_MS);
      return t;
    }

    /* avion en papier : arc du coordinateur vers le compagnon, nez dans le sens du vol */
    var PLANE = '<svg viewBox="0 0 40 40" aria-hidden="true"><path d="M2 9 L38 20 L12 20 Z" fill="#FFF8EA" stroke="#7A5A3C" stroke-width="1.3" stroke-linejoin="round"/>' +
                '<path d="M2 31 L38 20 L12 20 Z" fill="#EAD7B5" stroke="#7A5A3C" stroke-width="1.3" stroke-linejoin="round"/></svg>';
    function launch(from, role, cb) {
      var c = R[role], p = el("div", "plane", pano); p.innerHTML = PLANE;
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
      var pill = $("src-pill"); if (pill) pill.setAttribute("data-src", m);
      if ($("src-txt")) $("src-txt").textContent = ui(m === "live" ? "srcLive" : m === "lost" ? "srcLost" : "srcDemo");
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
    function apply(e) {
      var now = Date.now(), r = e.renard || {};
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
        if (sen.erreurs_api > prevSen.erreurs_api) log("ALERTE", say("errorApi", "securite"));
        if (sen.erreurs_outils > prevSen.erreurs_outils) log("ALERTE", say("errorTool", "securite"));
        if (sen.approbation.n > prevSen.approbation.n) log("GARDE", say("approval", "securite"));
      }
      prevSen = sen;
    }
    function tick() {
      var now = Date.now();
      if (!demoOn && A.securite) A.securite.el.setAttribute("data-alert", now < alertUntil ? "1" : "0");
      if (approval) lastWork.securite = now;
      var cs = (coordBusy || chatBusyFlag) ? "work" : now - coordDoneAt < DONE_HOLD ? "done" : "rest";
      if (!(cs === "rest" && A.coordination && A.coordination.state === "listen")) set("coordination", cs);
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
    /* un compagnon se met au travail (événement venu du chat) : même logique que le mode direct */
    function pulse(role) {
      if (!A[role]) return;
      chatActive = true; if (demoOn) stopDemo();
      var now = Date.now(); lastWork[role] = now;
      if (role === "coordination") { tick(); return; }
      if (phase[role] !== "work") { phase[role] = "work"; inFlight[role] = true; deliver(role, function () { arrived(role); }); }
      else set(role, "work");
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
    poll();
    setTimeout(function () { if (!isLive && !demoOn && !chatActive) startDemo(); }, 1500);
  }
})();
