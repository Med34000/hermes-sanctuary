"""Le Sanctuaire Solaire — backend routes, mounted at /api/plugins/sanctuaire-solaire/.

Read-only. Serves:
- GET /state         the merged activity of every Hermes process (tool names and times only);
- GET /themes        the list of worlds (id and short name) found in dashboard/app/themes/;
- GET /theme?id=…    a theme (characters, positions, texts) from dashboard/app/themes/<id>/theme.json;
- GET /frame         the panorama page with its engine inlined (for Hermes Desktop's sandboxed frame);
- GET /asset?name=…&theme=…  one image of dashboard/app/ (or of themes/<theme>/), base64-encoded
                     (Desktop cannot load files directly).

Reads nothing outside this plugin's folder and its own data folder. No network, no secrets.

2026-11-05 ≈11:25, mis à jour ≈12:35 et ≈15:10 (Europe/Zurich) — Claude (Cowork) — Anthropic, Claude Opus 5.5, pour Médéric Morin
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


def _txt(x: Any, n: int) -> str:
    return " ".join(str(x or "").split())[:n] if isinstance(x, str) else ""


def _merge_hours(dst: dict, src: Any, now: float) -> None:
    """Sum the hourly journals of every process (last 49 hours only)."""
    if not isinstance(src, dict):
        return
    oldest = int(now // 3600) - 49
    for k, b in src.items():
        if not (isinstance(k, str) and k.isdigit() and int(k) >= oldest and isinstance(b, dict)):
            continue
        o = dst.setdefault(k, {"t": 0, "o": {}, "e": 0, "a": 0, "b": 0, "p": 0, "g": 0, "s": {}, "k": {}})
        for f in ("t", "e", "a", "b", "p", "g"):
            o[f] += int(_num(b.get(f)))
        for f in ("o", "s"):
            for name, n in (b.get(f) or {}).items() if isinstance(b.get(f), dict) else []:
                if isinstance(name, str) and len(o[f]) < 30:
                    o[f][name[:40]] = o[f].get(name[:40], 0) + int(_num(n))
        for model, io in (b.get("k") or {}).items() if isinstance(b.get("k"), dict) else []:
            if isinstance(model, str) and isinstance(io, list) and len(io) == 2 and len(o["k"]) < 12:
                cur = o["k"].setdefault(model[:80], [0, 0])
                cur[0] += int(_num(io[0]))
                cur[1] += int(_num(io[1]))


def _merge(states: list[dict]) -> dict:
    now = time.time()
    out: dict[str, Any] = {
        "v": 4, "maj": 0, "animaux": {}, "renard": {"en_cours": False, "debut": 0, "fin": 0}, "tours": [],
        "lourds": [], "sous_agents": {"actifs": 0, "debut": 0, "n": 0},
        "sentinelle": {"maj": 0, "dernier": 0, "erreurs_outils": 0, "erreurs_api": 0,
                       "approbation": {"en_attente": False, "debut": 0, "fin": 0, "n": 0, "quoi": "", "ou": ""},
                       "bascule": {"n": 0, "dernier": 0, "de": "", "vers": ""},
                       "lourd": {"n": 0, "dernier": 0, "tokens": 0, "plateforme": ""}},
        "h": {},
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
            rec = o.setdefault("recents", [])
            for e in (a.get("recents") or [])[:5]:
                if isinstance(e, list) and len(e) == 2 and isinstance(e[0], str):
                    rec.append([e[0][:60], _num(e[1])])
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
        if _num(ap.get("debut")) >= so["approbation"]["debut"]:
            so["approbation"]["quoi"] = _txt(ap.get("quoi"), 80)
            so["approbation"]["ou"] = _txt(ap.get("ou"), 40)
        so["approbation"]["debut"] = max(so["approbation"]["debut"], _num(ap.get("debut")))
        so["approbation"]["fin"] = max(so["approbation"]["fin"], _num(ap.get("fin")))
        so["approbation"]["n"] += int(_num(ap.get("n")))
        ba = s.get("bascule") or {}
        bo = so["bascule"]
        bo["n"] += int(_num(ba.get("n")))
        if _num(ba.get("dernier")) > bo["dernier"]:
            bo.update(dernier=_num(ba.get("dernier")), de=_txt(ba.get("de"), 80), vers=_txt(ba.get("vers"), 80))
        lo, lso = s.get("lourd") or {}, so["lourd"]
        lso["n"] += int(_num(lo.get("n")))
        if _num(lo.get("dernier")) > lso["dernier"]:
            lso.update(dernier=_num(lo.get("dernier")), tokens=int(_num(lo.get("tokens"))), plateforme=_txt(lo.get("plateforme"), 30))
        for e in (st.get("lourds") or [])[:8]:
            if isinstance(e, dict):
                out["lourds"].append({"t": _num(e.get("t")), "tokens": int(_num(e.get("tokens"))),
                                      "plateforme": _txt(e.get("plateforme"), 30), "tache": _txt(e.get("tache"), 60)})
        sa = st.get("sous_agents") or {}
        out["sous_agents"]["n"] += int(_num(sa.get("n")))
        if int(_num(sa.get("actifs"))) > 0 and now - _num(sa.get("debut")) < STALE:
            out["sous_agents"]["actifs"] += min(int(_num(sa.get("actifs"))), 20)
            out["sous_agents"]["debut"] = max(out["sous_agents"]["debut"], _num(sa.get("debut")))
        if r.get("en_cours") is True and now - _num(r.get("debut")) < STALE:
            for tr in (st.get("tours") or [])[:5]:
                if isinstance(tr, dict) and now - _num(tr.get("debut")) < STALE:
                    out["tours"].append({"plateforme": _txt(tr.get("plateforme"), 30), "tache": _txt(tr.get("tache"), 60),
                                         "debut": _num(tr.get("debut"))})
        _merge_hours(out["h"], st.get("h"), now)
    out["tours"] = sorted(out["tours"], key=lambda x: x["debut"])[-8:]
    out["lourds"] = sorted(out["lourds"], key=lambda x: -x["t"])[:8]
    for a in out["animaux"].values():
        seen, rec = set(), []
        for name, t in sorted(a.get("recents", []), key=lambda e: -e[1]):
            if name not in seen:
                seen.add(name)
                rec.append([name, t])
        a["recents"] = rec[:5]
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
                if f.stat().st_size > 256 * 1024:
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


def _list_themes() -> list[dict]:
    out = []
    root = APP / "themes"
    for d in sorted(root.iterdir()) if root.is_dir() else []:
        f = d / "theme.json"
        if d.is_symlink() or not THEME_ID.match(d.name) or not f.is_file() or f.stat().st_size > MAX_ASSET:
            continue
        try:
            t = json.loads(f.read_text(encoding="utf-8"))
        except (OSError, ValueError):
            continue
        w = t.get("world") if isinstance(t.get("world"), dict) else {}
        en = ((t.get("i18n") or {}).get("en") or {}).get("world") or {}
        names = {(t.get("lang") or "fr")[:5]: _txt(w.get("name") or t.get("title") or d.name, 40)}
        if isinstance(en, dict) and en.get("name"):
            names["en"] = _txt(en.get("name"), 40)
        out.append({"id": d.name, "names": names, "icon": _txt(w.get("icon"), 4)})
    return out[:8]


def _read_frame() -> str:
    html = (APP / "frame.html").read_text(encoding="utf-8")
    js = (APP / "moteur.js").read_text(encoding="utf-8").replace("</script", "<\\/script")
    return html.replace('<script src="moteur.js"></script>', "<script>\n" + js + "\n</script>")


def _read_asset(name: str, theme_id: str = "") -> dict:
    f = (APP / "themes" / theme_id / name) if theme_id else (APP / name)
    if f.is_symlink() or not f.is_file():
        raise FileNotFoundError(name)
    if f.stat().st_size > MAX_ASSET:
        raise ValueError("too large")
    data = base64.b64encode(f.read_bytes()).decode("ascii")
    return {"name": name, "url": "data:" + MIME[name.rsplit(".", 1)[1]] + ";base64," + data}


@router.get("/state")
async def state() -> dict:
    return await asyncio.to_thread(_read_state)


@router.get("/themes")
async def themes() -> list:
    return await asyncio.to_thread(_list_themes)


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
async def asset(name: str = "", theme: str = "") -> dict:
    if not ASSET_NAME.match(name) or (theme and not THEME_ID.match(theme)):
        raise HTTPException(status_code=400, detail="bad asset name")
    try:
        return await asyncio.to_thread(_read_asset, name, theme)
    except (OSError, ValueError):
        raise HTTPException(status_code=404, detail="asset not found")
