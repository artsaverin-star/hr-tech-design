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

# 3. Личный Figma-токен (опционально) — комментарии, скрины через API, поиск по библиотеке.
#    Токен ОБЯЗАН быть личным: каждый дизайнер работает в своих файлах, чужой аккаунт их не увидит.
#    Поле ввода в виджете убрано (2.1) — в окне 150 px в него было не попасть; спрашиваем здесь,
#    один раз, и сразу открываем страницу создания, чтобы не искать «где это взять».
TOKEN_FILE="$HOME/.hrtech/figma-token"
TOKEN_URL="https://www.figma.com/developers/api#access-tokens"

if [ ! -s "$TOKEN_FILE" ] && [ -t 0 ]; then
  echo ""
  echo "· Figma-токен (по желанию). С ним Булочка читает комментарии в макетах,"
  echo "  делает скрины через API и ищет по опубликованной библиотеке. Без него"
  echo "  всё остальное работает как обычно."
  printf "  Открыть страницу создания токена? [Enter — да, n — пропустить] "
  read -r ANSWER </dev/tty || ANSWER="n"
  if [ "$ANSWER" != "n" ] && [ "$ANSWER" != "N" ]; then
    echo "  Settings → Security → Personal access tokens → Generate new token."
    echo "  Скоупы: File content — Read; Comments — Write; File metadata, File versions — Read;"
    echo "  Library assets, Team library content — Read. Токен показывается ОДИН раз."
    if command -v open >/dev/null; then open "$TOKEN_URL" >/dev/null 2>&1 || true
    else echo "  Открой вручную: $TOKEN_URL"; fi
    printf "  Вставь токен (figd_…) и нажми Enter, либо просто Enter чтобы пропустить: "
    read -r NEW_TOKEN </dev/tty || NEW_TOKEN=""
    NEW_TOKEN="$(printf '%s' "$NEW_TOKEN" | tr -d '[:space:]')"
    if [ -n "$NEW_TOKEN" ]; then
      case "$NEW_TOKEN" in
        fig*)
          mkdir -p "$(dirname "$TOKEN_FILE")"
          printf '%s' "$NEW_TOKEN" > "$TOKEN_FILE"
          chmod 600 "$TOKEN_FILE"
          echo "  ✓ Сохранил в $TOKEN_FILE (только для тебя, никуда не уходит)" ;;
        *)
          echo "  ✗ Не похоже на токен — он начинается с figd_. Пропускаю, запусти setup.sh позже." ;;
      esac
    fi
  fi
  echo ""
fi

# 4. Подключение MCP к Claude Code (user scope — работает из любой папки)
ENV_ARGS=()
if [ -s "$TOKEN_FILE" ]; then
  ENV_ARGS=(--env "FIGMA_ACCESS_TOKEN=$(tr -d '[:space:]' < "$TOKEN_FILE")")
  echo "· Figma-токен найден — комментарии и REST-инструменты включены"
fi
claude mcp remove figma-hrtech -s user >/dev/null 2>&1 || true
claude mcp add figma-hrtech -s user "${ENV_ARGS[@]}" -- node "$SERVER" >/dev/null
echo "· Мост figma-hrtech подключён к Claude Code"
if [ ! -s "$TOKEN_FILE" ]; then
  echo "  (без токена: комментарии и REST выключены — добавить можно в любой момент,"
  echo "   просто запусти ./setup.sh ещё раз)"
fi

# 5. Слэш-команда /hrtech + база знаний (симлинк на репо — обновляются git pull)
mkdir -p ~/.claude/commands
ln -sf "$DIR/claude/commands/hrtech.md" ~/.claude/commands/hrtech.md
ln -sf "$DIR/claude/commands/hrtech-digest.md" ~/.claude/commands/hrtech-digest.md
ln -sf "$DIR/claude/commands/hrds-knowledge.md" ~/.claude/commands/hrds-knowledge.md
ln -sf "$DIR/claude/knowledge/team-notes.md" ~/.claude/commands/team-notes.md
echo "· Команды /hrtech, /hrtech-digest и база знаний подключены"

# Скилы — подгружаются САМИ, когда задача совпала с описанием (спека, мобилка, аудит ДС).
# Линкуем каждую папку из репо, чтобы новые скилы подхватывались без правки setup.sh.
mkdir -p ~/.claude/skills
SKILL_N=0
for SKILL_DIR in "$DIR"/claude/skills/*/; do
  [ -f "$SKILL_DIR/SKILL.md" ] || continue
  ln -sfn "${SKILL_DIR%/}" "$HOME/.claude/skills/$(basename "$SKILL_DIR")"
  SKILL_N=$((SKILL_N + 1))
done
[ "$SKILL_N" -gt 0 ] && echo "· Скилов подключено: $SKILL_N (подхватываются автоматически по смыслу задачи)"

# 6. Автозапуск фонового помощника при входе в систему — чтобы задачи выполнялись САМИ,
#    без терминала. Помощник поднимает мост; плагин к нему цепляется.
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
  echo "· Фоновый помощник добавлен в автозапуск — задачи выполняются без терминала"
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
