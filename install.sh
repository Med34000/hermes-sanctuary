#!/usr/bin/env bash
# =============================================================================
#  Le Sanctuaire Solaire — installation / Installer
#  Pour / for Hermes Agent (Nous Research) tournant en service systemd sur Linux.
#
#  ./install.sh              installation guidée, confirmation à chaque étape
#  ./install.sh --dry-run    montre le plan sans rien modifier / show the plan only
#  ./install.sh --yes        tout accepter (pour un agent, après validation humaine du plan)
#  ./install.sh --uninstall  désinstaller / uninstall
#  Options : --hermes-home DIR  --state-dir DIR  --web-port N  --api-port N
#            --gateway-service NOM  --restart now|later|no  --lang fr|en
#
#  Ne transmet rien à l'extérieur. La clé de l'API n'est jamais affichée.
#  2026-11-04 ≈18:45 (Europe/Zurich) — Claude (Cowork) — Anthropic, Claude Opus 5.5 — pour Médéric Morin
# =============================================================================
set -euo pipefail

REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ARGS="$*"; ENV_HH="${HERMES_HOME:-}"
YES=0; DRY=0; UNINSTALL=0
HERMES_HOME_ARG=""; STATE_DIR="/var/lib/sanctuaire"; WEB_PORT=8787; API_PORT=""
GATEWAY="hermes-gateway"; RESTART=""; LANG_UI=""
UNIT="/etc/systemd/system/sanctuaire-web.service"; KEY_DIR="/etc/sanctuaire"; STAMP="$(date +%Y%m%d-%H%M%S)"

while [ $# -gt 0 ]; do
  case "$1" in
    -y|--yes) YES=1 ;;
    -n|--dry-run) DRY=1 ;;
    --uninstall) UNINSTALL=1 ;;
    --hermes-home) HERMES_HOME_ARG="$2"; shift ;;
    --state-dir) STATE_DIR="$2"; shift ;;
    --web-port) WEB_PORT="$2"; shift ;;
    --api-port) API_PORT="$2"; shift ;;
    --gateway-service) GATEWAY="$2"; shift ;;
    --restart) RESTART="$2"; shift ;;
    --lang) LANG_UI="$2"; shift ;;
    -h|--help) sed -n '2,15p' "$0"; exit 0 ;;
    *) echo "Option inconnue / unknown option: $1"; exit 2 ;;
  esac
  shift
done
[ -z "$LANG_UI" ] && case "${LANG:-}" in fr*) LANG_UI=fr ;; *) LANG_UI=en ;; esac

# ---------- affichage ----------
if [ -t 1 ]; then B=$'\e[1m'; G=$'\e[32m'; Y=$'\e[33m'; R=$'\e[31m'; C=$'\e[36m'; N=$'\e[0m'; else B=""; G=""; Y=""; R=""; C=""; N=""; fi
t() { if [ "$LANG_UI" = fr ]; then printf '%s' "$1"; else printf '%s' "$2"; fi; }
say()  { echo "$*"; }
ok()   { echo "${G}✓${N} $*"; }
warn() { echo "${Y}!${N} $*"; }
die()  { echo "${R}✗ $*${N}" >&2; exit 1; }
step() { echo; echo "${B}${C}── $* ──${N}"; }

SUDO=""; IS_ROOT=0
if [ "$(id -u)" -ne 0 ]; then SUDO="sudo"; else IS_ROOT=1; fi
as_gw() { if [ "$IS_ROOT" = 1 ]; then runuser -u "$GW_USER" -- "$@"; else sudo -u "$GW_USER" "$@"; fi; }
run() {  # exécute (ou montre en --dry-run) une commande
  if [ "$DRY" = 1 ]; then echo "   ${C}\$${N} $*"; else "$@"; fi
}
ask() {  # ask "question" → 0 si oui
  if [ "$DRY" = 1 ]; then echo "   ($(t "étape prévue" "planned step"))"; return 0; fi
  if [ "$YES" = 1 ]; then return 0; fi
  local r; read -r -p "   $1 [$(t "O/n" "Y/n")] " r </dev/tty || r="n"
  case "${r:-o}" in [oOyY]*) return 0 ;; *) return 1 ;; esac
}

# ---------- vérifications ----------
step "$(t "Vérifications" "Checks")"
[ "$(uname -s)" = "Linux" ] || die "$(t "Linux requis." "Linux required.")"
command -v python3 >/dev/null || die "$(t "python3 introuvable." "python3 not found.")"
command -v systemctl >/dev/null || die "$(t "systemd requis (systemctl introuvable)." "systemd required (systemctl not found).")"
command -v curl >/dev/null || warn "$(t "curl absent : les vérifications finales seront sautées." "curl missing: final checks will be skipped.")"
if [ "$DRY" = 0 ] && [ "$YES" = 0 ] && [ ! -e /dev/tty ]; then
  die "$(t "Pas de terminal interactif : lance d'abord --dry-run, fais valider le plan, puis --yes." "No interactive terminal: run --dry-run first, get the plan approved, then --yes.")"
fi
if [ -n "$SUDO" ] && [ "$DRY" = 0 ]; then
  if ! sudo -n true 2>/dev/null; then
    if [ "$YES" = 1 ] || [ ! -e /dev/tty ]; then
      die "$(t "Droits administrateur nécessaires. Demande à un humain de lancer : sudo $0 $ARGS" "Admin rights needed. Ask a human to run: sudo $0 $ARGS")"
    fi
    say "$(t "Le mot de passe sudo va être demandé." "sudo will ask for your password.")"; sudo -v
  fi
fi
# lectures pendant l'essai : sudo seulement s'il ne demande rien, sinon ce qui est lisible
SR="$SUDO"; if [ "$DRY" = 1 ] && [ -n "$SUDO" ] && ! sudo -n true 2>/dev/null; then SR=""; warn "$(t "Essai sans sudo : certaines vérifications peuvent être incomplètes." "Dry run without sudo: some checks may be incomplete.")"; fi

# Hermes : dossier de données (HERMES_HOME) et utilisateur du service
gw_prop() { systemctl show -p "$1" --value "$GATEWAY" 2>/dev/null || true; }
GW_EXISTS=0; systemctl cat "$GATEWAY" >/dev/null 2>&1 && GW_EXISTS=1
HERMES_HOME="$HERMES_HOME_ARG"
if [ -z "$HERMES_HOME" ] && [ "$GW_EXISTS" = 1 ]; then
  HERMES_HOME="$(gw_prop Environment | tr ' ' '\n' | sed -n 's/^HERMES_HOME=//p' | head -1)"
fi
FOUND=""
for d in "$HERMES_HOME" "$ENV_HH" "${HOME}/.hermes" /opt/data; do
  if [ -n "$d" ] && $SR test -f "$d/config.yaml"; then FOUND="$d"; break; fi
done
HERMES_HOME="$FOUND"
[ -n "$HERMES_HOME" ] || die "$(t "Dossier de Hermes introuvable. Précise-le : --hermes-home /chemin (celui qui contient config.yaml)." "Hermes data folder not found. Use --hermes-home /path (the one containing config.yaml).")"
GW_USER="root"
if [ "$GW_EXISTS" = 1 ]; then GW_USER="$(gw_prop User)"; [ -z "$GW_USER" ] && GW_USER="root"; else GW_USER="$($SR stat -c %U "$HERMES_HOME")"; fi
ENV_FILE="$HERMES_HOME/.env"; CONF="$HERMES_HOME/config.yaml"
ok "Hermes : ${B}$HERMES_HOME${N} ($(t "utilisateur" "user") ${B}$GW_USER${N}, service ${B}$GATEWAY${N}$([ "$GW_EXISTS" = 1 ] || t " — introuvable" " — not found"))"
ok "$(t "Dépôt" "Repository") : ${B}$REPO${N}"
[ "$DRY" = 1 ] && warn "$(t "MODE ESSAI : rien ne sera modifié." "DRY RUN: nothing will be changed.")"

restart_gateway() {
  [ "$GW_EXISTS" = 1 ] || { warn "$(t "Redémarre Hermes toi-même pour charger le hook et le plugin." "Restart Hermes yourself to load the hook and plugin.")"; return; }
  local mode="$RESTART"
  if [ -z "$mode" ]; then if [ "$YES" = 1 ]; then mode="later"; else mode="now"; fi; fi
  case "$mode" in
    now)
      say "   $(t "Les messageries de Hermes (Discord, Telegram…) seront coupées ~10 s." "Hermes messaging (Discord, Telegram…) will be down ~10 s.")"
      if ask "$(t "Redémarrer $GATEWAY maintenant ?" "Restart $GATEWAY now?")"; then run $SUDO systemctl restart "$GATEWAY"; ok "$(t "Hermes redémarré." "Hermes restarted.")"; [ "$DRY" = 1 ] || sleep 8
      else warn "$(t "À faire plus tard : sudo systemctl restart $GATEWAY" "Do it later: sudo systemctl restart $GATEWAY")"; fi ;;
    later)  # utile quand c'est Hermes lui-même qui installe : il termine sa réponse avant d'être redémarré
      run $SUDO systemd-run --quiet --on-active=30 --unit="sanctuaire-restart-$STAMP" systemctl restart "$GATEWAY"
      ok "$(t "Redémarrage de Hermes programmé dans 30 s." "Hermes restart scheduled in 30 s.")" ;;
    *) warn "$(t "Redémarrage non fait : sudo systemctl restart $GATEWAY" "Restart skipped: sudo systemctl restart $GATEWAY")" ;;
  esac
}

# =============================================================================
#  DÉSINSTALLATION
# =============================================================================
if [ "$UNINSTALL" = 1 ]; then
  step "$(t "Désinstallation" "Uninstall")"
  if ask "$(t "Arrêter et supprimer le service sanctuaire-web ?" "Stop and remove the sanctuaire-web service?")"; then
    run $SUDO systemctl disable --now sanctuaire-web 2>/dev/null || true
    run $SUDO rm -f "$UNIT"; run $SUDO systemctl daemon-reload; ok "Service"
  fi
  if ask "$(t "Retirer le hook et le plugin de Hermes ?" "Remove the hook and plugin from Hermes?")"; then
    run $SUDO rm -rf "$HERMES_HOME/hooks/sanctuaire" "$HERMES_HOME/plugins/sanctuaire-sentinelle"; ok "Hook + plugin"
    warn "$(t "Pense à retirer sanctuaire-sentinelle des plugins activés si Hermes le signale." "Remove sanctuaire-sentinelle from enabled plugins if Hermes complains.")"
  fi
  if ask "$(t "Supprimer la copie de la clé ($KEY_DIR) ?" "Delete the key copy ($KEY_DIR)?")"; then run $SUDO rm -rf "$KEY_DIR"; ok "$KEY_DIR"; fi
  if ask "$(t "Supprimer l'état ($STATE_DIR) ?" "Delete the state folder ($STATE_DIR)?")"; then run $SUDO rm -rf "$STATE_DIR"; ok "$STATE_DIR"; fi
  say "   $(t "L'API de Hermes reste activée (config.yaml / .env) : désactive-la si tu ne t'en sers plus." "The Hermes API stays enabled (config.yaml / .env): disable it if unused.")"
  restart_gateway
  ok "$(t "Désinstallé." "Uninstalled.")"; exit 0
fi

# =============================================================================
#  1. Dépôt lisible par le service
# =============================================================================
step "1/7 $(t "Emplacement de la page" "Page location")"
case "$REPO" in
  /home/*|/root/*)
    say "   $(t "Le service web tourne sans privilège et ne peut pas lire un dossier personnel." "The web service runs unprivileged and cannot read a home folder.")"
    if ask "$(t "Copier le dépôt dans /opt/sanctuaire (recommandé, mises à jour par git pull) ?" "Copy the repository to /opt/sanctuaire (recommended, update with git pull)?")"; then
      run $SUDO mkdir -p /opt/sanctuaire
      run $SUDO cp -a "$REPO/." /opt/sanctuaire/
      REPO=/opt/sanctuaire; ok "$(t "Dépôt copié dans" "Repository copied to") /opt/sanctuaire"
    else
      die "$(t "Clone le dépôt hors de /home (ex. /opt/sanctuaire) puis relance." "Clone the repository outside /home (e.g. /opt/sanctuaire) and run again.")"
    fi ;;
  *) ok "$REPO" ;;
esac

# =============================================================================
#  2. Dossier d'état (écrit par Hermes, lu par la page)
# =============================================================================
step "2/7 $(t "Dossier d'état" "State folder") ($STATE_DIR)"
say "   $(t "Hermes y écrit seulement des noms d'outils et des heures, jamais le contenu des conversations." "Hermes only writes tool names and timestamps there, never conversation content.")"
if ask "$(t "Créer $STATE_DIR (propriétaire $GW_USER) ?" "Create $STATE_DIR (owner $GW_USER)?")"; then
  run $SUDO install -d -m 755 -o "$GW_USER" "$STATE_DIR"; ok "$STATE_DIR"
fi

# =============================================================================
#  3. Hook d'activité + plugin Shiba
# =============================================================================
step "3/7 $(t "Hook et plugin dans Hermes" "Hook and plugin in Hermes")"
if ask "$(t "Installer le hook (activité) et le plugin Shiba (erreurs, approbations) ?" "Install the activity hook and the Shiba plugin (errors, approvals)?")"; then
  for pair in "hermes-hook:hooks/sanctuaire" "hermes-plugin/sanctuaire-sentinelle:plugins/sanctuaire-sentinelle"; do
    src="$REPO/${pair%%:*}"; dst="$HERMES_HOME/${pair#*:}"
    run $SUDO mkdir -p "$dst"
    run $SUDO cp -a "$src/." "$dst/"
    if [ "$DRY" = 1 ]; then echo "   ${C}\$${N} echo $STATE_DIR > $dst/state_dir"; else echo "$STATE_DIR" | $SUDO tee "$dst/state_dir" >/dev/null; fi
    run $SUDO chown -R "$GW_USER" "$dst"
  done
  ok "$(t "Copiés dans" "Copied to") $HERMES_HOME/hooks · $HERMES_HOME/plugins"
  HERMES_BIN="$(command -v hermes 2>/dev/null || true)"
  for c in "$HERMES_HOME/hermes-agent/venv/bin/hermes" "$HERMES_HOME/hermes-agent/.venv/bin/hermes"; do if [ -z "$HERMES_BIN" ] && $SR test -x "$c"; then HERMES_BIN="$c"; fi; done
  if [ -n "$HERMES_BIN" ]; then
    if run as_gw env HERMES_HOME="$HERMES_HOME" "$HERMES_BIN" plugins enable sanctuaire-sentinelle; then ok "$(t "Plugin activé." "Plugin enabled.")"
    else warn "$(t "Active le plugin toi-même : hermes plugins enable sanctuaire-sentinelle" "Enable the plugin yourself: hermes plugins enable sanctuaire-sentinelle")"; fi
  else
    warn "$(t "Commande hermes introuvable. Active le plugin : hermes plugins enable sanctuaire-sentinelle" "hermes command not found. Enable the plugin: hermes plugins enable sanctuaire-sentinelle")"
  fi
fi

# =============================================================================
#  4. API de Hermes (pour le chat), en local uniquement
# =============================================================================
step "4/7 $(t "API de Hermes (chat)" "Hermes API (chat)")"
envget() { $SR sed -n "s/^$1=//p" "$ENV_FILE" 2>/dev/null | tail -1 | tr -d '"'"'"; }
HAS_KEY=0; [ -n "$(envget API_SERVER_KEY)" ] && HAS_KEY=1
[ -z "$API_PORT" ] && API_PORT="$(envget API_SERVER_PORT)"; [ -z "$API_PORT" ] && API_PORT=9119
if [ "$HAS_KEY" = 1 ]; then
  ok "$(t "Clé API déjà présente dans .env (réutilisée, jamais affichée), port" "API key already in .env (reused, never shown), port") $API_PORT"
else
  say "   $(t "Ajoute à $ENV_FILE : API_SERVER_ENABLED, API_SERVER_PORT=$API_PORT et une clé aléatoire (copie de sauvegarde faite)." "Adds to $ENV_FILE: API_SERVER_ENABLED, API_SERVER_PORT=$API_PORT and a random key (backup made).")"
  if ask "$(t "Activer l'API de Hermes sur 127.0.0.1:$API_PORT ?" "Enable the Hermes API on 127.0.0.1:$API_PORT?")"; then
    if [ "$DRY" = 1 ]; then echo "   ${C}\$${N} (cp .env .env.bak-sanctuaire-$STAMP ; ajout des 3 variables / append 3 variables)"
    else
      $SUDO test -f "$ENV_FILE" && $SUDO cp -a "$ENV_FILE" "$ENV_FILE.bak-sanctuaire-$STAMP"
      NEWKEY="$(python3 -c 'import secrets; print(secrets.token_hex(32))')"
      printf '\n# Sanctuaire Solaire (%s)\nAPI_SERVER_ENABLED=true\nAPI_SERVER_PORT=%s\nAPI_SERVER_KEY=%s\n' "$STAMP" "$API_PORT" "$NEWKEY" | $SUDO tee -a "$ENV_FILE" >/dev/null
      unset NEWKEY; $SUDO chown "$GW_USER" "$ENV_FILE"; $SUDO chmod 600 "$ENV_FILE"
      ok "$(t "API activée dans .env" "API enabled in .env")"
    fi
  fi
fi
# un « enabled: false » dans config.yaml l'emporte sur le .env : on le repère
FALSES="$($SR python3 - "$CONF" 2>/dev/null <<'PY'
import re, sys
lines = open(sys.argv[1], encoding="utf-8").read().split("\n")
for i, l in enumerate(lines):
    m = re.match(r"^(\s*)api_server:\s*(#.*)?$", l)
    if not m:
        continue
    ind = len(m.group(1))
    for j in range(i + 1, len(lines)):
        s = lines[j]
        if s.strip() and len(s) - len(s.lstrip()) <= ind:
            break
        if re.match(r"^\s*enabled:\s*(false|no|off)\s*(#.*)?$", s, re.I):
            print(j + 1)
PY
)"
if [ -n "$FALSES" ]; then
  warn "$(t "config.yaml désactive l'API (ligne(s) $(echo $FALSES))." "config.yaml disables the API (line(s) $(echo $FALSES)).")"
  if ask "$(t "Passer ces lignes à « enabled: true » (copie de sauvegarde faite) ?" "Set these lines to « enabled: true » (backup made)?")"; then
    run $SUDO cp -a "$CONF" "$CONF.bak-sanctuaire-$STAMP"
    for n in $FALSES; do run $SUDO sed -i -E "${n}s/enabled:[[:space:]]*(false|no|off)/enabled: true/I" "$CONF"; done
    ok "config.yaml"
  fi
else
  ok "$(t "config.yaml ne bloque pas l'API." "config.yaml does not block the API.")"
fi

# =============================================================================
#  5. Copie de la clé pour le relais (lisible par root seulement)
# =============================================================================
step "5/7 $(t "Clé pour le relais" "Key for the relay")"
say "   $(t "Le relais lit la clé ici ; la page ne la voit jamais." "The relay reads the key here; the page never sees it.")"
if ask "$(t "Écrire $KEY_DIR/api.key (root, 600) ?" "Write $KEY_DIR/api.key (root, 600)?")"; then
  if [ "$DRY" = 1 ]; then echo "   ${C}\$${N} install -d -m 700 $KEY_DIR ; (clé copiée depuis .env / key copied from .env) → $KEY_DIR/api.key"
  else
    $SUDO install -d -m 700 -o root -g root "$KEY_DIR"
    K="$(envget API_SERVER_KEY)"; [ -n "$K" ] || die "$(t "API_SERVER_KEY absente de .env." "API_SERVER_KEY missing from .env.")"
    printf '%s' "$K" | $SUDO tee "$KEY_DIR/api.key" >/dev/null; unset K
    $SUDO chown root:root "$KEY_DIR/api.key"; $SUDO chmod 600 "$KEY_DIR/api.key"; ok "$KEY_DIR/api.key"
  fi
fi

# =============================================================================
#  6. Service web (127.0.0.1 seulement, sans privilège, lecture seule)
# =============================================================================
step "6/7 $(t "Service web" "Web service") (127.0.0.1:$WEB_PORT)"
UNIT_TEXT="# Le Sanctuaire Solaire — page + relais du chat (généré par install.sh le $STAMP)
[Unit]
Description=Sanctuaire Solaire - page web et relais chat (127.0.0.1:$WEB_PORT)
After=network.target $GATEWAY.service

[Service]
Type=simple
DynamicUser=yes
Environment=SANCTUAIRE_WEB=$REPO/web SANCTUAIRE_PORT=$WEB_PORT HERMES_API=http://127.0.0.1:$API_PORT SANCTUAIRE_STATE_DIR=$STATE_DIR
LoadCredential=api.key:$KEY_DIR/api.key
ExecStart=/usr/bin/env python3 $REPO/deploy/sanctuaire_server.py
Restart=on-failure
RestartSec=5
ProtectSystem=strict
ProtectHome=yes
PrivateTmp=yes
NoNewPrivileges=yes
ReadOnlyPaths=$REPO $STATE_DIR
MemoryMax=96M

[Install]
WantedBy=multi-user.target"
if ask "$(t "Installer et démarrer le service sanctuaire-web ?" "Install and start the sanctuaire-web service?")"; then
  if [ "$DRY" = 1 ]; then echo "   ${C}\$${N} (écrit / writes) $UNIT"; else
    $SUDO test -f "$UNIT" && $SUDO cp -a "$UNIT" "$UNIT.bak-$STAMP"
    printf '%s\n' "$UNIT_TEXT" | $SUDO tee "$UNIT" >/dev/null
  fi
  run $SUDO systemctl daemon-reload
  run $SUDO systemctl enable --now sanctuaire-web
  run $SUDO systemctl restart sanctuaire-web
  ok "sanctuaire-web"
fi

# =============================================================================
#  7. Redémarrage de Hermes + vérifications
# =============================================================================
step "7/7 $(t "Redémarrer Hermes et vérifier" "Restart Hermes and check")"
restart_gateway
if [ "$DRY" = 0 ] && command -v curl >/dev/null; then
  sleep 2
  if curl -fsS -m 5 "http://127.0.0.1:$API_PORT/health" >/dev/null 2>&1; then ok "$(t "API de Hermes : répond" "Hermes API: up")"
  else warn "$(t "API de Hermes : pas (encore) de réponse sur" "Hermes API: no answer (yet) on") 127.0.0.1:$API_PORT"; fi
  if curl -fsS -m 5 -o /dev/null "http://127.0.0.1:$WEB_PORT/panorama.html" 2>/dev/null; then ok "$(t "Page : OK" "Page: OK")"
  else warn "$(t "Page : pas de réponse — voir : journalctl -u sanctuaire-web -n 30" "Page: no answer — see: journalctl -u sanctuaire-web -n 30")"; fi
  code="$(curl -s -m 5 -o /dev/null -w '%{http_code}' -H 'X-Sanctuaire: 1' "http://127.0.0.1:$WEB_PORT/chat/sessions" || true)"
  if [ "$code" = 200 ]; then ok "$(t "Chat : relais → Hermes OK" "Chat: relay → Hermes OK")"
  else warn "$(t "Chat : code $code (normal si Hermes redémarre encore ; relance la vérification dans 1 min)" "Chat: code $code (normal while Hermes restarts; check again in 1 min)")"; fi
fi

HOST="$(hostname -I 2>/dev/null | awk '{print $1}')"
echo
if [ "$DRY" = 1 ]; then echo "${B}$(t "Fin de l'essai : relance sans --dry-run pour installer." "End of dry run: run again without --dry-run to install.")${N}"; else echo "${B}${G}$(t "C'est prêt." "All set.")${N}"; fi
say "$(t "Le Sanctuaire n'écoute qu'en local (aucun port ouvert). Depuis ton ordinateur :" "The Sanctuary only listens locally (no open port). From your computer:")"
echo "   ${C}ssh -N -L $WEB_PORT:127.0.0.1:$WEB_PORT $(id -un)@${HOST:-<serveur>}${N}"
echo "   ${C}http://localhost:$WEB_PORT/panorama.html${N}"
say "$(t "Mise à jour : git -C $REPO pull, puis rechargement forcé de la page." "Update: git -C $REPO pull, then hard-refresh the page.")"
