"""Le Sanctuaire Solaire — backend routes, mounted at /api/plugins/sanctuaire-solaire/.

Read-only. Serves:
- GET /state         the merged activity of every Hermes process (tool names and times only);
- GET /theme?id=…    a theme (characters, positions, texts) from dashboard/app/themes/<id>/theme.json;
- GET /frame         the panorama page with its engine inlined (for Hermes Desktop's sandboxed frame);
- GET /asset?name=…  one image of dashboard/app/, base64-encoded (Desktop cannot load files directly).

Reads nothing outside this plugin's folder and its own data folder. No network, no secrets.

2026-11-05 ≈11:25 (Europe/Zurich) — Claude (Cowork) — Anthropic, Claude Opus 5.5, pour Médéric Morin
Copyright 2026 Médéric Morin — Apache License 2.0
"""

from __future__ import annotations

import asyncio
import base64
import json
import os
import re
import time
from pathlib import Path
from typing import Any

from fastapi import APIRouter, HTTPException

PLUGIN_ID = "sanctuaire-solaire"
APP = Path(__file__).resolve().parent / "app"
STALE = 15 * 60
MAX_ASSET = 4 * 1024 * 1024
ASSET_NAME = re.compile(r"^[a-z0-9][a-z0-9-]{0,80}\.(webp|png|jpg|svg|woff2)$")
THEME_ID = re.compile(r"^[a-z0-9_-]{1,40}$")
MIME = {"webp": "image/webp", "png": "image/png", "jpg": "image/jpeg", "svg": "image/svg+xml", "woff2": "font/woff2"}

router = APIRouter()


def _data_dir() -> Path:
    try:
        from plugins.plugin_storage import plugin_data_dir

        base = Path(plugin_data_dir(PLUGIN_ID))
    except Exception:
        home = os.environ.get("HERMES_HOME", "").strip() or os.path.join(os.path.expanduser("~"), ".hermes")
        base = Path(home) / "plugin-data" / PLUGIN_ID
    return base / "proc"


def _num(x: Any) -> float:
    return float(x) if isinstance(x, (int, float)) and not isinstance(x, bool) else 0.0


def _merge(states: list[dict]) -> dict:
    now = time.time()
    out: dict[str, Any] = {
        "v": 2, "maj": 0, "animaux": {}, "renard": {"en_cours": False, "debut": 0, "fin": 0},
        "sentinelle": {"maj": 0, "dernier": 0, "erreurs_outils": 0, "erreurs_api": 0,
                       "approbation": {"en_attente": False, "debut": 0, "fin": 0, "n": 0}},
    }
    for st in states:
        out["maj"] = max(out["maj"], _num(st.get("maj")))
        for key, a in (st.get("animaux") or {}).items():
            if not isinstance(a, dict) or not re.match(r"^[a-z]{1,20}$", str(key)):
                continue
            o = out["animaux"].setdefault(key, {"dernier": 0, "n": 0})
            o["n"] += int(_num(a.get("n")))
            if _num(a.get("dernier")) > o["dernier"]:
                o["dernier"] = _num(a.get("dernier"))
                if isinstance(a.get("outil"), str):
                    o["outil"] = a["outil"][:60]
        r = st.get("renard") or {}
        if r.get("en_cours") is True and now - _num(r.get("debut")) < STALE:
            out["renard"]["en_cours"] = True
        out["renard"]["debut"] = max(out["renard"]["debut"], _num(r.get("debut")))
        out["renard"]["fin"] = max(out["renard"]["fin"], _num(r.get("fin")))
        s = st.get("sentinelle") or {}
        so = out["sentinelle"]
        so["maj"] = max(so["maj"], _num(s.get("maj")))
        so["dernier"] = max(so["dernier"], _num(s.get("dernier")))
        so["erreurs_outils"] += int(_num(s.get("erreurs_outils")))
        so["erreurs_api"] += int(_num(s.get("erreurs_api")))
        ap = s.get("approbation") or {}
        if ap.get("en_attente") is True and now - _num(ap.get("debut")) < STALE:
            so["approbation"]["en_attente"] = True
        so["approbation"]["debut"] = max(so["approbation"]["debut"], _num(ap.get("debut")))
        so["approbation"]["fin"] = max(so["approbation"]["fin"], _num(ap.get("fin")))
        so["approbation"]["n"] += int(_num(ap.get("n")))
    for key in ("castor", "chouette", "taupe", "renard", "shiba"):
        out["animaux"].setdefault(key, {"dernier": 0, "n": 0})
    out["sentinelle"]["maj"] = max(out["sentinelle"]["maj"], out["maj"])
    return out


def _read_state() -> dict:
    d = _data_dir()
    states = []
    if d.is_dir():
        for f in sorted(d.glob("*.json"))[:64]:
            try:
                if f.stat().st_size > 64 * 1024:
                    continue
                st = json.loads(f.read_text(encoding="utf-8"))
                if isinstance(st, dict):
                    states.append(st)
            except (OSError, ValueError):
                continue
    return _merge(states)


def _read_theme(theme_id: str) -> dict:
    f = APP / "themes" / theme_id / "theme.json"
    return json.loads(f.read_text(encoding="utf-8"))


def _read_frame() -> str:
    html = (APP / "frame.html").read_text(encoding="utf-8")
    js = (APP / "moteur.js").read_text(encoding="utf-8").replace("</script", "<\\/script")
    return html.replace('<script src="moteur.js"></script>', "<script>\n" + js + "\n</script>")


def _read_asset(name: str) -> dict:
    f = APP / name
    if f.is_symlink() or not f.is_file():
        raise FileNotFoundError(name)
    if f.stat().st_size > MAX_ASSET:
        raise ValueError("too large")
    data = base64.b64encode(f.read_bytes()).decode("ascii")
    return {"name": name, "url": "data:" + MIME[name.rsplit(".", 1)[1]] + ";base64," + data}


@router.get("/state")
async def state() -> dict:
    return await asyncio.to_thread(_read_state)


@router.get("/theme")
async def theme(id: str = "sanctuaire") -> dict:
    if not THEME_ID.match(id):
        raise HTTPException(status_code=400, detail="bad theme id")
    try:
        return await asyncio.to_thread(_read_theme, id)
    except (OSError, ValueError):
        raise HTTPException(status_code=404, detail="theme not found")


@router.get("/frame")
async def frame() -> dict:
    try:
        return {"html": await asyncio.to_thread(_read_frame)}
    except OSError:
        raise HTTPException(status_code=500, detail="frame missing")


@router.get("/asset")
async def asset(name: str = "") -> dict:
    if not ASSET_NAME.match(name):
        raise HTTPException(status_code=400, detail="bad asset name")
    try:
        return await asyncio.to_thread(_read_asset, name)
    except (OSError, ValueError):
        raise HTTPException(status_code=404, detail="asset not found")
