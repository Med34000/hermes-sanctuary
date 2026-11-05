"""Le Sanctuaire Solaire — activity hooks (agent half of the plugin).

Records WHICH tools Hermes uses and WHEN, so the Sanctuary companions can react:
tool names, turn start/end times and where a turn comes from (platform name, scheduled
task name), error / fallback / approval counters, the generic description Hermes gives
for an approval ("recursive delete"…), model names and token counts per hour.
Never messages, replies, tool arguments, commands, results, error texts, ids or paths.

Each Hermes process (gateway, dashboard chat, Desktop backend, cron) writes its own
small file in <hermes home>/plugin-data/sanctuaire-solaire/proc/; the dashboard
route (dashboard/plugin_api.py) merges them. Hooks never raise and never return a
directive: Hermes is never blocked, changed or slowed.

2026-11-05 ≈11:15 (Europe/Zurich) — Claude (Cowork) — Anthropic, Claude Opus 5.5, pour Médéric Morin
2026-11-05 ≈12:30 — sources des tours (plateforme, tâche planifiée), bascules de modèle, journal par heure,
                     description des approbations
Copyright 2026 Médéric Morin — Apache License 2.0
"""

from __future__ import annotations

import json
import os
import threading
import time
from pathlib import Path
from typing import Any

PLUGIN_ID = "sanctuaire-solaire"

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

_lock = threading.Lock()
_ctx: Any = None
_actifs: dict[str, dict] = {}      # session -> {"plateforme", "tache", "debut", "modele"}
_derniere_erreur_api = 0.0
_etat: dict[str, Any] = {
    "v": 3,
    "maj": 0,
    "animaux": {a: {"dernier": 0, "n": 0} for a in ANIMAUX},
    "renard": {"en_cours": False, "debut": 0, "fin": 0},
    "tours": [],
    "sentinelle": {
        "maj": 0,
        "dernier": 0,
        "erreurs_outils": 0,
        "erreurs_api": 0,
        "approbation": {"en_attente": False, "debut": 0, "fin": 0, "n": 0, "quoi": "", "ou": ""},
        "bascule": {"n": 0, "dernier": 0, "de": "", "vers": ""},
    },
    "h": {},
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


def _heure(t: float) -> dict:
    """Bucket of the hourly journal for time t (key = hours since epoch, UTC)."""
    h = _etat["h"]
    k = str(int(t // 3600))
    if k not in h:
        limite = int(t // 3600) - KEEP_HOURS
        for old in [x for x in h if int(x) < limite]:
            del h[old]
        h[k] = {"t": 0, "o": {}, "e": 0, "a": 0, "b": 0, "p": 0, "s": {}, "k": {}}
    return h[k]


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

def _pre_tool_call(tool_name: str = "", **_: Any) -> None:
    nom = _court(tool_name)
    a = _animal(nom)
    if a:
        def f(t):
            _touche(a, t, nom)
            _plus(_heure(t)["o"], a)
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
    _maj(f)


def _debut_tour(session_id: Any = None, platform: Any = "", model: Any = "", **_: Any) -> None:
    tache = _cron_name()
    plateforme = "cron" if tache else _court(platform, 30).lower()

    def f(t):
        _actifs[str(session_id or "?")[:80]] = {"plateforme": plateforme, "tache": tache, "debut": t,
                                               "modele": _court(model, 80)}
        _touche("renard", t)
        _etat["renard"].update(en_cours=True, debut=t)
        _etat["tours"] = _tours()
        b = _heure(t)
        b["t"] += 1
        _plus(b["s"], plateforme or "?")
    _maj(f)


def _fin_tour(session_id: Any = None, **_: Any) -> None:
    def f(t):
        sid = str(session_id or "?")[:80]
        if sid not in _actifs and not _etat["renard"]["en_cours"]:
            return False
        _actifs.pop(sid, None)
        _etat["tours"] = _tours()
        if _actifs:
            return None
        _touche("renard", t)
        _etat["renard"].update(en_cours=False, fin=t)
    _maj(f)


def _apres_appel(session_id: Any = None, model: Any = "", usage: Any = None, **_: Any) -> None:
    modele = _court(model, 80)
    sid = str(session_id or "?")[:80]
    u = usage if isinstance(usage, dict) else {}
    try:
        entree = int(u.get("prompt_tokens") or u.get("input_tokens") or 0)
        sortie = int(u.get("output_tokens") or 0)
    except (TypeError, ValueError):
        entree = sortie = 0

    def f(t):
        b = _heure(t)
        if modele and (modele in b["k"] or len(b["k"]) < 8):
            k = b["k"].setdefault(modele, [0, 0])
            k[0] += entree
            k[1] += sortie
        tour = _actifs.get(sid)
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
    _maj(f)


def _approbation_demandee(description: Any = "", surface: Any = "", **_: Any) -> None:
    def f(t):
        s = _etat["sentinelle"]
        s["dernier"] = s["maj"] = t
        s["approbation"].update(en_attente=True, debut=t, quoi=_texte(description, 80), ou=_court(surface, 40))
        s["approbation"]["n"] += 1
        _touche("shiba", t)
        _heure(t)["p"] += 1
    _maj(f)


def _approbation_repondue(**_: Any) -> None:
    def f(t):
        s = _etat["sentinelle"]
        s["dernier"] = s["maj"] = t
        s["approbation"].update(en_attente=False, fin=t)
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
