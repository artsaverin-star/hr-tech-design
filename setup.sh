#!/bin/bash
# Булочка — подключение HR Tech skills и Figma-моста к вашему помощнику
# (Codex CLI и/или Claude Code — что установлено, к тому и подключаем).
# Запускать один раз: ./setup.sh
set -e
DIR="$(cd "$(dirname "$0")" && pwd)"

echo "Булочка · настройка"

# 1. Проверки
echo "[1/3] Проверяем компьютер"
. "$DIR/scripts/agent-paths.sh"
if [ -z "$NODE_BIN" ]; then
  echo "✗ Нет Node.js. Поставь с https://nodejs.org (LTS) и запусти setup.sh снова."
  exit 1
fi
if ! bulochka_node_supported "$NODE_BIN"; then
  echo "✗ Нужен Node.js 20.19+, 22.13+ или 24+. Обнови Node.js или повтори установочную команду Булочки."
  exit 1
fi
# Помощник может быть любым из поддерживаемых — ищем оба и подключаемся ко всем найденным.
if [ -z "$CODEX_BIN" ] && [ -z "$CLAUDE_BIN" ] && [ -z "${CLAUDE_DESKTOP_APP:-}" ]; then
  echo "✗ Не нашёл ни одного помощника. Поставь тот, которым пользуешься:"
  echo "  Codex CLI:    curl -fsSL https://chatgpt.com/codex/install.sh | sh"
  echo "  Claude Code:  npm install -g @anthropic-ai/claude-code"
  echo "  После установки повтори setup.sh."
  exit 1
fi

# Готовый бандл у дизайнеров; dist/local.js допускается при локальной разработке.
SERVER="$DIR/runtime/bin/bridge.mjs"
[ -f "$SERVER" ] || SERVER="$DIR/dist/local.js"
if [ ! -f "$SERVER" ]; then
  echo "✗ В проекте нет готового моста. Повтори установочную команду Булочки, чтобы скачать полный пакет."
  exit 1
fi

# 2. Настройка MCP. Существующий токен учитывает connect-mcp; новый добавляется позже в Figma.
echo "[2/3] Настраиваем помощника"
if ! bash "$DIR/scripts/connect-mcp.sh"; then
  echo "✗ Настройка завершилась с ошибкой. Причина указана выше; после её исправления запусти setup.sh снова."
  exit 1
fi

# 3. Умения HR Tech.
echo "[3/3] Добавляем умения HR Tech"
if ! bash "$DIR/scripts/link-knowledge.sh"; then
  echo "✗ Не удалось настроить все умения. Причина указана выше; существующие файлы сохранены."
  exit 1
fi

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

if [ -s "$HOME/.hrtech/figma-token" ]; then
  echo "Существующий Figma-токен учтён. Его доступ будет проверяться при работе с Figma API."
else
  echo "Figma-токен можно добавить позже в Настройках Булочки — для начала он не нужен."
fi
if [ "${BULOCHKA_INSTALLER:-0}" != "1" ]; then
  bash "$DIR/scripts/install-next-steps.sh"
fi
