/* Sanctuaire — moteur commun à tous les environnements.
   Le moteur gère : lecture de l'activité de Hermes (etat.json + sentinelle.json), les 5 rôles et leurs états,
   le coordinateur qui se déplace, l'envol, les boucles animées, le journal et la démo.
   L'habillage (décor, personnages, positions, textes) vient d'un fichier themes/<id>/theme.json.
   Rôles fixes : coordination, fabrication, recherche, analyse, securite.
   2026-11-02 ≈19:00 (Europe/Zurich) — Claude (Cowork) — Anthropic, Claude Opus 5.5 */
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

  function themeId() {
    var q = new URLSearchParams(location.search).get("theme");
    var m = document.querySelector('meta[name="sanctuaire-theme"]');
    return (q || (m && m.content) || "sanctuaire").replace(/[^a-z0-9_-]/gi, "");
  }

  fetch("themes/" + themeId() + "/theme.json", { cache: "no-cache" })
    .then(function (r) { if (!r.ok) throw new Error("theme " + r.status); return r.json(); })
    .then(start)
    .catch(function (e) { var h = $("hl-txt"); if (h) h.textContent = "Habillage introuvable (" + e.message + ")."; });

  function start(T) {
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
    if (scenesLink) { if (T.scenes) scenesLink.href = T.scenes; else scenesLink.remove(); }

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
      g.textContent = "[" + k + "] "; s.appendChild(document.createTextNode(t));
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
      a.label.textContent = s === "work" ? c.short + " · " + (alarm ? c.alert : c.work) : s === "done" ? c.short + " · Terminé" : s === "listen" ? c.short + " · " + (c.listening || "Écoute") : c.name;
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

    /* ---- le coordinateur marche jusqu'au compagnon pour lui remettre la tâche ---- */
    var W = coord.walk, HOME = [coord.pos.x, coord.pos.y];
    var walker = el("div", "walker", pano), flipBox = el("div", "flip", walker), wSheet = el("div", "sheet", flipBox);
    walker.setAttribute("aria-hidden", "true");
    walker.style.height = W.h + "%"; walker.style.aspectRatio = W.aspect[0] + " / " + W.aspect[1];
    wSheet.style.backgroundImage = "url('" + url(W.src) + "')"; wSheet.style.backgroundSize = (W.cols * 100) + "% " + (W.rows * 100) + "%";
    var queue = [], walking = false, pos = HOME.slice();
    function place(x, y, dir) { walker.style.left = x + "%"; walker.style.top = y + "%"; flipBox.style.transform = dir < 0 ? "scaleX(-1)" : ""; }
    function walkTo(target, done) {
      var from = pos.slice(), dx = target[0] - from[0], dist = Math.abs(dx) + Math.abs(target[1] - from[1]) * .4;
      var dur = Math.max(700, dist / (W.speed || 6) * 1000), t0 = performance.now(), dir = dx >= 0 ? 1 : -1;
      function step(now) {
        var k = Math.min(1, (now - t0) / dur);
        pos = [from[0] + dx * k, from[1] + (target[1] - from[1]) * k];
        place(pos[0], pos[1], dir);
        wSheet.style.backgroundPosition = sheetPos(Math.floor((now - t0) / (1000 / (W.fps || 24))) % W.frames, W.cols, W.rows);
        if (k < 1) requestAnimationFrame(step); else done();
      }
      requestAnimationFrame(step);
    }
    function deliver(role, cb) {
      if (reduce || !R[role] || !R[role].visit) { cb(); return; }
      queue.push({ role: role, cb: cb });
      if (!walking) next();
    }
    function next() {
      var job = queue.shift();
      if (!job) {
        walkTo(HOME, function () {
          walking = false;
          if (queue.length) { next(); return; }   /* une tâche est arrivée pendant le retour : on repart */
          walker.style.display = "none"; pano.setAttribute("data-walking", "0");
        });
        return;
      }
      if (!walking) { walking = true; pos = HOME.slice(); place(pos[0], pos[1], 1); walker.style.display = "block"; pano.setAttribute("data-walking", "1"); }
      log("MESSAGE", say("deliver", job.role));
      walkTo(R[job.role].visit, function () { job.cb(); setTimeout(next, 450); });
    }

    /* ---- mode direct : lit l'activité écrite par le hook et le plugin ---- */
    var meta = document.querySelector('meta[name="sanctuaire-source"]');
    var SRC = (meta && meta.content) || "etat.json", SRC_SENT = SRC.replace(/etat\.json/, "sentinelle.json");
    var POLL = 2000, WORK_HOLD = 9000, DONE_HOLD = 4000, STALE = 15 * 60;
    var prev = null, prevSen = null, isLive = false, fails = 0, lastWork = {}, phase = {}, inFlight = {}, approval = false, alertUntil = 0;
    var coordBusy = false, chatBusyFlag = false, coordDoneAt = 0, demoOn = false, demoTimer = null, chatActive = false;
    function badge(m) {
      var pill = $("src-pill"); if (pill) pill.setAttribute("data-src", m);
      if ($("src-txt")) $("src-txt").textContent = m === "live" ? "En direct · Hermes" : m === "lost" ? "Connexion perdue · Hermes" : "Démo · événements simulés";
      if ($("log-src")) $("log-src").textContent = m === "live" ? "flux en direct" : m === "lost" ? "connexion perdue" : "flux simulé";
      if ($("hl-sub")) $("hl-sub").textContent = m === "live" ? "En direct de Hermes" : m === "lost" ? "Connexion perdue · nouvelle tentative" : "Démo · événements simulés";
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
          if (idle && !demoOn) { phase[role] = "work"; inFlight[role] = true; deliver(role, function () { inFlight[role] = false; if (lastWork[role] && phase[role] === "work") lastWork[role] = Math.max(lastWork[role], Date.now() - 1500); set(role, phase[role]); }); }
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
      if (phase[role] !== "work") { phase[role] = "work"; inFlight[role] = true; deliver(role, function () { inFlight[role] = false; if (lastWork[role] && phase[role] === "work") lastWork[role] = Math.max(lastWork[role], Date.now() - 1500); set(role, phase[role]); }); }
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
          inFlight[role] = false; setState(role, "work"); setState("coordination", "rest");
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
      theme: T, setState: setState, deliver: deliver, log: log,
      alert: function (on) { if (A.securite) A.securite.el.setAttribute("data-alert", on ? "1" : "0"); },
      /* le futur chat : Kitsune écoute pendant qu'on écrit */
      listen: function (on) { var a = A.coordination; if (!a) return; if (on && a.state === "rest") setState("coordination", "listen"); else if (!on && a.state === "listen") setState("coordination", "rest"); },
      isLive: function () { return isLive; },
      roleOfTool: roleOfTool, pulse: pulse,
      chatBusy: function (on) {
        chatActive = true; if (demoOn) stopDemo();
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
    setTimeout(function () { if (!isLive && !demoOn) startDemo(); }, 1500);
  }
})();
