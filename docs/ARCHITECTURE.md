# Architecture

*2026-11-04 ≈18:55 (Europe/Zurich) — Claude (Cowork) — Anthropic, Claude Opus 5.5, pour Médéric Morin*

## Fonctionnement

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
- La **page** (`web/panorama.html`) charge le moteur (`web/moteur.js`), l'habillage (`web/themes/<id>/theme.json`) et le chat (`web/chat.js`). Sans état joignable, elle tourne en démo.

## Correspondance outils → compagnons

| Rôle (clé moteur) | Outils Hermes | Sanctuaire Solaire |
|---|---|---|
| coordination | début/fin de tour, `send_message`, `delegate_task`, `clarify`, `cronjob` | Kitsune Hermes |
| recherche | `web_search`, `web_extract`, `vision_analyze`, `browser_*`, `web_*` | Chouette Céleste |
| analyse | `read_file`, `search_files`, `memory`, `session_search`, `skill_view`, `skills_list`, `todo` | Data-Taupe |
| fabrication | `write_file`, `patch`, `terminal`, `process`, `execute_code`, `skill_manage` | Brico-Castor |
| securite | commandes slash, erreurs d'outils, erreurs API, approbations | Shiba Sentinel |

La même table existe dans le hook (`CARTE`) et dans le moteur (`TOOL_ROLE`). Si tu changes l'une, change l'autre.

## Fichiers

- `web/moteur.js` : moteur commun à tous les environnements. Il gère les états, l'avion en papier de Kitsune, la promenade quand tout est calme, l'envol, les boucles animées, le journal et la démo.
- `web/themes/<id>/theme.json` : habillage d'un environnement (décor, personnages, positions, boucles, textes du chat).
- `web/chat.js` : le chat (écoute, lecture, réflexion, fil d'activité, raccourcis, images, dossiers).
- `web/index.html` + `web/chouette-vol.js` : vue bonus « 5 scènes ».
- `deploy/sanctuaire_server.py` : serveur interne et relais. `deploy/sanctuaire-web.service` est un exemple de service, puisque `install.sh` génère le sien.
- `install.sh` : installation et désinstallation guidées.

## Créer un nouvel environnement

1. Copier `web/themes/sanctuaire/` en `web/themes/<nouveau>/`, et mettre `"base": "themes/<nouveau>/"`.
2. Y déposer le panorama et les images ou planches des 5 rôles (coordination, fabrication, recherche, analyse, securite).
3. Ajuster dans `theme.json` les noms, les positions (`pos`, `visit`), les boucles (`loop`, `alertLoop`, `fly`, `walk`) et les textes.
   Langues : les textes de base sont dans la langue indiquée par `"lang"`. Les traductions vont dans `"i18n": { "en": { … } }`, avec la même structure, seulement les textes. Les textes de la page elle-même (boutons, journal) sont dans `web/moteur.js` → `UI`.
4. Ouvrir `panorama.html?theme=<nouveau>`.

Recette d'animation qui a fait ses preuves :
1. Une image du personnage sur fond vert pur (#00FF00).
2. Une vidéo courte « sur place », caméra fixe, en boucle.
3. Extraction d'une boucle propre (ou aller-retour), suppression du vert, planche d'images au format webp, taille calée sur le corps du personnage.

## Règles

- Une personne = une instance Hermes isolée. Ne jamais brancher un tiers sur l'instance personnelle de quelqu'un.
- L'état ne contient jamais de message, de réponse, d'identifiant ni de résultat d'outil.
