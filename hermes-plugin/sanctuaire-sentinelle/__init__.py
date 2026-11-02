"""Sanctuaire Solaire — Shiba Sentinel.

Ecrit /var/lib/sanctuaire/sentinelle.json : compteurs et horodatages d'erreurs et d'approbations.
Ne lit et n'ecrit JAMAIS : arguments, resultats, messages d'erreur, commandes, identifiants.
Seuls le NOM de l'outil en erreur et le TYPE d'erreur (classe courte) sont conserves.
Ne leve jamais d'exception : Hermes n'est jamais bloque.

2026-11-02 ≈11:40 (Europe/Zurich) — Claude (Cowork) — Anthropic, Claude Opus 5.5
"""

from __future__ import annotations

import json
import os
import threading
import time
from typing import Any

FICHIER = "/var/lib/sanctuaire/sentinelle.json"
_OK = {"ok", "success", "succeeded", "completed", "done"}
_lock = threading.Lock()
_etat: dict[str, Any] = {
    "v": 1,
    "maj": 0,
    "dernier": 0,
    "erreurs_outils": 0,
    "erreurs_api": 0,
    "approbation": {"en_attente": False, "debut": 0, "fin": 0, "n": 0},
    "outils_en_erreur": {},
    "types_erreur": {},
}


def _court(x: Any) -> str:
    return "".join(c for c in str(x) if c.isalnum() or c in "_-.:")[:40]


def _compte(d: dict, cle: str) -> None:
    if cle and (cle in d or len(d) < 30):
        d[cle] = d.get(cle, 0) + 1


def _ecrire() -> None:
    tmp = FICHIER + ".tmp"
    with open(tmp, "w", encoding="utf-8") as f:
        json.dump(_etat, f, separators=(",", ":"))
    os.chmod(tmp, 0o644)
    os.replace(tmp, FICHIER)


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


def _on_post_tool_call(tool_name: str = "", status: Any = None, error_type: Any = None, **_: Any) -> None:
    st = str(status or "").strip().lower()
    if not error_type and (not st or st in _OK):
        return

    def f(t):
        _etat["dernier"] = t
        _etat["erreurs_outils"] += 1
        _compte(_etat["outils_en_erreur"], _court(tool_name))
        _compte(_etat["types_erreur"], _court(error_type or st))
    _maj(f)


def _on_api_request_error(**_: Any) -> None:
    def f(t):
        _etat["dernier"] = t
        _etat["erreurs_api"] += 1
    _maj(f)


def _on_pre_approval_request(**_: Any) -> None:
    def f(t):
        _etat["dernier"] = t
        _etat["approbation"].update(en_attente=True, debut=t)
        _etat["approbation"]["n"] += 1
    _maj(f)


def _on_post_approval_response(**_: Any) -> None:
    def f(t):
        _etat["dernier"] = t
        _etat["approbation"].update(en_attente=False, fin=t)
    _maj(f)


def register(ctx) -> None:
    ctx.register_hook("post_tool_call", _on_post_tool_call)
    ctx.register_hook("api_request_error", _on_api_request_error)
    ctx.register_hook("pre_approval_request", _on_pre_approval_request)
    ctx.register_hook("post_approval_response", _on_post_approval_response)
