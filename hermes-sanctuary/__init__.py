"""Hermes Sanctuary — activity hooks (agent half of the plugin).

Records WHICH tools Hermes uses and WHEN, so the Sanctuary companions can react:
tool names, turn start/end times and where a turn comes from (platform name, scheduled
task name), error / fallback / approval counters, the generic description Hermes gives
for an approval ("recursive delete"…), model names and token counts per hour.
Never messages, replies, tool arguments, commands, results, error texts, ids or paths.
To spot a loop, a short hash of each call (tool name + arguments) is kept IN MEMORY for the
current turn only; it is never written anywhere.

Each Hermes process (gateway, dashboard chat, Desktop backend, cron) writes its own
small file in <hermes home>/plugin-data/hermes-sanctuary/proc/; the dashboard
route (dashboard/plugin_api.py) merges them. Hooks never raise and never return a
directive: Hermes is never blocked, changed or slowed.

2026-11-05 ≈11:15 (Europe/Zurich) — Claude (Cowork) — Anthropic, Claude Opus 5.5, pour Médéric Morin
2026-11-05 ≈12:30 — sources des tours (plateforme, tâche planifiée), bascules de modèle, journal par heure,
                     description des approbations
2026-11-05 ≈13:20 — tours trop lourds (tokens d'entrée), derniers outils par compagnon, sous-agents en cours
2026-11-05 ≈15:40 — « Hermes tourne en rond » (même outil, mêmes arguments : empreinte gardée en mémoire seulement,
                     jamais écrite), tokens détaillés par fournisseur et modèle pour le coût du jour,
                     fil de la journée (codes d'événements et heures) pour le replay
Copyright 2026 Médéric Morin — Apache License 2.0
"""

from __future__ import annotations

import hashlib
import json
import os
import threading
from collections import deque
import time
from pathlib import Path
from typing import Any

PLUGIN_ID = "hermes-sanctuary"

# Tool name -> companion key (same mapping as the page; keys kept from v1 for compatibility)
CARTE = {
    "castor": {"write_file", "patch", "terminal", "process", "execute_code", "skill_manage"},
    "taupe": {"read_file", "search_files", "memory", "session_search", "skill_view", "skills_list", "todo"},
    "chouette": {"web_search", "web_extract", "vision_analyze"},
    "renard": {"send_message", "delegate_task", "clarify", "cronjob"},
}
PREFIXES = (("browser_", "chouette"), ("web_", "chouette"))
ANIMAUX = ("castor", "chouette", "taupe", "renard", "shiba")
_OK = {"ok", "success", "succeeded", "completed", "done"}
KEEP_SECONDS = 2 * 24 * 3600  # files of processes gone for 2 days are removed at start-up
KEEP_HOURS = 49               # hourly journal kept ~2 days (the page shows "today" in its own time zone)
ERROR_WINDOW = 300            # an API error this recent makes a model change count as a fallback
HEAVY_TOKENS = 200_000        # input tokens summed over one turn above which the Shiba warns (long conversation)
LOOP_WINDOW = 12              # last calls of a turn compared for a loop
LOOP_REPEAT = 4               # the same call (tool + arguments) this many times in the window = Hermes goes in circles
TIMELINE_MAX = 900            # events kept for the replay of the day (codes and times only)
TIMELINE_SECONDS = 26 * 3600
# event codes of the replay: companion of a tool, turn start/end, alerts
CODE = {"castor": "c", "chouette": "o", "taupe": "m", "renard": "f"}

_lock = threading.Lock()
_ctx: Any = None
_actifs: dict[str, dict] = {}      # session -> {"plateforme", "tache", "debut", "modele"}
_derniere_erreur_api = 0.0
_appels: dict[str, deque] = {}      # session -> hashes of the last calls of the current turn (memory only)
_signales: dict[str, set] = {}      # session -> hashes already reported as a loop this turn
_etat: dict[str, Any] = {
    "v": 3,
    "maj": 0,
    "animaux": {a: {"dernier": 0, "n": 0} for a in ANIMAUX},
    "renard": {"en_cours": False, "debut": 0, "fin": 0},
    "tours": [],
    "lourds": [],
    "sous_agents": {"actifs": 0, "debut": 0, "n": 0},
    "sentinelle": {
        "maj": 0,
        "dernier": 0,
        "erreurs_outils": 0,
        "erreurs_api": 0,
        "approbation": {"en_attente": False, "debut": 0, "fin": 0, "n": 0, "quoi": "", "ou": ""},
        "bascule": {"n": 0, "dernier": 0, "de": "", "vers": ""},
        "lourd": {"n": 0, "dernier": 0, "tokens": 0, "plateforme": ""},
        "boucle": {"n": 0, "dernier": 0, "outil": "", "fois": 0, "plateforme": ""},
    },
    "h": {},
    "j": [],
}
_fichier: Path | None = None


def _dossier() -> Path:
    try:
        from plugins.plugin_storage import plugin_data_dir  # sanctioned per-plugin data root

        base = Path(plugin_data_dir(PLUGIN_ID))
    except Exception:
        home = os.environ.get("HERMES_HOME", "").strip() or os.path.join(os.path.expanduser("~"), ".hermes")
        base = Path(home) / "plugin-data" / PLUGIN_ID
    d = base / "proc"
    d.mkdir(parents=True, exist_ok=True)
    return d


def _nettoyer(d: Path) -> None:
    limite = time.time() - KEEP_SECONDS
    for f in d.glob("*.json"):
        try:
            if f.stat().st_mtime < limite:
                f.unlink()
        except OSError:
            pass


def _cible() -> Path:
    global _fichier
    if _fichier is None:
        d = _dossier()
        _nettoyer(d)
        _fichier = d / f"{os.getpid()}-{int(time.time())}.json"
    return _fichier


def _ecrire() -> None:
    f = _cible()
    tmp = f.with_suffix(".tmp")
    with open(tmp, "w", encoding="utf-8") as fh:
        json.dump(_etat, fh, separators=(",", ":"))
    os.replace(tmp, f)


def _maj(fn) -> None:
    try:
        t = round(time.time(), 1)
        with _lock:
            if fn(t) is False:
                return
            _etat["maj"] = t
            _ecrire()
    except Exception:
        pass


def _court(x: Any, n: int = 60) -> str:
    return "".join(c for c in str(x or "") if c.isalnum() or c in "_-.:/@")[:n]


def _texte(x: Any, n: int = 80) -> str:
    """A short, single-line label (task name, approval description). No control characters."""
    s = " ".join(str(x or "").split())
    return "".join(c for c in s if c.isprintable())[:n]


def _animal(nom: str) -> str | None:
    for a, noms in CARTE.items():
        if nom in noms:
            return a
    for p, a in PREFIXES:
        if nom.startswith(p):
            return a
    return "castor" if nom else None


def _touche(a: str, t: float, outil: str = "") -> None:
    x = _etat["animaux"][a]
    x["dernier"] = t
    x["n"] += 1
    if outil:
        x["outil"] = outil
        r = [e for e in x.get("recents", []) if e[0] != outil][:4]
        x["recents"] = [[outil, t]] + r


def _heure(t: float) -> dict:
    """Bucket of the hourly journal for time t (key = hours since epoch, UTC)."""
    h = _etat["h"]
    k = str(int(t // 3600))
    if k not in h:
        limite = int(t // 3600) - KEEP_HOURS
        for old in [x for x in h if int(x) < limite]:
            del h[old]
        h[k] = {"t": 0, "o": {}, "e": 0, "a": 0, "b": 0, "p": 0, "g": 0, "r": 0, "s": {}, "k": {}, "u": {}}
    b = h[k]
    for f in ("r",):
        b.setdefault(f, 0)
    b.setdefault("u", {})
    return b


def _fil(t: float, code: str) -> None:
    """One event of the day for the replay: [time, code]. Never a name, an argument or a text."""
    j = _etat.setdefault("j", [])
    j.append([t, code])
    if len(j) > TIMELINE_MAX or (j and t - j[0][0] > TIMELINE_SECONDS):
        limite = t - TIMELINE_SECONDS
        _etat["j"] = [e for e in j if e[0] >= limite][-TIMELINE_MAX:]


def _plus(d: dict, cle: str, n: int = 1, limite: int = 20) -> None:
    if cle and (cle in d or len(d) < limite):
        d[cle] = d.get(cle, 0) + n


def _tours() -> list:
    return [{"plateforme": v["plateforme"], "tache": v["tache"], "debut": v["debut"]}
            for v in sorted(_actifs.values(), key=lambda v: v["debut"])][-5:]


def _cron_name() -> str:
    try:
        ex = _ctx.current_cron_execution() if _ctx is not None else None
        return _texte(getattr(ex, "job_name", "") or "", 60) if ex else ""
    except Exception:
        return ""


# ---- hooks (observers only: they always return None) ----

def _empreinte(nom: str, args: Any) -> str:
    try:
        brut = json.dumps([nom, args], sort_keys=True, default=str, ensure_ascii=False)[:50_000]
    except Exception:
        brut = nom + repr(args)[:50_000]
    return hashlib.sha256(brut.encode("utf-8", "replace")).hexdigest()[:16]


def _pre_tool_call(tool_name: str = "", args: Any = None, session_id: Any = None, task_id: Any = None, **_: Any) -> None:
    nom = _court(tool_name)
    a = _animal(nom)
    if not a:
        return
    sid = str(session_id or task_id or "?")[:80]
    boucle = 0
    try:
        h = _empreinte(nom, args)
        vus = _appels.setdefault(sid, deque(maxlen=LOOP_WINDOW))
        vus.append(h)
        fois = sum(1 for x in vus if x == h)
        deja = _signales.setdefault(sid, set())
        if fois >= LOOP_REPEAT and h not in deja:
            deja.add(h)
            boucle = fois
        if len(_appels) > 200:  # sessions that never ended cleanly
            for k in list(_appels)[:100]:
                _appels.pop(k, None)
                _signales.pop(k, None)
    except Exception:
        boucle = 0

    def f(t):
        _touche(a, t, nom)
        _plus(_heure(t)["o"], a)
        _fil(t, CODE.get(a, "c"))
        if boucle:
            s = _etat["sentinelle"]
            tour = _actifs.get(sid) or {}
            s["dernier"] = s["maj"] = t
            s["boucle"].update(dernier=t, outil=nom, fois=boucle, plateforme=tour.get("plateforme", ""))
            s["boucle"]["n"] += 1
            _heure(t)["r"] += 1
            _touche("shiba", t)
            _fil(t, "r")
    _maj(f)


def _post_tool_call(tool_name: str = "", status: Any = None, error_type: Any = None, **_: Any) -> None:
    st = str(status or "").strip().lower()
    if not error_type and (not st or st in _OK):
        return

    def f(t):
        s = _etat["sentinelle"]
        s["dernier"] = s["maj"] = t
        s["erreurs_outils"] += 1
        _touche("shiba", t)
        _heure(t)["e"] += 1
        _fil(t, "e")
    _maj(f)


def _debut_tour(session_id: Any = None, platform: Any = "", model: Any = "", **_: Any) -> None:
    tache = _cron_name()
    plateforme = "cron" if tache else _court(platform, 30).lower()
    sid0 = str(session_id or "?")[:80]
    _appels.pop(sid0, None)
    _signales.pop(sid0, None)

    def f(t):
        _actifs[str(session_id or "?")[:80]] = {"plateforme": plateforme, "tache": tache, "debut": t,
                                               "modele": _court(model, 80), "tokens": 0}
        _touche("renard", t)
        _etat["renard"].update(en_cours=True, debut=t)
        _etat["tours"] = _tours()
        b = _heure(t)
        b["t"] += 1
        _plus(b["s"], plateforme or "?")
        _fil(t, "T")
    _maj(f)


def _fin_tour(session_id: Any = None, **_: Any) -> None:
    def f(t):
        sid = str(session_id or "?")[:80]
        if sid not in _actifs and not _etat["renard"]["en_cours"]:
            return False
        tour = _actifs.pop(sid, None)
        _appels.pop(sid, None)
        _signales.pop(sid, None)
        if tour and tour.get("tokens", 0) >= HEAVY_TOKENS:
            lo = _etat["sentinelle"]["lourd"]
            lo.update(dernier=t, tokens=tour["tokens"], plateforme=tour["plateforme"])
            lo["n"] += 1
            _etat["sentinelle"]["dernier"] = _etat["sentinelle"]["maj"] = t
            _etat["lourds"] = ([{"t": t, "tokens": tour["tokens"], "plateforme": tour["plateforme"],
                                 "tache": tour["tache"]}] + _etat["lourds"])[:8]
            _heure(t)["g"] += 1
            _touche("shiba", t)
            _fil(t, "g")
        _etat["tours"] = _tours()
        if _actifs:
            return None
        _touche("renard", t)
        _etat["renard"].update(en_cours=False, fin=t)
        _fil(t, "E")
    _maj(f)


def _entier(u: dict, *cles: str) -> int:
    for c in cles:
        try:
            v = int(u.get(c) or 0)
        except (TypeError, ValueError):
            v = 0
        if v:
            return max(v, 0)
    return 0


def _apres_appel(session_id: Any = None, model: Any = "", usage: Any = None, provider: Any = "", **_: Any) -> None:
    modele = _court(model, 80)
    fournisseur = _court(provider, 40).lower()
    sid = str(session_id or "?")[:80]
    u = usage if isinstance(usage, dict) else {}
    entree = _entier(u, "prompt_tokens", "input_tokens")
    sortie = _entier(u, "output_tokens")
    # detailed buckets, for the cost of the day (priced by the dashboard route with Hermes's own pricing)
    detail = [_entier(u, "input_tokens"), sortie, _entier(u, "cache_read_tokens"), _entier(u, "cache_write_tokens"), 1]

    def f(t):
        b = _heure(t)
        if modele and (modele in b["k"] or len(b["k"]) < 8):
            k = b["k"].setdefault(modele, [0, 0])
            k[0] += entree
            k[1] += sortie
        cle = (fournisseur + "|" + modele)[:120]
        if modele and (entree or sortie) and (cle in b["u"] or len(b["u"]) < 8):
            d = b["u"].setdefault(cle, [0, 0, 0, 0, 0])
            for i, v in enumerate(detail):
                d[i] += v
        tour = _actifs.get(sid)
        if tour:
            tour["tokens"] = tour.get("tokens", 0) + entree
        if not tour or not modele:
            return None
        de = tour.get("modele") or ""
        # same turn, another model than the one it started with, right after a provider error: a fallback
        if de and modele != de and t - _derniere_erreur_api < ERROR_WINDOW and tour.get("vers") != modele:
            tour["vers"] = modele
            s = _etat["sentinelle"]
            s["dernier"] = s["maj"] = t
            s["bascule"].update(dernier=t, de=de, vers=modele)
            s["bascule"]["n"] += 1
            b["b"] += 1
            _touche("shiba", t)
            _fil(t, "b")
    _maj(f)


def _erreur_api(**_: Any) -> None:
    def f(t):
        global _derniere_erreur_api
        _derniere_erreur_api = t
        s = _etat["sentinelle"]
        s["dernier"] = s["maj"] = t
        s["erreurs_api"] += 1
        _touche("shiba", t)
        _heure(t)["a"] += 1
        _fil(t, "a")
    _maj(f)


def _approbation_demandee(description: Any = "", surface: Any = "", **_: Any) -> None:
    def f(t):
        s = _etat["sentinelle"]
        s["dernier"] = s["maj"] = t
        s["approbation"].update(en_attente=True, debut=t, quoi=_texte(description, 80), ou=_court(surface, 40))
        s["approbation"]["n"] += 1
        _touche("shiba", t)
        _heure(t)["p"] += 1
        _fil(t, "p")
    _maj(f)


def _approbation_repondue(**_: Any) -> None:
    def f(t):
        s = _etat["sentinelle"]
        s["dernier"] = s["maj"] = t
        s["approbation"].update(en_attente=False, fin=t)
    _maj(f)


def _sous_agent_debut(**_: Any) -> None:
    def f(t):
        sa = _etat["sous_agents"]
        if not sa["actifs"]:
            sa["debut"] = t
        sa["actifs"] = min(sa["actifs"] + 1, 20)
        sa["n"] += 1
        _touche("renard", t)
        _fil(t, "s")
    _maj(f)


def _sous_agent_fin(**_: Any) -> None:
    def f(t):
        sa = _etat["sous_agents"]
        if not sa["actifs"]:
            return False
        sa["actifs"] -= 1
    _maj(f)


def register(ctx) -> None:
    global _ctx
    _ctx = ctx
    ctx.register_hook("pre_tool_call", _pre_tool_call)
    ctx.register_hook("post_tool_call", _post_tool_call)
    ctx.register_hook("pre_llm_call", _debut_tour)
    ctx.register_hook("post_llm_call", _fin_tour)
    ctx.register_hook("on_session_end", _fin_tour)
    ctx.register_hook("post_api_request", _apres_appel)
    ctx.register_hook("api_request_error", _erreur_api)
    ctx.register_hook("pre_approval_request", _approbation_demandee)
    ctx.register_hook("post_approval_response", _approbation_repondue)
    ctx.register_hook("subagent_start", _sous_agent_debut)
    ctx.register_hook("subagent_stop", _sous_agent_fin)
