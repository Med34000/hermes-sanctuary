# Installation

*2026-11-04 ≈18:55 (Europe/Zurich) — Claude (Cowork) — Anthropic, Claude Opus 5.5, pour Médéric Morin*

🇬🇧 English below the French section · 🇫🇷 Français d'abord

---

## 🇫🇷 Installer le Sanctuaire

### Prérequis
- Un serveur Linux où **Hermes Agent tourne en service systemd** (souvent `hermes-gateway`).
- `python3`, `git`, `curl`, et un accès `sudo`.
- Ton dossier de données Hermes, celui qui contient `config.yaml`. L'installateur le cherche dans le service, puis dans `~/.hermes` et `/opt/data`.

### Installation guidée (recommandée)
```bash
sudo git clone https://github.com/Med34000/sanctuaire-solaire-hermes /opt/sanctuaire
cd /opt/sanctuaire
./install.sh --dry-run   # 1. lis le plan : rien n'est modifié
./install.sh             # 2. installe, avec une confirmation à chaque étape
```

| Étape | Ce que fait `install.sh` |
|---|---|
| 1 | Vérifie que la page est dans un dossier lisible par le service. Si tu as cloné dans `/home`, il propose de copier le dépôt dans `/opt/sanctuaire`. |
| 2 | Crée le dossier d'état `/var/lib/sanctuaire`, qui appartient à l'utilisateur de Hermes. |
| 3 | Copie le **hook** (activité) et le **plugin Shiba** (erreurs, approbations) dans Hermes, puis active le plugin. |
| 4 | Active l'**API de Hermes** sur 127.0.0.1 : il ajoute 3 lignes au `.env` (avec une clé aléatoire), et corrige `config.yaml` s'il contient `enabled: false`. Une copie de sauvegarde est faite avant chaque modification. |
| 5 | Copie la clé dans `/etc/sanctuaire/api.key`, lisible par root seulement. Elle ne va jamais dans la page. |
| 6 | Installe le service `sanctuaire-web` sur 127.0.0.1:8787 : sans privilège, en lecture seule, limité à 96 Mo. |
| 7 | Redémarre Hermes (messageries coupées environ 10 s) et vérifie que l'API, la page et le chat répondent. |

Options :
- `--hermes-home DIR` : dossier de données de Hermes ;
- `--state-dir DIR` : dossier d'état ;
- `--web-port N` : port de la page ;
- `--api-port N` : port de l'API de Hermes ;
- `--gateway-service NOM` : nom du service Hermes ;
- `--restart now|later|no` : quand redémarrer Hermes ;
- `--yes` : tout accepter ;
- `--lang fr|en` : langue des messages.

### Ouvrir le Sanctuaire
Rien n'est ouvert sur Internet. Depuis ton ordinateur :
```bash
ssh -N -L 8787:127.0.0.1:8787 utilisateur@ton-serveur
```
Puis ouvre **http://localhost:8787/panorama.html**. Laisse cette fenêtre de terminal ouverte tant que tu utilises le Sanctuaire.
Alternative : [Tailscale](https://tailscale.com) (réseau privé) si tu veux y accéder depuis ton téléphone.

### Laisser ton Hermes l'installer
Envoie-lui :
> Installe le Sanctuaire Solaire sur ce serveur : https://github.com/Med34000/sanctuaire-solaire-hermes — lis AGENTS.md dans le dépôt et suis-le. Montre-moi le plan (--dry-run) avant de modifier quoi que ce soit.

Il lancera l'essai, te résumera le plan, attendra ton accord, puis installera avec un redémarrage programmé 30 s plus tard, le temps de te répondre. S'il n'a pas les droits `sudo`, il te donnera la commande à taper.

### Mettre à jour / désinstaller
```bash
git -C /opt/sanctuaire pull          # puis Cmd/Ctrl + Maj + R dans le navigateur
sudo /opt/sanctuaire/install.sh --uninstall
```

### Installation manuelle (Docker, autres cas)
1. Copie `hermes-hook/` dans `<HERMES_HOME>/hooks/sanctuaire/`, et `hermes-plugin/sanctuaire-sentinelle/` dans `<HERMES_HOME>/plugins/`. Puis lance `hermes plugins enable sanctuaire-sentinelle`.
2. Assure-toi que le hook et le plugin peuvent écrire dans le dossier d'état. Tu peux en choisir un autre avec la variable `SANCTUAIRE_STATE_DIR`, ou avec un fichier `state_dir` à côté de chacun.
3. Active l'API de Hermes : mets `API_SERVER_ENABLED=true`, `API_SERVER_PORT=9119` et `API_SERVER_KEY=<clé>` dans `.env`. ⚠️ Un `enabled: false` sous `api_server:` dans `config.yaml` l'emporte sur `.env`.
4. Lance le serveur avec les variables `SANCTUAIRE_WEB=<dépôt>/web`, `SANCTUAIRE_STATE_DIR=<état>`, `HERMES_API=http://127.0.0.1:9119` et `SANCTUAIRE_KEY_FILE=<fichier de la clé>`, puis `python3 deploy/sanctuaire_server.py`.

### Problèmes fréquents
- **Le chat répond « la lettre s'est perdue »** : l'API de Hermes ne répond pas. Vérifie le `enabled: false` dans `config.yaml`, puis `curl http://127.0.0.1:9119/health`.
- **Les compagnons ne bougent pas** : regarde si le hook est chargé dans le log de Hermes (`Loaded hook 'sanctuaire'`), et si `<état>/etat.json` se met à jour.
- **La page ne s'affiche pas** : lance `journalctl -u sanctuaire-web -n 30`.

---

## 🇬🇧 Install

### Requirements
Linux server with **Hermes Agent running as a systemd service** (often `hermes-gateway`), `python3`, `git`, `curl`, `sudo`.

### Guided install
```bash
sudo git clone https://github.com/Med34000/sanctuaire-solaire-hermes /opt/sanctuaire
cd /opt/sanctuaire
./install.sh --dry-run   # read the plan, nothing changes
./install.sh             # install, confirming each step
```
The installer works in 7 steps:
1. Checks that the repository sits in a folder the service can read.
2. Creates the state folder.
3. Installs the hook and the Shiba plugin.
4. Enables the Hermes API on 127.0.0.1, with backups. This includes fixing `enabled: false` in `config.yaml`, which overrides `.env`.
5. Stores a root-only copy of the key for the relay.
6. Installs the hardened `sanctuaire-web` service.
7. Restarts Hermes and runs checks.

Options:
- `--hermes-home`, `--state-dir`, `--web-port`, `--api-port`, `--gateway-service` : folders, ports and service name;
- `--restart now|later|no` : when to restart Hermes;
- `--yes` : accept every step;
- `--lang fr|en` : language of the messages.

### Open it
`ssh -N -L 8787:127.0.0.1:8787 user@your-server`, then open **http://localhost:8787/panorama.html**. Nothing is exposed to the Internet. For phone access, Tailscale works well.

### Let your Hermes install it
> Install the Sanctuaire Solaire on this server: https://github.com/Med34000/sanctuaire-solaire-hermes — read AGENTS.md in the repo and follow it. Show me the dry-run plan before changing anything.

### Update / uninstall
To update: `git -C /opt/sanctuaire pull`, then hard-refresh the page. To uninstall: `sudo /opt/sanctuaire/install.sh --uninstall`.

### Manual install (Docker, other setups)
See the four steps in the French section above. The commands and file paths are the same.
