#!/usr/bin/env python3
"""Sanctuaire — serveur web interne + relais vers l'API de Hermes.

- Sert les fichiers de la page (dossier web/).
- Relaie UNIQUEMENT quelques routes du chat vers l'API de Hermes (127.0.0.1:9119), en ajoutant la clé
  côté serveur : la clé n'est jamais envoyée à la page.
- N'enregistre aucun contenu : aucun message n'est écrit sur disque ni dans les logs.
- Protection anti-site-malveillant : les routes du chat exigent l'en-tête X-Sanctuaire, un Host local
  et, si présent, une Origin locale (une page web tierce ouverte dans le navigateur ne peut donc pas
  piloter Hermes à travers le tunnel).

Réglages par variables d'environnement :
  SANCTUAIRE_WEB   dossier des fichiers (défaut /opt/sanctuaire/web)
  SANCTUAIRE_PORT  port d'écoute, toujours sur 127.0.0.1 (défaut 8787)
  HERMES_API       adresse de l'API Hermes (défaut http://127.0.0.1:9119)
  Clé : fichier $CREDENTIALS_DIRECTORY/api.key (systemd LoadCredential) ou SANCTUAIRE_KEY_FILE.

Images (2026-11-03) : le flux du chat accepte jusqu'à MAX_IMAGES images (data:image/png|jpeg|webp|gif en base64),
transmises telles quelles à Hermes dans le message (format image_url) ; jamais écrites sur disque.

2026-11-02 ≈19:30 (Europe/Zurich) — Claude (Cowork) — Anthropic, Claude Opus 5.5
2026-11-03 ≈07:40 (Europe/Zurich) — Claude (Cowork) — Anthropic, Claude Opus 5.5 : images dans le chat
"""

import http.client
import json
import os
import re
import sys
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import urlsplit

WEB = os.environ.get("SANCTUAIRE_WEB", "/opt/sanctuaire/web")
PORT = int(os.environ.get("SANCTUAIRE_PORT", "8787"))
API = urlsplit(os.environ.get("HERMES_API", "http://127.0.0.1:9119"))
KEY_FILE = os.environ.get("SANCTUAIRE_KEY_FILE") or os.path.join(os.environ.get("CREDENTIALS_DIRECTORY", "/etc/sanctuaire"), "api.key")
MAX_INPUT = 20000          # caractères max par message
MAX_IMAGES = 4             # images max par message
MAX_IMAGE_CHARS = 2500000  # ≈ 1,8 Mo par image (base64) ; la page réduit les images avant l'envoi
MAX_IMAGES_TOTAL = 7000000 # toutes images confondues (l'API de Hermes refuse au-delà de 10 Mo par requête)
IMG = re.compile(r"^data:image/(png|jpeg|webp|gif);base64,[A-Za-z0-9+/]+={0,2}$")
LOCAL_HOSTS = {"localhost", "127.0.0.1", "[::1]"}
SID = re.compile(r"^[A-Za-z0-9_.:-]{1,120}$")


def read_key():
    try:
        with open(KEY_FILE, encoding="utf-8") as f:
            return f.read().strip()
    except OSError:
        return ""


KEY = read_key()


class Handler(SimpleHTTPRequestHandler):
    server_version = "Sanctuaire"
    sys_version = ""

    # ---- pas de journal des requêtes (aucune trace de l'activité ni du contenu) ----
    def log_message(self, *args):
        pass

    def end_headers(self):
        self.send_header("X-Content-Type-Options", "nosniff")
        self.send_header("Referrer-Policy", "no-referrer")
        if self.path.endswith((".html", "/")) or self.path.split("?")[0].endswith((".json", ".js")):
            self.send_header("Cache-Control", "no-cache")
        super().end_headers()

    # ---- garde-fous pour les routes du chat ----
    def _local_only(self):
        host = (self.headers.get("Host") or "").rsplit(":", 1)[0].lower()
        if host not in LOCAL_HOSTS:
            return False
        origin = self.headers.get("Origin")
        if origin:
            o = urlsplit(origin)
            if (o.hostname or "").lower() not in {"localhost", "127.0.0.1", "::1"}:
                return False
        return self.headers.get("X-Sanctuaire") == "1"

    def _json(self, code, obj):
        body = json.dumps(obj).encode()
        self.send_response(code)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def _route(self, method):
        p = urlsplit(self.path).path
        if not p.startswith("/chat/"):
            return None
        if not self._local_only():
            return ("deny",)
        parts = p.strip("/").split("/")          # chat/sessions[/<id>[/messages|/stream]]
        if parts == ["chat", "sessions"] and method == "POST":
            return ("POST", "/api/sessions", False)
        if parts == ["chat", "sessions"] and method == "GET":
            return ("GET", "/api/sessions?limit=50&source=api_server", False)
        if len(parts) >= 3 and parts[1] == "sessions" and SID.match(parts[2]):
            sid = parts[2]
            if len(parts) == 4 and parts[3] == "messages" and method == "GET":
                return ("GET", "/api/sessions/%s/messages" % sid, False)
            if len(parts) == 4 and parts[3] == "stream" and method == "POST":
                return ("POST", "/api/sessions/%s/chat/stream" % sid, True)
            if len(parts) == 3 and method == "PATCH":
                return ("PATCH", "/api/sessions/%s" % sid, False)
        return ("deny",)

    def _body(self, allow_images=False):
        n = int(self.headers.get("Content-Length") or 0)
        if n <= 0:
            return b"{}"
        if n > MAX_INPUT * 4 + 2000 + (MAX_IMAGES_TOTAL + 4000 if allow_images else 0):
            raise ValueError("trop long")
        raw = self.rfile.read(n)
        data = json.loads(raw.decode("utf-8") or "{}")
        if not isinstance(data, dict):
            raise ValueError("format")
        clean = {}
        for k in ("input", "title"):
            if k in data:
                v = str(data[k])
                if len(v) > MAX_INPUT:
                    raise ValueError("trop long")
                clean[k] = v
        for k in ("pinned", "archived"):   # dossiers (2026-11-03) : épingler / archiver une conversation
            if k in data:
                clean[k] = bool(data[k])
        imgs = data.get("images") if allow_images else None
        if imgs:
            if not isinstance(imgs, list) or len(imgs) > MAX_IMAGES:
                raise ValueError("images")
            if sum(len(u) for u in imgs if isinstance(u, str)) > MAX_IMAGES_TOTAL:
                raise ValueError("images trop lourdes")
            parts = []
            text = clean.pop("input", "")
            if text.strip():
                parts.append({"type": "text", "text": text})
            for u in imgs:
                if not isinstance(u, str) or len(u) > MAX_IMAGE_CHARS or not IMG.match(u):
                    raise ValueError("image invalide")
                parts.append({"type": "image_url", "image_url": {"url": u}})
            clean["message"] = parts
        return json.dumps(clean).encode()

    def _proxy(self, method):
        r = self._route(method)
        if r is None:
            return False
        if r[0] == "deny":
            self._json(403, {"error": "refusé"})
            return True
        if not KEY:
            self._json(503, {"error": "clé API absente"})
            return True
        verb, target, stream = r
        try:
            body = self._body(allow_images=stream) if verb in ("POST", "PATCH") else None
        except Exception:
            self._json(400, {"error": "requête invalide"})
            return True
        conn = http.client.HTTPConnection(API.hostname, API.port or 80, timeout=600 if stream else 30)
        headers = {"Authorization": "Bearer " + KEY, "Accept": "text/event-stream" if stream else "application/json"}
        if body is not None:
            headers["Content-Type"] = "application/json"
        try:
            conn.request(verb, target, body=body, headers=headers)
            up = conn.getresponse()
            if not stream:
                data = up.read()
                self.send_response(up.status)
                self.send_header("Content-Type", up.getheader("Content-Type", "application/json"))
                self.send_header("Content-Length", str(len(data)))
                self.end_headers()
                self.wfile.write(data)
                return True
            # flux en direct : on retransmet tel quel, morceau par morceau
            self.send_response(up.status)
            self.send_header("Content-Type", "text/event-stream")
            self.send_header("Cache-Control", "no-cache")
            self.send_header("X-Accel-Buffering", "no")
            self.end_headers()
            while True:
                chunk = up.read1(8192) if hasattr(up, "read1") else up.read(1024)
                if not chunk:
                    break
                self.wfile.write(chunk)
                self.wfile.flush()
        except (BrokenPipeError, ConnectionResetError):
            pass
        except Exception:
            try:
                self._json(502, {"error": "Hermes injoignable"})
            except Exception:
                pass
        finally:
            conn.close()
        return True

    def do_GET(self):
        if not self._proxy("GET"):
            super().do_GET()

    def do_POST(self):
        if not self._proxy("POST"):
            self._json(405, {"error": "méthode non autorisée"})

    def do_PATCH(self):
        if not self._proxy("PATCH"):
            self._json(405, {"error": "méthode non autorisée"})


def main():
    handler = partial(Handler, directory=WEB)
    srv = ThreadingHTTPServer(("127.0.0.1", PORT), handler)
    srv.daemon_threads = True
    print("Sanctuaire : http://127.0.0.1:%d (relais chat %s)" % (PORT, "actif" if KEY else "sans clé"), flush=True)
    try:
        srv.serve_forever()
    except KeyboardInterrupt:
        pass


if __name__ == "__main__":
    sys.exit(main())
