# Architecture

*2026-11-04 ≈18:55, mis à jour 2026-11-05 ≈11:55 et ≈13:00 (Europe/Zurich) — Claude (Cowork) — Anthropic, Claude Opus 5.5, pour Médéric Morin*

Le Sanctuaire existe en deux formes, qui partagent le même moteur, le même habillage et les mêmes images :

1. **Le plugin Hermes** (`sanctuaire-solaire/`, recommandé) : Mac, Windows et Linux, dans Hermes Desktop et dans le tableau de bord web. Il s'installe en une commande et utilise le chat natif de Hermes.
2. **Le mode serveur** (`web/`, `deploy/`, `install.sh`) : une page autonome avec son propre chat (dossiers, Kitsune qui écoute et lit ta lettre), sur un serveur Linux, par tunnel SSH.

## 1. Le plugin (`sanctuaire-solaire/`)

```
Hermes (chaque processus : gateway, chat, Desktop, crons)
  └─ __init__.py (hooks) ──> <hermes home>/plugin-data/sanctuaire-solaire/proc/<pid>.json
                                        │
dashboard/plugin_api.py  ── GET /state (fusion) · /theme · /frame · /asset ──┐
                                                                              ├─> Hermes Desktop : panneau sous la conversation + page « Sanctuaire »
                                                                              └─> Tableau de bord : onglet « Sanctuaire » + bandeau au-dessus du Chat
```

- **`__init__.py`** : les hooks `pre_tool_call`, `post_tool_call`, `pre_llm_call`, `post_llm_call`, `on_session_end`, `post_api_request`, `api_request_error`, `pre_approval_request`, `post_approval_response`, `subagent_start` et `subagent_stop`. Ils écrivent **un petit fichier par processus** de Hermes, car les processus ne partagent pas leur mémoire :
  - noms d'outils et heures, tours en cours avec leur provenance (nom de la plateforme, nom de la tâche planifiée) ;
  - compteurs d'erreurs, de **bascules** (un autre modèle répond dans le même tour juste après une erreur du fournisseur) et d'approbations, avec la courte description générique donnée par Hermes ;
  - un **journal par heure** (tours, outils par compagnon, provenances, alertes, tokens par modèle), gardé 49 heures ; la page en tire « aujourd'hui » dans son propre fuseau horaire ;
  - les **tours trop lourds** (plus de 200 000 tokens d'entrée cumulés sur un tour), les 5 derniers outils de chaque compagnon et le nombre de sous-agents en cours.

  Ils ne renvoient jamais rien : Hermes n'est ni bloqué ni ralenti, et les approbations ne sont qu'affichées.
- **`dashboard/plugin_api.py`** : en lecture seule. `/state` fusionne les fichiers des processus. `/theme`, `/frame` et `/asset` servent l'habillage, la page et les images (Hermes Desktop ne peut pas lire les fichiers directement).
- **`dashboard/app/`** : le moteur (`moteur.js`), la page du cadre (`frame.html`), les habillages (`themes/<id>/`) et les images. Le mode serveur utilise les mêmes fichiers, par des liens dans `web/`.
- **`dashboard/dist/index.js`** : la partie tableau de bord. Elle affiche `app/frame.html` dans un cadre et lui envoie l'habillage et l'activité par `postMessage`.
- **`desktop/plugin.js`** : la partie Hermes Desktop. Elle affiche la page dans le cadre isolé de l'app (`SandboxedFrame`), lui envoie les images, l'activité fusionnée et les événements instantanés de l'app (`tool.start`, `message.start`, `message.complete` : **noms d'outils seulement**).
- Le cadre ne fait **aucun appel réseau** : tout arrive par messages depuis la page qui le contient.

## 2. Le mode serveur (`web/`, `deploy/`, `install.sh`)

```
Hermes (gateway) ──hook + plugin──> <dossier d'état>/etat.json, sentinelle.json ─┐
                                                                                 ├─> serveur interne 127.0.0.1:8787 ──tunnel SSH──> navigateur
Hermes API (127.0.0.1:9119) <──────── relais du chat (clé côté serveur) ─────────┘
```

- Le **hook** (`hermes-hook/`) reçoit `agent:start`, `agent:step` (noms d'outils), `agent:end`, `command:*` et écrit `etat.json` : compteurs, dernière activité et **nom du dernier outil** de chaque compagnon. Les outils non reconnus vont dans `inconnus` (noms seulement).
- Le **plugin Shiba** (`hermes-plugin/sanctuaire-sentinelle/`) écrit `sentinelle.json` : erreurs d'outils (nom de l'outil et type d'erreur), erreurs API et demandes d'approbation.
- Le **dossier d'état** vaut `/var/lib/sanctuaire` par défaut. On peut le changer avec la variable `SANCTUAIRE_STATE_DIR`, ou avec un fichier `state_dir` placé à côté du hook et du plugin (l'installateur l'écrit).
- Le **serveur interne** (`deploy/sanctuaire_server.py`) :
  - sert la page ;
  - sert l'état depuis `SANCTUAIRE_STATE_DIR` ;
  - relaie seulement quelques routes du chat vers l'API de Hermes, en ajoutant la clé côté serveur ;
  - exige l'en-tête `X-Sanctuaire` et un hôte et une origine locaux, sinon il répond 403 ;
  - accepte des images (4 au maximum) ;
  - n'enregistre ni ne journalise aucun contenu.
- La **page** (`web/panorama.html`) charge le moteur, l'habillage et le chat (`web/chat.js`). Sans état joignable, elle tourne en démo.

## Correspondance outils → compagnons

| Rôle (clé moteur) | Outils Hermes | Sanctuaire Solaire |
|---|---|---|
| coordination | début/fin de tour, `send_message`, `delegate_task`, `clarify`, `cronjob` | Kitsune Hermes |
| recherche | `web_search`, `web_extract`, `vision_analyze`, `browser_*`, `web_*` | Chouette Céleste |
| analyse | `read_file`, `search_files`, `memory`, `session_search`, `skill_view`, `skills_list`, `todo` | Data-Taupe |
| fabrication | `write_file`, `patch`, `terminal`, `process`, `execute_code`, `skill_manage` (et tout outil inconnu) | Brico-Castor |
| securite | erreurs d'outils, erreurs API, approbations (et commandes slash en mode serveur) | Shiba Sentinel |

La même table existe dans le plugin (`sanctuaire-solaire/__init__.py` → `CARTE`), dans le hook du mode serveur (`hermes-hook/handler.py` → `CARTE`) et dans le moteur (`TOOL_ROLE`). Si tu en changes une, change les autres.

## Fichiers

- `sanctuaire-solaire/dashboard/app/moteur.js` : moteur commun à tous les environnements. Il gère les états, l'avion en papier de Kitsune, la promenade quand tout est calme, l'envol, les boucles animées, le journal et la démo. Il lit l'activité soit sur le serveur (mode serveur), soit par messages (`<meta name="sanctuaire-source" content="host">`, plugin).
- `sanctuaire-solaire/dashboard/app/themes/<id>/theme.json` : habillage d'un environnement (décor, personnages, positions, boucles, textes du chat).
- `sanctuaire-solaire/dashboard/app/frame.html` : la page compacte du plugin.
- `web/panorama.html` et `web/chat.js` : la page complète du mode serveur et son chat. `web/moteur.js`, `web/themes` et les images du panorama sont des liens vers `sanctuaire-solaire/dashboard/app/`.
- `web/index.html` + `web/chouette-vol.js` : vue bonus « 5 scènes ».
- `deploy/sanctuaire_server.py` : serveur interne et relais. `deploy/sanctuaire-web.service` est un exemple de service, puisque `install.sh` génère le sien.
- `install.sh` : installation et désinstallation guidées du mode serveur.

## Créer un nouvel environnement

1. Copier `sanctuaire-solaire/dashboard/app/themes/sanctuaire/` en `themes/<nouveau>/`, et mettre `"base": "themes/<nouveau>/"`.
2. Y déposer le panorama et les images ou planches des 5 rôles (coordination, fabrication, recherche, analyse, securite).
3. Ajuster dans `theme.json` les noms, les positions (`pos`, `visit`), les boucles (`loop`, `alertLoop`, `fly`, `walk`) et les textes.
   Langues : les textes de base sont dans la langue indiquée par `"lang"`. Les traductions vont dans `"i18n": { "en": { … } }`, avec la même structure, seulement les textes. Les textes de la page elle-même (boutons, journal) sont dans `moteur.js` → `UI`.
4. Mode serveur : ouvrir `panorama.html?theme=<nouveau>`. Plugin : le choix de l'environnement n'existe pas encore (prévu dans la feuille de route).

Recette d'animation qui a fait ses preuves :
1. Une image du personnage sur fond vert pur (#00FF00).
2. Une vidéo courte « sur place », caméra fixe, en boucle.
3. Extraction d'une boucle propre (ou aller-retour), suppression du vert, planche d'images au format webp, taille calée sur le corps du personnage.

## Règles

- Une personne = une instance Hermes isolée. Ne jamais brancher un tiers sur l'instance personnelle de quelqu'un.
- L'état ne contient jamais de message, de réponse, d'argument, d'identifiant ni de résultat d'outil.
- Le plugin ne lit aucun secret, aucun fichier `.env`, et ne fait aucun appel réseau extérieur.
