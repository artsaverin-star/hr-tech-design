#!/bin/bash
# HR TECH DESIGN — подключение моста к Claude Code. Запускать один раз: ./setup.sh
set -e
DIR="$(cd "$(dirname "$0")" && pwd)"

echo "── HR TECH DESIGN · установка ──────────────────────────"

# 1. Проверки
if ! command -v node >/dev/null; then
  echo "✗ Нет Node.js. Поставь с https://nodejs.org (LTS) и запусти setup.sh снова."
  exit 1
fi
if ! command -v claude >/dev/null; then
  echo "✗ Нет Claude Code. Установи:  npm install -g @anthropic-ai/claude-code"
  echo "  Потом запусти  claude  и войди в СВОЙ аккаунт. Затем setup.sh снова."
  exit 1
fi

# 2. Сервер моста: используем готовый бандл (без сборки и npm install).
#    Фолбэк: если бандла нет (старый клон) — собираем по-старому.
SERVER="$DIR/runtime/bin/bridge.mjs"
if [ ! -f "$SERVER" ]; then
  echo "· Готовый сервер не найден — собираю (нужен один раз, ~1 мин)…"
  (cd "$DIR" && npm install --no-audit --no-fund >/dev/null && npm run build:local >/dev/null)
  SERVER="$DIR/dist/local.js"
fi

# 3. Подключение MCP к Claude Code (user scope — работает из любой папки)
claude mcp remove figma-hrtech -s user >/dev/null 2>&1 || true
claude mcp add figma-hrtech -s user -- node "$SERVER" >/dev/null
echo "· Мост figma-hrtech подключён к Claude Code"

# 4. Слэш-команда /hrtech + база знаний (симлинк на репо — обновляются git pull)
mkdir -p ~/.claude/commands
ln -sf "$DIR/claude/commands/hrtech.md" ~/.claude/commands/hrtech.md
ln -sf "$DIR/claude/commands/hrtech-digest.md" ~/.claude/commands/hrtech-digest.md
ln -sf "$DIR/claude/commands/hrds-knowledge.md" ~/.claude/commands/hrds-knowledge.md
ln -sf "$DIR/claude/knowledge/team-notes.md" ~/.claude/commands/team-notes.md
echo "· Команды /hrtech, /hrtech-digest и база знаний подключены"

# 5. Автозапуск фонового помощника при входе в систему — чтобы задачи и синхронизация
#    базы знаний работали САМИ, без терминала. Помощник поднимает мост; плагин к нему цепляется.
#    (Опрос очереди бесплатный — токены тратятся только на реальные задачи.)
PLIST="$HOME/Library/LaunchAgents/design.hrtech.bulochka.runner.plist"
mkdir -p "$HOME/Library/LaunchAgents"
# Папки node и claude — чтобы фоновый демон их ВИДЕЛ. LaunchAgent стартует с
# урезанным PATH, а node часто стоит в nvm/fnm/volta/asdf/~/.local/bin (не в
# /opt/homebrew/bin). Здесь node/claude уже резолвятся (проверки выше прошли) —
# кладём их реальные папки в начало PATH плиста.
NODE_DIR="$(cd "$(dirname "$(command -v node)")" 2>/dev/null && pwd)"
CLAUDE_DIR="$(cd "$(dirname "$(command -v claude)")" 2>/dev/null && pwd)"
AGENT_PATH="/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin"
[ -n "$CLAUDE_DIR" ] && [ "$CLAUDE_DIR" != "$NODE_DIR" ] && AGENT_PATH="$CLAUDE_DIR:$AGENT_PATH"
[ -n "$NODE_DIR" ] && AGENT_PATH="$NODE_DIR:$AGENT_PATH"
cat > "$PLIST" <<PL
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
  <key>Label</key><string>design.hrtech.bulochka.runner</string>
  <key>ProgramArguments</key><array>
    <string>/bin/bash</string><string>$DIR/scripts/hrtech-watch.sh</string>
  </array>
  <key>RunAtLoad</key><true/>
  <key>KeepAlive</key><true/>
  <key>ThrottleInterval</key><integer>20</integer>
  <key>WorkingDirectory</key><string>$DIR</string>
  <key>StandardOutPath</key><string>/tmp/hrtech-runner.log</string>
  <key>StandardErrorPath</key><string>/tmp/hrtech-runner.log</string>
  <key>EnvironmentVariables</key><dict>
    <key>PATH</key><string>$AGENT_PATH</string>
  </dict>
</dict></plist>
PL
launchctl unload "$PLIST" >/dev/null 2>&1 || true
if launchctl load "$PLIST" >/dev/null 2>&1; then
  echo "· Фоновый помощник добавлен в автозапуск — задачи и синк работают без терминала"
else
  echo "· Автозапуск не включился — можно запускать вручную:  ./scripts/hrtech-watch.sh"
fi

echo ""
echo "✓ Готово. Остался ОДИН ручной шаг в Figma (один раз):"
echo "    Меню → Plugins → Development → Import plugin from manifest…"
echo "    → $DIR/figma-desktop-bridge/manifest.json"
echo ""
echo "Каждый день: просто открой файл в Figma и запусти плагин HR TECH DESIGN."
echo "Всё остальное — само: помощник уже в фоне, виджет подключается автоматически."
