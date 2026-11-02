# Sanctuaire Solaire — hook d'activite Hermes
# Lit UNIQUEMENT les noms d'outils et le debut/fin de tour. Jamais de message, reponse, id ou resultat.
# 2026-11-02 ≈10:25 (Europe/Zurich) — Claude (Cowork) — Anthropic, Claude Opus 5.5
import json
import os
import threading
import time

ETAT = "/var/lib/sanctuaire/etat.json"
_lock = threading.Lock()

# Noms exacts d'abord, puis prefixes
CARTE = {
    "castor":   {"write_file", "patch", "terminal", "process", "execute_code", "skill_manage"},
    "taupe":    {"read_file", "search_files", "memory", "session_search", "skill_view", "skills_list", "todo"},
    "chouette": {"web_search", "web_extract", "vision_analyze"},
    "renard":   {"send_message", "delegate_task", "clarify", "cronjob"},
}
PREFIXES = (("browser_", "chouette"), ("web_", "chouette"))

ANIMAUX = ("castor", "chouette", "taupe", "renard", "shiba")
_etat = {
    "v": 1,
    "maj": 0,
    "animaux": {a: {"dernier": 0, "n": 0} for a in ANIMAUX},
    "renard": {"en_cours": False, "debut": 0, "fin": 0},
    "inconnus": {},
}


def _animal(nom):
    for a, noms in CARTE.items():
        if nom in noms:
            return a
    for p, a in PREFIXES:
        if nom.startswith(p):
            return a
    return None


def _touche(a, t):
    x = _etat["animaux"][a]
    x["dernier"] = t
    x["n"] += 1


def _ecrire():
    tmp = ETAT + ".tmp"
    with open(tmp, "w", encoding="utf-8") as f:
        json.dump(_etat, f, separators=(",", ":"))
    os.chmod(tmp, 0o644)
    os.replace(tmp, ETAT)


def handle(event_type, context):
    try:
        t = round(time.time(), 1)
        with _lock:
            if event_type == "agent:start":
                _touche("renard", t)
                _etat["renard"].update(en_cours=True, debut=t)
            elif event_type == "agent:end":
                _touche("renard", t)
                _etat["renard"].update(en_cours=False, fin=t)
            elif event_type == "agent:step":
                for nom in (context or {}).get("tool_names") or []:
                    nom = str(nom)[:60]
                    a = _animal(nom)
                    if a:
                        _touche(a, t)
                    elif nom:
                        inc = _etat["inconnus"]
                        if nom in inc or len(inc) < 50:
                            inc[nom] = inc.get(nom, 0) + 1
            elif event_type.startswith("command:"):
                _touche("shiba", t)
            else:
                return
            _etat["maj"] = t
            _ecrire()
    except Exception:
        pass
