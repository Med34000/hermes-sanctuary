/* Sanctuaire — le chat sur le côté du panorama.
   Envoie les messages à Hermes par le relais du serveur (routes /chat/…), lit la réponse en direct et anime
   les compagnons selon les outils utilisés. Rien n'est enregistré par la page, sauf l'identifiant de la
   conversation en cours (dans le navigateur) pour la retrouver après un rechargement.
   2026-11-02 ≈19:40 (Europe/Zurich) — Claude (Cowork) — Anthropic, Claude Opus 5.5 */
(function () {
  "use strict";
  var S, C, T, sessionId = null, busy = false, online = false;
  var $ = function (id) { return document.getElementById(id); };
  var box = $("chat"), list = $("chat-list"), input = $("chat-input"), send = $("chat-send"), status = $("chat-status");
  var HDR = { "Content-Type": "application/json", "X-Sanctuaire": "1" };

  function store(k, v) { try { if (v == null) localStorage.removeItem(k); else localStorage.setItem(k, v); } catch (e) { /* stockage indisponible */ } }
  function load(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
  function fmt(t, v) { return String(t || "").replace(/\{(\w+)\}/g, function (_, k) { return v[k] != null ? v[k] : ""; }); }
  function setStatus(t) { status.textContent = t; var w = list.querySelector(".bubble.typing"); if (w) w.setAttribute("data-wait", t); }

  /* rendu sûr : on échappe tout, puis on autorise gras, code, liens et listes simples */
  function esc(s) { return String(s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }
  function render(md) {
    var h = esc(md || "");
    h = h.replace(/`([^`\n]+)`/g, "<code>$1</code>");
    h = h.replace(/\*\*([^*\n]+)\*\*/g, "<strong>$1</strong>");
    h = h.replace(/\[([^\]\n]+)\]\((https?:\/\/[^\s)]+)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>');
    h = h.replace(/(^|[\s(])(https?:\/\/[^\s<)]+)/g, '$1<a href="$2" target="_blank" rel="noopener noreferrer">$2</a>');
    h = h.replace(/^\s*[-•]\s+(.+)$/gm, "<li>$1</li>").replace(/(<li>[\s\S]*?<\/li>)(?!\s*<li>)/g, "<ul>$1</ul>");
    return h.replace(/\n{2,}/g, "<br><br>").replace(/\n/g, "<br>");
  }

  function bubble(role, text) {
    var li = document.createElement("li"); li.className = "msg " + role;
    var b = document.createElement("div"); b.className = "bubble"; li.appendChild(b);
    if (role === "user") b.textContent = text; else b.innerHTML = render(text);
    list.appendChild(li); list.scrollTop = list.scrollHeight;
    return li;
  }
  function activityBox(li) {
    var d = document.createElement("details"); d.className = "activity"; d.hidden = true;
    var s = document.createElement("summary"); d.appendChild(s);
    var ul = document.createElement("ul"); d.appendChild(ul);
    li.appendChild(d);
    return { el: d, sum: s, ul: ul, n: 0 };
  }
  function addActivity(act, text, cls) {
    var li = document.createElement("li"); li.textContent = text; if (cls) li.className = cls;
    act.ul.appendChild(li); act.n++; act.el.hidden = false;
    act.sum.textContent = (C.activityTitle || "Activité") + " (" + act.n + ")";
    return li;
  }

  /* ---- envoi d'un message et lecture du flux ---- */
  /* Hermes refuse deux conversations avec le même titre : titre daté à la seconde, et nouvel essai sans titre si refus */
  function ensureSession() {
    if (sessionId) return Promise.resolve(sessionId);
    var d = new Date(), p = function (n) { return (n < 10 ? "0" : "") + n; };
    var title = "Sanctuaire · " + d.toLocaleDateString("fr-CH") + " " + p(d.getHours()) + ":" + p(d.getMinutes()) + ":" + p(d.getSeconds());
    function create(body) {
      return fetch("chat/sessions", { method: "POST", headers: HDR, body: JSON.stringify(body) })
        .then(function (r) { if (!r.ok) throw new Error("création de conversation : " + r.status); return r.json(); });
    }
    return create({ title: title })
      .catch(function (e) { console.warn("[Sanctuaire]", e.message, "→ nouvel essai sans titre"); return create({}); })
      .then(function (j) { var s = j.session || j; sessionId = s.id || s.session_id; store("sanctuaire.session", sessionId); return sessionId; });
  }

  function submit(text) {
    text = text.trim(); if (!text || busy) return;
    bubble("user", text); input.value = ""; autosize(); S.listen(false);
    if (!online) { bubble("assistant", C.offline); return; }
    busy = true; send.disabled = true; box.setAttribute("data-busy", "1");
    var li = bubble("assistant", ""), b = li.querySelector(".bubble"), act = activityBox(li), text_ = "", pending = {};
    b.classList.add("typing");
    S.chatBusy(true); setStatus(C.reading);
    var guard = (T.roles.securite || {}).short || "La sentinelle";
    ensureSession().then(function (sid) {
      return fetch("chat/sessions/" + encodeURIComponent(sid) + "/stream", { method: "POST", headers: HDR, body: JSON.stringify({ input: text }) });
    }).then(function (r) {
      if (!r.ok || !r.body) throw new Error(r.status);
      var reader = r.body.getReader(), dec = new TextDecoder(), buf = "";
      function handle(ev, data) {
        var d; try { d = JSON.parse(data); } catch (e) { return; }
        if (ev === "run.started") setStatus(C.reading);
        else if (ev === "tool.started") {
          var role = S.roleOfTool(d.tool_name), c = T.roles[role] || {};
          S.pulse(role);
          setStatus((c.short || "") + " · " + (c.work || "au travail"));
          var line = fmt((C.activity || {})[role] || "{short} ({tool})", { short: c.short || role, tool: d.tool_name, preview: d.preview || d.tool_name });
          /* le même outil plusieurs fois de suite → une seule ligne avec un compteur */
          if (act.last && act.last.tool === d.tool_name && role !== "recherche" && act.last.el.className !== "fail") {
            act.last.n++; act.last.el.textContent = act.last.text + " ×" + act.last.n; act.last.el.className = "run";
            pending[d.tool_name] = act.last.el;
          } else {
            var el = addActivity(act, line, "run");
            act.last = { tool: d.tool_name, el: el, text: line, n: 1 };
            pending[d.tool_name] = el;
          }
        } else if (ev === "tool.completed" || ev === "tool.failed") {
          var l = pending[d.tool_name]; if (l) l.className = (ev === "tool.failed" || d.error) ? "fail" : "ok";
          if (ev === "tool.failed" || d.error) { S.toolFailed(); addActivity(act, fmt((C.activity || {}).failed, { guard: guard, tool: d.tool_name }), "fail"); act.last = null; }
          setStatus(C.thinking);
        } else if (ev === "assistant.delta" && d.delta) {
          text_ += d.delta; b.classList.remove("typing"); b.innerHTML = render(text_.replace(/^\s+/, "")); setStatus(C.writing);
          list.scrollTop = list.scrollHeight;
        } else if (ev === "assistant.completed" && d.content) {
          text_ = d.content; b.classList.remove("typing"); b.innerHTML = render(text_.replace(/^\s+/, ""));
        } else if (ev === "run.failed" || ev === "run.cancelled" || ev === "run.interrupted") {
          if (!text_) { b.classList.remove("typing"); b.innerHTML = render(C.error); }
        }
      }
      function pump() {
        return reader.read().then(function (res) {
          if (res.done) return;
          buf += dec.decode(res.value, { stream: true });
          var parts = buf.split(/\r?\n\r?\n/); buf = parts.pop();
          parts.forEach(function (blk) {
            var ev = "message", data = [];
            blk.split(/\r?\n/).forEach(function (line) {
              if (line.indexOf("event:") === 0) ev = line.slice(6).trim();
              else if (line.indexOf("data:") === 0) data.push(line.slice(5).trim());
            });
            if (data.length) handle(ev, data.join("\n"));
          });
          return pump();
        });
      }
      return pump();
    }).catch(function (e) {
      console.warn("[Sanctuaire] envoi échoué :", e && e.message);
      b.classList.remove("typing"); if (!text_) b.innerHTML = render(C.error);
    }).then(function () {
      busy = false; send.disabled = false; box.removeAttribute("data-busy");
      if (!text_) b.classList.remove("typing");
      S.chatBusy(false); setStatus(C.ready); list.scrollTop = list.scrollHeight;
    });
  }

  /* ---- historique de la conversation en cours ---- */
  function restore() {
    var sid = load("sanctuaire.session"); if (!sid) return;
    fetch("chat/sessions/" + encodeURIComponent(sid) + "/messages", { headers: HDR })
      .then(function (r) { if (!r.ok) throw 0; return r.json(); })
      .then(function (d) {
        var msgs = Array.isArray(d) ? d : (d.messages || d.data || []);
        sessionId = sid;
        msgs.forEach(function (m) {
          var c = typeof m.content === "string" ? m.content : Array.isArray(m.content) ? m.content.map(function (p) { return p.text || ""; }).join("") : "";
          if ((m.role === "user" || m.role === "assistant") && c.trim()) bubble(m.role, c.trim());
        });
      })
      .catch(function () { store("sanctuaire.session", null); });
  }

  /* ---- saisie ---- */
  function autosize() { input.style.height = "auto"; input.style.height = Math.min(input.scrollHeight, 160) + "px"; }
  input.addEventListener("input", function () { autosize(); S.listen(input.value.trim().length > 0); if (input.value.trim()) setStatus(C.listening); else if (!busy) setStatus(C.ready); });
  input.addEventListener("blur", function () { if (!input.value.trim()) S.listen(false); });
  input.addEventListener("keydown", function (e) { if (e.key === "Enter" && !e.shiftKey && !e.isComposing) { e.preventDefault(); submit(input.value); } });
  send.addEventListener("click", function () { submit(input.value); });
  $("chat-new").addEventListener("click", function () {
    if (busy) return; sessionId = null; store("sanctuaire.session", null);
    list.innerHTML = ""; bubble("assistant", C.hello); input.focus();
  });
  var toggle = $("chat-toggle");
  if (toggle) toggle.addEventListener("click", function () {
    var open = box.classList.toggle("open"); toggle.setAttribute("aria-expanded", open); toggle.textContent = open ? "Fermer" : "Ouvrir";
    if (open) setTimeout(function () { input.focus(); }, 350);
  });

  /* ---- démarrage : attendre le moteur, puis vérifier si le relais répond ---- */
  (function wait() {
    if (!window.Sanctuaire || !window.Sanctuaire.theme) return setTimeout(wait, 150);
    S = window.Sanctuaire; T = S.theme; C = T.chat || {};
    $("chat-title").textContent = C.title || "Chat";
    input.placeholder = C.placeholder || "";
    var sc = $("chat-shortcuts");
    (C.shortcuts || []).forEach(function (t) {
      var bt = document.createElement("button"); bt.type = "button"; bt.className = "chip"; bt.textContent = t.replace(/[:\s]+$/, "");
      bt.addEventListener("click", function () { input.value = t; input.focus(); autosize(); S.listen(true); setStatus(C.listening); });
      sc.appendChild(bt);
    });
    bubble("assistant", C.hello); setStatus(C.ready);
    fetch("chat/sessions", { headers: HDR }).then(function (r) { online = r.ok; if (online) restore(); else box.setAttribute("data-offline", "1"); })
      .catch(function () { online = false; box.setAttribute("data-offline", "1"); });
  })();
})();
