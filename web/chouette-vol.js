/* Sanctuaire Solaire — envol de la Chouette Céleste.
   Quand une recherche commence, la Chouette quitte son perchoir et s'envole hors du décor ;
   quand elle se termine, elle revient en volant et se pose. Boucle de vol : 36 images (12 x 3)
   tirées d'une vidéo générée, fond vert retiré.
   2026-11-02 ≈14:00 (Europe/Zurich) — Claude (Cowork) — Anthropic, Claude Opus 5.5 */
(function () {
  "use strict";
  var FRAMES = 36, COLS = 12, ROWS = 3, FPS = 24;
  var reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  /* cfg: container, hide(bool), perch [x%, y%] (centre de l'oiseau posé), away [x%, y%],
     height (% de la hauteur du conteneur), onAway(), onLanded() */
  window.ChouetteVol = function (cfg) {
    var el = document.createElement("div"), sheet = document.createElement("div");
    el.className = "chouette-flyer"; el.setAttribute("aria-hidden", "true");
    el.style.cssText = "position:absolute;pointer-events:none;display:none;transform:translate(-50%,-50%);aspect-ratio:469/400;height:" + cfg.height + "%";
    sheet.style.cssText = "position:absolute;inset:0;background:url('chouette-vol.webp') 0 0/" + (COLS * 100) + "% " + (ROWS * 100) + "% no-repeat";
    el.appendChild(sheet); cfg.container.appendChild(el);

    var mode = "perched", wantBack = false, t0 = 0, raf = 0, ready = false;
    var img = new Image(); img.onload = function () { ready = true; }; img.src = "chouette-vol.webp";

    function frameAt(now) {
      var f = Math.floor((now - t0) / (1000 / FPS)) % FRAMES;
      sheet.style.backgroundPosition = ((f % COLS) / (COLS - 1) * 100) + "% " + (Math.floor(f / COLS) / (ROWS - 1) * 100) + "%";
    }
    function fly(from, to, dur, flip, ease, done) {
      cancelAnimationFrame(raf);
      var start = performance.now(); t0 = start;
      el.style.display = "block";
      sheet.style.transform = flip ? "scaleX(-1)" : "";
      function step(now) {
        var k = Math.min(1, (now - start) / dur), e = ease(k);
        /* légère courbe : monte plus vite au départ, plane à l'arrivée */
        var x = from[0] + (to[0] - from[0]) * e, y = from[1] + (to[1] - from[1]) * e - Math.sin(k * Math.PI) * 6;
        el.style.left = x + "%"; el.style.top = y + "%";
        frameAt(now);
        if (k < 1) raf = requestAnimationFrame(step); else done();
      }
      raf = requestAnimationFrame(step);
    }
    var easeIn = function (k) { return k * k; }, easeOut = function (k) { return 1 - (1 - k) * (1 - k); };

    function leave() {
      mode = "leaving"; wantBack = false; cfg.hide(true);
      fly(cfg.perch, cfg.away, 2600, false, easeIn, function () {
        el.style.display = "none"; mode = "away"; if (cfg.onAway) cfg.onAway();
        if (wantBack) setTimeout(back, 300);
      });
    }
    function back() {
      mode = "returning";
      fly(cfg.away, cfg.perch, 2600, true, easeOut, function () {
        el.style.display = "none"; mode = "perched"; cfg.hide(false); if (cfg.onLanded) cfg.onLanded();
      });
    }
    return {
      /* appelé à chaque changement d'état de la Chouette */
      state: function (s) {
        if (!ready || reduce) return;
        if (s === "work") { if (mode === "perched") leave(); else if (mode === "leaving") wantBack = false; }
        else { if (mode === "away") back(); else if (mode === "leaving") wantBack = true; }
      },
      busy: function () { return mode === "leaving" || mode === "returning"; },
      away: function () { return mode !== "perched"; }
    };
  };
})();
