#!/bin/bash
# Булочка — подключение HR Tech skills и Figma-моста к вашему помощнику
# (Codex CLI и/или Claude Code — что установлено, к тому и подключаем).
# Запускать один раз: ./setup.sh
set -e
DIR="$(cd "$(dirname "$0")" && pwd)"

echo "── Булочка · настройка ─────────────────────────────────"

# 1. Проверки
if ! command -v node >/dev/null; then
  echo "✗ Нет Node.js. Поставь с https://nodejs.org (LTS) и запусти setup.sh снова."
  exit 1
fi
NODE_BIN="$(command -v node)"
# Помощник может быть любым из поддерживаемых — ищем оба и подключаемся ко всем найденным.
CODEX_BIN="$(command -v codex 2>/dev/null || true)"
if [ -z "$CODEX_BIN" ] && [ -x /Applications/ChatGPT.app/Contents/Resources/codex ]; then
  CODEX_BIN=/Applications/ChatGPT.app/Contents/Resources/codex
fi
CLAUDE_BIN="$(command -v claude 2>/dev/null || true)"
if [ -z "$CODEX_BIN" ] && [ -z "$CLAUDE_BIN" ]; then
  echo "✗ Не нашёл ни одного помощника. Поставь тот, которым пользуешься:"
  echo "  Codex CLI:    curl -fsSL https://chatgpt.com/codex/install.sh | sh"
  echo "  Claude Code:  npm install -g @anthropic-ai/claude-code"
  echo "  Затем запусти его, войди в СВОЙ аккаунт и повтори setup.sh."
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
#    Спрашиваем здесь один раз и сразу открываем страницу создания, чтобы не искать «где это взять».
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

# 4. Подключение Figma-моста к каждому найденному помощнику (user scope).
#    Логика живёт в scripts/connect-mcp.sh — её же зовёт repair.sh по кнопке «Обновить»,
#    чтобы поломка «помощник не видит мост» чинилась без терминала.
if [ -s "$TOKEN_FILE" ]; then
  echo "· Figma-токен найден — комментарии и REST-инструменты включены"
fi
if ! bash "$DIR/scripts/connect-mcp.sh"; then
  echo "✗ Ни одному помощнику мост подключить не удалось. Запусти codex (или claude), войди в аккаунт и повтори setup.sh."
  exit 1
fi
if [ ! -s "$TOKEN_FILE" ]; then
  echo "  (без токена: комментарии и REST выключены — добавить можно в любой момент,"
  echo "   просто запусти ./setup.sh ещё раз)"
fi

# 5. HR Tech skills (обновляются вместе с репозиторием).
bash "$DIR/scripts/link-knowledge.sh"

# 6. Миграция со старой очереди: Булочка ничего не выполняет и не запускает в фоне.
#    Раннера в репозитории больше нет, поэтому plist ОБЯЗАН уехать целиком: иначе launchd
#    при следующей загрузке будет пытаться стартовать удалённый скрипт и спамить в лог.
LEGACY_PLIST="$HOME/Library/LaunchAgents/design.hrtech.bulochka.runner.plist"
LEGACY_LABEL="design.hrtech.bulochka.runner"
if [ -f "$LEGACY_PLIST" ] || pgrep -f hrtech-watch.sh >/dev/null 2>&1; then
  launchctl bootout "gui/$(id -u)/$LEGACY_LABEL" >/dev/null 2>&1 || true
  launchctl unload -w "$LEGACY_PLIST" >/dev/null 2>&1 || true
  rm -f "$LEGACY_PLIST"
  pkill -f hrtech-watch.sh >/dev/null 2>&1 || true
  pkill -f hrtech-driver.mjs >/dev/null 2>&1 || true
  echo "· Старый фоновый диспетчер удалён — работа идёт у вашего помощника"
fi

echo ""
echo "✓ Готово. Остался ОДИН ручной шаг в Figma (один раз):"
echo "    Меню → Plugins → Development → Import plugin from manifest…"
echo "    → $DIR/figma-desktop-bridge/manifest.json"
echo ""
echo "Каждый день: открой файл и Булочку в Figma, затем поставь задачу своему помощнику."
echo "Помощник сам подберёт нужное умение; Булочка даст ему контекст файла."
