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
ln -sf "$DIR/claude/commands/hrds-knowledge.md" ~/.claude/commands/hrds-knowledge.md
ln -sf "$DIR/claude/knowledge/team-notes.md" ~/.claude/commands/team-notes.md
echo "· Команда /hrtech и база знаний подключены"

# 5. Доступ к общей базе знаний (нужен только для кнопки «Поделиться знанием» — push в общий репо)
if command -v gh >/dev/null; then
  if gh auth status >/dev/null 2>&1; then
    echo "· GitHub-доступ есть — кнопка «Поделиться знанием» будет работать"
  else
    echo "· Чтобы ДЕЛИТЬСЯ знаниями, один раз выполни:  gh auth login  (чтение/Обновить — без этого)"
  fi
else
  echo "· Для кнопки «Поделиться знанием» нужен доступ на запись: поставь GitHub CLI"
  echo "    (brew install gh) и выполни  gh auth login  — один раз. Для чтения не нужно."
fi

echo ""
echo "✓ Готово. Остался ОДИН ручной шаг в Figma (один раз):"
echo "    Меню → Plugins → Development → Import plugin from manifest…"
echo "    → $DIR/figma-desktop-bridge/manifest.json"
echo ""
echo "Каждый день: открой файл в Figma → запусти плагин HR TECH DESIGN →"
echo "в терминале  claude  → нажми Activate Bridge → пиши задачи."
