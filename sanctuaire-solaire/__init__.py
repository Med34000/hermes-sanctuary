"""Le Sanctuaire Solaire — activity hooks (agent half of the plugin).

Records WHICH tools Hermes uses and WHEN, so the Sanctuary companions can react:
tool names, turn start/end times, error and approval counters. Never messages,
replies, arguments, results, error texts, ids or paths.

Each Hermes process (gateway, dashboard chat, Desktop backend, cron) writes its own
small file in <hermes home>/plugin-data/sanctuaire-solaire/proc/; the dashboard
route (dashboard/plugin_api.py) merges them. Hooks never raise and never return a
directive: Hermes is never blocked or slowed.

2026-11-05 ≈11:15 (Europe/Zurich) — Claude (Cowork) — Anthropic, Claude Opus 5.5, pour Médéric Morin
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

_lock = threading.Lock()
_actifs: set[str] = set()
_etat: dict[str, Any] = {
    "v": 2,
    "maj": 0,
    "animaux": {a: {"dernier": 0, "n": 0} for a in ANIMAUX},
    "renard": {"en_cours": False, "debut": 0, "fin": 0},
    "sentinelle": {
        "maj": 0,
        "dernier": 0,
        "erreurs_outils": 0,
        "erreurs_api": 0,
        "approbation": {"en_attente": False, "debut": 0, "fin": 0, "n": 0},
    },
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


def _court(x: Any) -> str:
    return "".join(c for c in str(x or "") if c.isalnum() or c in "_-.:")[:60]


# ---- hooks (observers only: they always return None) ----

def _pre_tool_call(tool_name: str = "", **_: Any) -> None:
    nom = _court(tool_name)
    a = _animal(nom)
    if a:
        _maj(lambda t: _touche(a, t, nom))


def _post_tool_call(tool_name: str = "", status: Any = None, error_type: Any = None, **_: Any) -> None:
    st = str(status or "").strip().lower()
    if not error_type and (not st or st in _OK):
        return

    def f(t):
        s = _etat["sentinelle"]
        s["dernier"] = s["maj"] = t
        s["erreurs_outils"] += 1
        _touche("shiba", t)
    _maj(f)


def _debut_tour(session_id: Any = None, **_: Any) -> None:
    def f(t):
        _actifs.add(str(session_id or "?")[:80])
        _touche("renard", t)
        _etat["renard"].update(en_cours=True, debut=t)
    _maj(f)


def _fin_tour(session_id: Any = None, **_: Any) -> None:
    def f(t):
        sid = str(session_id or "?")[:80]
        if sid not in _actifs and not _etat["renard"]["en_cours"]:
            return False
        _actifs.discard(sid)
        if _actifs:
            return False
        _touche("renard", t)
        _etat["renard"].update(en_cours=False, fin=t)
    _maj(f)


def _erreur_api(**_: Any) -> None:
    def f(t):
        s = _etat["sentinelle"]
        s["dernier"] = s["maj"] = t
        s["erreurs_api"] += 1
        _touche("shiba", t)
    _maj(f)


def _approbation_demandee(**_: Any) -> None:
    def f(t):
        s = _etat["sentinelle"]
        s["dernier"] = s["maj"] = t
        s["approbation"].update(en_attente=True, debut=t)
        s["approbation"]["n"] += 1
        _touche("shiba", t)
    _maj(f)


def _approbation_repondue(**_: Any) -> None:
    def f(t):
        s = _etat["sentinelle"]
        s["dernier"] = s["maj"] = t
        s["approbation"].update(en_attente=False, fin=t)
    _maj(f)


def register(ctx) -> None:
    ctx.register_hook("pre_tool_call", _pre_tool_call)
    ctx.register_hook("post_tool_call", _post_tool_call)
    ctx.register_hook("pre_llm_call", _debut_tour)
    ctx.register_hook("post_llm_call", _fin_tour)
    ctx.register_hook("on_session_end", _fin_tour)
    ctx.register_hook("api_request_error", _erreur_api)
    ctx.register_hook("pre_approval_request", _approbation_demandee)
    ctx.register_hook("post_approval_response", _approbation_repondue)
