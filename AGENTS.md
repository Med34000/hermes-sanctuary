# Instructions for AI agents (Hermes Agent & others)

*2026-11-04 ≈18:55 (Europe/Zurich) — Claude (Cowork) — Anthropic, Claude Opus 5.5, for Médéric Morin*

You were asked to **install the Sanctuaire Solaire** on the server you run on. Follow these steps in order. Talk to your human in their language.

## Golden rules
1. **Never change anything before your human approved the plan** from the dry run.
2. **Never print, log or send** the content of `.env`, any API key, or `/etc/sanctuaire/api.key`.
3. Do not open firewall ports. Everything stays on 127.0.0.1.
4. If a command needs `sudo` and you cannot run it, **give the exact command to your human** and wait.

## Steps
1. **Get the code** (outside any home folder, so the web service can read it):
   ```bash
   sudo git clone https://github.com/Med34000/sanctuaire-solaire-hermes /opt/sanctuaire
   ```
   If it already exists: `git -C /opt/sanctuaire pull`.
2. **Dry run**: `cd /opt/sanctuaire && ./install.sh --dry-run`
   Summarize the plan for your human in a few lines: what it creates, what it modifies (`.env`, maybe `config.yaml`, both with backups), and that Hermes will be restarted (messaging down for about 10 s).
3. **Wait for an explicit "yes".**
4. **Install** in non-interactive mode, restarting Hermes **30 s later** so you can finish your reply:
   ```bash
   sudo ./install.sh --yes --restart later
   ```
   If your Hermes data folder is not detected: add `--hermes-home /path/to/folder-with-config.yaml`.
5. **After the restart**, check (read-only):
   ```bash
   curl -s -o /dev/null -w '%{http_code}\n' http://127.0.0.1:8787/panorama.html            # 200
   curl -s -o /dev/null -w '%{http_code}\n' -H 'X-Sanctuaire: 1' http://127.0.0.1:8787/chat/sessions   # 200
   ```
6. **Tell your human how to open it** from their computer:
   `ssh -N -L 8787:127.0.0.1:8787 <user>@<server>` then **http://localhost:8787/panorama.html**

## If something fails
- `install.sh` stops with a clear message. Report it to your human and do not improvise system changes.
- Web service logs: `journalctl -u sanctuaire-web -n 30`.
- Uninstall: `sudo ./install.sh --uninstall`.
- Docker or non-systemd setups are not supported by the installer yet. Point your human to `INSTALL.md` → *Manual install*.
