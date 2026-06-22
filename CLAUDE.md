# HR TECH DESIGN — bridge plugin & knowledge base

This repo is BOTH the Figma↔Claude bridge plugin AND the single source of truth for the HRDS
conversion knowledge base. Open a terminal session **in this folder** to converse with the full
knowledge base always in context. Designers use the plugin's buttons for routine work (no terminal).

## Knowledge base (always in context here)

The full HRDS component/pattern reference is the authoritative spec:

@claude/commands/hrds-knowledge.md

Shared team knowledge (verified recipes, component keys, fixes contributed by designers via the
plugin's **«Поделиться знанием»** button) lives here and is also always in context:

@claude/knowledge/team-notes.md

The task playbook (zone-graph algorithm, blueprints, no-fabrication rule, status protocol) lives in
`claude/commands/hrtech.md` — it is the body of the `/hrtech` slash command. Edit THESE two files to
teach the system; everything else (the user-scope `/hrtech`, headless runs) reads from them via symlink.

## How the system works

- **Plugin** (`figma-desktop-bridge/`): runs in desktop Figma, talks to the bridge over WebSocket
  (ports 9223–9232). Buttons queue tasks into `figma.root` shared plugin data; the live widget shows
  account, usage limits, model picker, progress, queue and Stop/Clear.
- **Bridge server** (`dist/local.js`, MCP `figma-hrtech`): executes `figma_execute` (arbitrary Plugin
  API JS) in desktop Figma where YS Text loads — no cloud font wall.
- **Auto-runner** (`scripts/hrtech-watch.sh`): polls the queue, runs `claude -p "/hrtech"` per task,
  model = the plugin's picker (Auto → Haiku for spelling, Sonnet for conversions). Hard Stop kills the run.

## Editing rules to teach the system

1. Edit `claude/commands/hrtech.md` (task rules) or `claude/commands/hrds-knowledge.md` (component/pattern reference).
2. Bump the version in `figma-desktop-bridge/code.js` (`hrtechVersion`) and `figma-desktop-bridge/ui.html` (`hrtech-ver`).
3. The user-scope `/hrtech` is a symlink to the repo file — no copy step needed.
4. When the user approves a new screen type, distill it into a numeric BLUEPRINT in the rules (components by
   library key + spacing + order). Do NOT save references to canvas nodes — the system must stay file-independent.

## Build (only when changing the bridge server source)

```bash
npm run build:local    # tsc → dist/local.js ; not needed for plugin UI or rules edits
```

## Distribution

`setup.sh` installs for a designer (checks node/claude, builds dist, `claude mcp add` user-scope, symlinks
commands). Plugin import: Figma → Plugins → Development → Import from `figma-desktop-bridge/manifest.json`.
See `ONBOARDING.md` (designers) and `HRDS-CONTRIBUTION.md` (how to extend HRDS itself).
