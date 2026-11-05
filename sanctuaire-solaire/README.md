# ☀️ Le Sanctuaire Solaire · The Solar Sanctuary — Hermes plugin

**A living, playful view of your agent.** Five animated companions wake up when Hermes uses their tools: the owl flies off to search the web, the beaver forges code, the mole digs through files and memory, the Shiba barks at errors and guards approvals, and Kitsune throws paper planes to hand out the work.

Works in **Hermes Desktop** (macOS, Windows, Linux) and in the **web dashboard**. English or French, from your system language.

![The Solar Sanctuary](https://raw.githubusercontent.com/Med34000/sanctuaire-solaire-hermes/main/docs/panorama.jpg)

## Install

```bash
hermes plugins install Med34000/sanctuaire-solaire-hermes/sanctuaire-solaire --enable
```

Then restart Hermes (gateway / dashboard) so the hooks and routes load.

- **Hermes Desktop**: open **Capabilities → Plugins**, turn on **Le Sanctuaire Solaire**. A pane appears under the conversation, and a **Sanctuaire** page in the sidebar.
- **Web dashboard**: a **Sanctuaire** tab, and a foldable strip above the **Chat** tab.

You chat with Hermes as usual; the Sanctuary shows what it is doing, including background work (crons, Discord, other chats).

## What it records — privacy

- **Only tool names and times**, turn start/end times, and counters of tool errors, API errors and approvals.
- **Never** messages, replies, tool arguments, results, error texts, file paths or ids.
- Stored in `<hermes home>/plugin-data/sanctuaire-solaire/proc/` (one small JSON file per Hermes process; files older than 2 days are removed).

## Disclosure

- Hooks: `pre_tool_call`, `post_tool_call`, `pre_llm_call`, `post_llm_call`, `on_session_end`, `api_request_error`, `pre_approval_request`, `post_approval_response`. All are observers: they never block, change or approve anything.
- Backend routes (`/api/plugins/sanctuaire-solaire/`): read-only — the merged activity, the theme, the page and its images, all from the plugin's own folders.
- No network calls, no secrets, no `.env` access, no background process, no telemetry.
- The panorama runs in a sandboxed frame that receives everything by `postMessage` and makes no request of its own.

## Make your own world

The engine and the look are separate: one environment = one `dashboard/app/themes/<id>/` folder (background, characters, positions, animations, texts). See [docs/ARCHITECTURE.md](https://github.com/Med34000/sanctuaire-solaire-hermes/blob/main/docs/ARCHITECTURE.md). Ideas and new worlds are welcome in the [Discussions](https://github.com/Med34000/sanctuaire-solaire-hermes/discussions).

## 🇫🇷 En bref

Le Sanctuaire Solaire montre ce que fait ton agent : chaque outil utilisé par Hermes réveille un compagnon. Il fonctionne dans **Hermes Desktop** (Mac, Windows, Linux) et dans le **tableau de bord web**, en français ou en anglais selon la langue de ton système.

```bash
hermes plugins install Med34000/sanctuaire-solaire-hermes/sanctuaire-solaire --enable
```

Redémarre ensuite Hermes. Dans Hermes Desktop, active le plugin dans **Capabilities → Plugins**.

Seuls des **noms d'outils et des heures** sont notés, jamais le contenu des conversations. Aucun appel réseau, aucun secret lu.

## License

Code: [Apache 2.0](LICENSE) · Images and characters: [CC BY 4.0](LICENSE-ASSETS) — keep the credit in [NOTICE](NOTICE).

**Created by [Médéric Morin](https://github.com/Med34000)** · [X @Med_34000](https://x.com/Med_34000) · [LinkedIn](https://www.linkedin.com/in/mederic-morin-auto-ia-tech/)

Independent project, not affiliated with Nous Research.

*2026-11-05 ≈12:00 (Europe/Zurich) — Claude (Cowork) — Anthropic, Claude Opus 5.5, pour Médéric Morin*
