# ☀️ Le Sanctuaire Solaire

**A living, playful interface for [Hermes Agent](https://github.com/NousResearch/hermes-agent).**
Every tool your agent uses wakes up a companion, and you chat with it right next to the scene.
**Une interface vivante et ludique pour Hermes Agent** : chaque outil utilisé par ton agent réveille un compagnon, et tu discutes avec lui juste à côté.

![Le Sanctuaire Solaire — démo](docs/demo.gif)

> 🇫🇷 Projet personnel de [Médéric Morin](https://iatelier.ch), construit en *vibe coding* avec l'IA. Partagé pour recevoir **des avis, des idées et des améliorations**. ([Lire en français ↓](#-en-français))
> 🇬🇧 Personal project, built by vibe coding with AI. Shared to get **feedback, ideas and improvements**.

---

## 🇬🇧 English

### What you see

| Companion | Wakes up when Hermes uses… |
|---|---|
| 🦊 **Kitsune Hermes** (coordinator) | start/end of each turn, `send_message`, `delegate_task`, `clarify`, `cronjob` — he shouts and throws a paper plane to the right companion |
| 🦉 **Chouette Céleste** (research) | `web_search`, `web_extract`, `vision_analyze`, `browser_*` — she flies away and comes back |
| 🐹 **Data-Taupe** (analysis) | `read_file`, `search_files`, `memory`, `session_search`, `skill_view`, `todo` |
| 🦫 **Brico-Castor** (building) | `write_file`, `patch`, `terminal`, `process`, `execute_code`, `skill_manage` |
| 🐕 **Shiba Sentinel** (safety) | slash commands, tool errors, API errors, approval requests — he barks |

Plus a **chat panel**: Kitsune listens while you type, reads your letter, thinks, and every reply has a foldable *"what the companions did"* thread. Folders on the left (pinned Hermes conversations), images, shortcuts.

### Privacy by design
- The hook and the plugin only write **tool names and timestamps**. Never messages, replies, arguments or results.
- Everything listens on **127.0.0.1 only**, with no open port. You reach it through an SSH tunnel.
- The Hermes API key stays on the server and is **never sent to the page**.

### Quick start
Requirements: Linux server, Hermes Agent running as a **systemd service**, `python3`, `sudo`.

```bash
sudo git clone https://github.com/Med34000/sanctuaire-solaire-hermes /opt/sanctuaire
cd /opt/sanctuaire
./install.sh --dry-run   # shows the plan, changes nothing
./install.sh             # guided install, asks before every step
```
Then from your computer: `ssh -N -L 8787:127.0.0.1:8787 user@your-server` → open **http://localhost:8787/panorama.html**

**Or let your Hermes install it.** Send him:
> Install the Sanctuaire Solaire on this server: https://github.com/Med34000/sanctuaire-solaire-hermes — read AGENTS.md in the repo and follow it. Show me the dry-run plan before changing anything.

Details, manual install and troubleshooting: **[INSTALL.md](INSTALL.md)**.

### Ideas & contributions welcome 🙌
This is the most interesting part for me. New environments and characters, better tool mappings, mobile, security, performance, support for other agents: **[open a discussion or an issue](../../issues/new/choose)**. See [CONTRIBUTING.md](CONTRIBUTING.md) and the [ROADMAP](ROADMAP.md).

---

## 🇫🇷 En français

### Ce que tu vois
Cinq compagnons dans une grande clairière, chacun lié à une famille d'outils de Hermes (tableau ci-dessus) :
- 🦊 **Kitsune** coordonne ;
- 🦉 **la Chouette** cherche sur le web ;
- 🐹 **la Taupe** fouille fichiers et mémoire ;
- 🦫 **le Castor** écrit et exécute ;
- 🐕 **le Shiba** veille et aboie au moindre souci.

À droite, **le chat**. Kitsune t'écoute pendant que tu écris, lit ta lettre puis réfléchit, et chaque réponse a son fil repliable « Ce qu'ont fait les compagnons ». Tu as aussi des dossiers, des images et des raccourcis.

### Confidentialité
- Seuls des **noms d'outils et des heures** sont écrits, jamais le contenu des conversations.
- Tout écoute **en local uniquement** (127.0.0.1), sans aucun port ouvert. L'accès se fait par tunnel SSH.
- La clé de l'API reste sur le serveur, **jamais dans la page**.

### Installer
```bash
sudo git clone https://github.com/Med34000/sanctuaire-solaire-hermes /opt/sanctuaire
cd /opt/sanctuaire
./install.sh --dry-run   # montre le plan, ne modifie rien
./install.sh             # installation guidée, confirmation à chaque étape
```
**Ou demande à ton Hermes de l'installer** :
> Installe le Sanctuaire Solaire sur ce serveur : https://github.com/Med34000/sanctuaire-solaire-hermes — lis AGENTS.md dans le dépôt et suis-le. Montre-moi le plan (--dry-run) avant de modifier quoi que ce soit.

Tous les détails sont dans **[INSTALL.md](INSTALL.md)**. Pour créer ton propre environnement, voir [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md#créer-un-nouvel-environnement).

### Ton avis et tes idées m'intéressent 🙌
Que ce soit une critique, une idée, une optimisation ou un conseil de sécurité, **[ouvre une discussion ou une issue](../../issues/new/choose)**. Voir [CONTRIBUTING.md](CONTRIBUTING.md) et la [feuille de route](ROADMAP.md).

---

## License / Licence
**Open source.**
- **Code**: [Apache 2.0](LICENSE). Use it, modify it, share it, build on it, as long as you keep the [NOTICE](NOTICE) that credits the author.
- **Images & characters**: [CC BY 4.0](LICENSE-ASSETS). Free to reuse, with credit.
- 🇫🇷 Le code est sous Apache 2.0 et les images sous CC BY 4.0 : tout est libre, à condition de **garder le crédit « Le Sanctuaire Solaire — Médéric Morin »** (fichier [NOTICE](NOTICE)).

**Created by Médéric Morin** · [LinkedIn](https://www.linkedin.com/in/mederic-morin-auto-ia-tech/) · [iatelier.ch](https://iatelier.ch)

Independent project, not affiliated with Nous Research. / Projet indépendant, sans lien avec Nous Research.

*2026-11-04 ≈18:55 (Europe/Zurich) — Claude (Cowork) — Anthropic, Claude Opus 5.5, pour Médéric Morin*
