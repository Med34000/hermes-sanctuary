# ☀️ Le Sanctuaire Solaire · The Solar Sanctuary — Hermes plugin

**A living view of your agent.** Five animated characters wake up when Hermes uses their tools, in two worlds:

- **Olympus** (default): Hermes reads the message and hands out the work, Athena's owl flies off to search the web, Hephaestus forges code behind his anvil, Mnemosyne searches files and memory, and Cerberus barks at errors and guards approvals. Leaves, water, forge fire and smoke move gently.
- **The Clearing**: the owl, the beaver, the mole, the Shiba and Kitsune with her paper planes.

Switch worlds with the button in the panorama's bar (🏛 Olympus / ☀ Clearing); the choice is remembered.

Works in **Hermes Desktop** (macOS, Windows, Linux) and in the **web dashboard**. English or French, from your system language.

![The Solar Sanctuary](../docs/catalog/banner.jpg)

![Today's journal](../docs/catalog/today-en.jpg)

## Install

```bash
hermes plugins install Med34000/sanctuaire-solaire-hermes/sanctuaire-solaire --enable
```

Then restart Hermes (gateway / dashboard) so the hooks and routes load.

- **Hermes Desktop**: open **Capabilities → Plugins**, turn on **Le Sanctuaire Solaire**. A pane appears under the conversation, and a **Sanctuaire** page in the sidebar.
- **Web dashboard**: a **Sanctuaire** tab, and a foldable strip above the **Chat** tab.

You chat with Hermes as usual; the Sanctuary shows what it is doing, including background work (crons, Discord, other chats).

**Hermes Desktop connected to a remote Hermes (a server)?** The pane half lives on your computer: in **Capabilities → Plugins → Install from Git**, enter `Med34000/sanctuaire-solaire-hermes/sanctuaire-solaire` and turn on **Force reinstall** if the plugin is already on the server.

## What it shows

- **Who is working**: each tool wakes its companion; Kitsune shouts and throws a paper plane to hand the work out.
- **Where the work comes from**: Kitsune's label shows *Discord*, *Telegram* or *⏰ your scheduled task* when Hermes works without you.
- **The Shiba guards you**: he barks on tool and provider errors, when Hermes **silently switches to a fallback model**, and when a permission is waiting (with Hermes's own short description, e.g. "recursive delete", and where to answer). In Hermes Desktop, a fallback or a permission waiting on Discord/Telegram also sends a native notification.
- **Heavy turns**: the Shiba growls when one turn reads more than 200,000 input tokens (a conversation grown too long: time for `/new`), and the journal lists the heaviest turns.
- **Today's journal** (*Today* button): turns, tools per companion, where the work came from, errors, fallbacks, heavy turns, permissions, tokens per model, hour by hour with the peak.
- **Companion cards**: click a companion to see its role, how often it worked today and its recent tools.
- **Subagents**: when Hermes delegates, doves circle the temple (Olympus) or little foxes join Kitsune (Clearing) until the subagents are done.
- **Night and sounds**: in the evening the clearing darkens and fireflies come out (your local time); optional sounds (off by default), synthesised on the spot, no audio files.

## Updating

`hermes plugins update sanctuaire-solaire` (or reinstall with `--force`), then restart the web dashboard. With Hermes Desktop connected to a remote Hermes, also reinstall the pane half (**Install from Git**, **Force reinstall**) and **quit and reopen the app** so its backend loads the new routes.

## What it records — privacy

- **Only names, times and counts**: tool names; turn start/end times and where a turn comes from (platform name, scheduled task name); counters of tool errors, provider errors, fallbacks, heavy turns and approvals; the number of running subagents; the generic description Hermes gives for an approval ("recursive delete"); model names and token counts per hour.
- **Never** messages, replies, tool arguments, commands, results, error texts, file paths or ids.
- Stored in `<hermes home>/plugin-data/sanctuaire-solaire/proc/` (one small JSON file per Hermes process; files older than 2 days are removed).

## Disclosure

- Hooks: `pre_tool_call`, `post_tool_call`, `pre_llm_call`, `post_llm_call`, `on_session_end`, `post_api_request`, `api_request_error`, `pre_approval_request`, `post_approval_response`, `subagent_start`, `subagent_stop`. All are observers: they never block, change or approve anything. Approvals are only shown, never answered: you answer them where Hermes asks.
- Backend routes (`/api/plugins/sanctuaire-solaire/`): read-only — the merged activity, the theme, the page and its images, all from the plugin's own folders.
- No network calls, no secrets, no `.env` access, no background process, no telemetry. Hermes Desktop may show native notifications (at most one per kind every 2 minutes).
- The panorama runs in a sandboxed frame that receives everything by `postMessage` and makes no request of its own.

## Make your own world

The engine and the look are separate: one environment = one `dashboard/app/themes/<id>/` folder (background, characters, positions, animations, texts). See [docs/ARCHITECTURE.md](https://github.com/Med34000/sanctuaire-solaire-hermes/blob/main/docs/ARCHITECTURE.md). Ideas and new worlds are welcome in the [Discussions](https://github.com/Med34000/sanctuaire-solaire-hermes/discussions).

## 🇫🇷 En bref

Le Sanctuaire Solaire montre ce que fait ton agent : chaque outil utilisé par Hermes réveille un personnage, dans deux univers au choix, l'**Olympe** (par défaut : Hermès, Héphaïstos à sa forge, la chouette d'Athéna, Mnémosyne, Cerbère) ou la **Clairière** (Kitsune, le castor, la chouette, la taupe, le Shiba). Il fonctionne dans **Hermes Desktop** (Mac, Windows, Linux) et dans le **tableau de bord web**, en français ou en anglais selon la langue de ton système.

```bash
hermes plugins install Med34000/sanctuaire-solaire-hermes/sanctuaire-solaire --enable
```

Redémarre ensuite Hermes. Dans Hermes Desktop, active le plugin dans **Capabilities → Plugins**.

Le Sanctuaire montre aussi **d'où vient le travail** (Discord, Telegram, tâche planifiée). Le **gardien (Cerbère ou le Shiba) aboie** quand Hermes bascule en silence sur un modèle de secours, quand un tour devient trop lourd (plus de 200 000 tokens) ou qu'une autorisation attend. Le bouton **Aujourd'hui** ouvre le journal du jour. Un clic sur un compagnon ouvre sa fiche, des colombes ou des renardeaux apparaissent quand Hermes délègue à des sous-agents, le décor s'assombrit le soir, et des sons discrets sont disponibles (coupés par défaut).

Seuls des **noms, des heures et des compteurs** sont notés, jamais le contenu des conversations. Aucun appel réseau, aucun secret lu.

## License

Code: [Apache 2.0](LICENSE) · Images and characters: [CC BY 4.0](LICENSE-ASSETS) — keep the credit in [NOTICE](NOTICE).

**Created by [Médéric Morin](https://github.com/Med34000)** · [X @Med_34000](https://x.com/Med_34000) · [LinkedIn](https://www.linkedin.com/in/mederic-morin-auto-ia-tech/)

Independent project, not affiliated with Nous Research.

*2026-11-05 ≈12:00, mis à jour ≈13:00 et ≈15:00 (Europe/Zurich) — Claude (Cowork) — Anthropic, Claude Opus 5.5, pour Médéric Morin*
