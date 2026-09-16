#!/bin/bash
# Bulochka · обновление skills и Figma-моста по кнопке «Обновить».
# Подтягивает свежую версию; новая задача помощника подхватит обновлённые умения и runtime.
set -u
DIR="$(cd "$(dirname "$0")/.." && pwd)"
LOG=/tmp/bulochka-repair.log
{
  echo "=== repair $(date) in $DIR ==="
  cd "$DIR" || exit 1
  # Явные origin/main — не зависим от upstream-конфига клона (видели
  # «Cannot fast-forward to multiple branches» на машинах дизайнеров).
  # --autostash: у дизайнера почти всегда есть локальная правка team-notes.md, и без него
  # pull молча падает, а кнопка всё равно рапортует успех.
  git pull --autostash --ff-only origin main 2>&1 || echo "git pull: пропущено/ошибка"
  # Перелинковать умения HR Tech помощнику (Codex и/или Claude Code). Заодно чинится
  # случай, когда ссылки указывают на другой клон репозитория.
  bash "$DIR/scripts/link-knowledge.sh" 2>&1 || echo "link-knowledge: ошибка"
  # Переподключить Figma-мост как MCP-сервер figma-hrtech. Самая частая поломка у дизайнера —
  # помощник не видит мост (секции [mcp_servers.figma-hrtech] нет в конфиге, или в ней путь
  # к другому клону/несуществующему node). Раньше это чинил только setup.sh, то есть терминал;
  # теперь чинит кнопка «Обновить». Отдельным вызовом — чтобы после git pull отработала
  # СВЕЖАЯ версия скрипта, а не та, что была на диске в момент старта repair.sh.
  bash "$DIR/scripts/connect-mcp.sh" 2>&1 || echo "connect-mcp: ошибка"
  # Пересобрать бандл только если есть тулчейн (у мейнтейнера). Дизайнерам не нужно —
  # готовый runtime/bin/bridge.mjs приходит из git.
  if [ -x node_modules/.bin/esbuild ] && [ -f runtime/build.sh ]; then
    bash runtime/build.sh 2>&1 || echo "build: ошибка"
  else
    echo "build: пропущено (бандл из git)"
  fi
  # Старый queue-runner удалён из продукта, а plist со старой установки продолжает
  # указывать на несуществующий скрипт. Кнопка «Обновить» — единственный путь, по которому
  # эта миграция доедет до дизайнера, поэтому сносим plist и живые процессы целиком.
  LEGACY_PLIST="$HOME/Library/LaunchAgents/design.hrtech.bulochka.runner.plist"
  LEGACY_LABEL="design.hrtech.bulochka.runner"
  if [ -f "$LEGACY_PLIST" ] || pgrep -f hrtech-watch.sh >/dev/null 2>&1; then
    launchctl bootout "gui/$(id -u)/$LEGACY_LABEL" 2>/dev/null || true
    launchctl unload -w "$LEGACY_PLIST" 2>/dev/null || true
    rm -f "$LEGACY_PLIST"
    pkill -f hrtech-watch.sh 2>/dev/null || true
    pkill -f hrtech-driver.mjs 2>/dev/null || true
    echo "старый фоновый диспетчер удалён"
  fi
  echo "обновление готово; умения применятся в новой задаче помощника"
  echo "=== repair done ==="
} >> "$LOG" 2>&1
