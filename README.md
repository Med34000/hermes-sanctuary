# Le Sanctuaire Solaire de Hermes

*2026-11-02 ≈11:00 (Europe/Zurich) — Claude (Cowork) — Anthropic, Claude Opus 5.5*

Interface ludique qui montre l'activité de Hermes avec 5 compagnons animés.
**Aucun contenu de conversation ne quitte Hermes** : seuls des noms d'outils et des horodatages sont utilisés.

## Fonctionnement

```
Hermes (gateway) ──hook──> /var/lib/sanctuaire/etat.json ──> page web (127.0.0.1:8787) ──tunnel SSH──> navigateur
```

| Compagnon | Déclenché par |
|---|---|
| Brico-Castor (forge) | `write_file`, `patch`, `terminal`, `process`, `execute_code`, `skill_manage` |
| Data-Taupe (alcôve) | `read_file`, `search_files`, `memory`, `session_search`, `skill_view`, `skills_list`, `todo` |
| Chouette Céleste (cabane) | `web_search`, `web_extract`, `vision_analyze`, `browser_*`, `web_*` |
| Kitsune Hermes (chêne) | début/fin de chaque tour, `send_message`, `delegate_task`, `clarify`, `cronjob` |
| Shiba Sentinel (belvédère) | commandes slash, erreurs d'outils, erreurs API (modèle/fournisseur), demandes d'approbation (plugin) |

Les outils non reconnus sont listés dans `etat.json` → `inconnus` (noms seulement).

## Contenu

- `web/chouette-vol.js` — envol de la Chouette (recherche web) : elle quitte son perchoir, part chercher, revient lire sa trouvaille.
- `web/moteur.js` — **moteur commun** à tous les environnements (activité Hermes, rôles, états, marche du coordinateur, envol, boucles animées, journal, démo).
- `web/themes/<id>/theme.json` — **habillage** d'un environnement (décor, personnages, positions, boucles, textes). Premier : `themes/sanctuaire/`. Choix : `panorama.html?theme=<id>` ou balise `sanctuaire-theme`.
- `web/panorama.html` — vue panorama : tous les compagnons dans la grande clairière, Kitsune Hermes marche porter les lettres (même source live).
- `web/` — la page (même fichier que l'artefact claude.ai) et ses images. Sans `etat.json` joignable, elle tourne en démo.
  Source réglable : `<meta name="sanctuaire-source" content="etat.json">`.
- `hermes-hook/` — le hook gateway, installé dans `/opt/data/hooks/sanctuaire/` (HERMES_HOME=/opt/data).
- `hermes-plugin/sanctuaire-sentinelle/` — plugin Shiba (erreurs d'outils, erreurs API, approbations) → `/var/lib/sanctuaire/sentinelle.json`, installé dans `/opt/data/plugins/`.
- `sources/` — fichiers sources : vidéos Grok (renard, castor, chouette, taupe) et panorama Gemini, pour pouvoir refaire les animations.
- `deploy/sanctuaire-web.service` — service systemd du mini serveur (127.0.0.1 seulement, utilisateur dynamique, lecture seule).

## Sur le VPS

- Dépôt cloné dans `/opt/sanctuaire`, mise à jour : `git -C /opt/sanctuaire pull`
- `web/etat.json` est un lien vers `/var/lib/sanctuaire/etat.json` (ignoré par Git)
- Accès depuis le Mac : `ssh -N -L 8787:127.0.0.1:8787 ubuntu@<vps>` puis http://localhost:8787

## Règles

- Jamais d'accès d'un tiers à l'instance Hermes personnelle. Une personne = une instance isolée.
- `etat.json` ne contient jamais de message, réponse, identifiant ni résultat d'outil.

## Créer un nouvel environnement

1. Copier `web/themes/sanctuaire/` en `web/themes/<nouveau>/` et mettre `"base": "themes/<nouveau>/"`.
2. Y déposer le panorama et les images/planches des 5 rôles (coordination, fabrication, recherche, analyse, securite).
3. Ajuster dans `theme.json` : noms, positions (`pos`, `visit`), boucles (`loop`, `alertLoop`, `fly`, `walk`) et textes.
4. Ouvrir `panorama.html?theme=<nouveau>`.
