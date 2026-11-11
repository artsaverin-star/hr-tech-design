#!/bin/bash
# Bulochka · обновление skills и Figma-моста по кнопке «Обновить».
# Подтягивает свежую версию; новая задача помощника подхватит обновлённые умения и runtime.
set -u
DIR="$(cd "$(dirname "$0")/.." && pwd)"
LOG="${BULOCHKA_REPAIR_LOG:-/tmp/bulochka-repair.log}"
{
  FAILED=0
  PACKAGED=0
  echo "=== repair $(date) in $DIR ==="
  cd "$DIR" || exit 1
  if [ -e "$DIR/.bulochka-install.json" ]; then
    . "$DIR/scripts/agent-paths.sh"
    if [ -z "$NODE_BIN" ] || ! "$NODE_BIN" -e '
      try {
        const marker = require("node:fs").readFileSync(process.argv[1], "utf8");
        const parsed = JSON.parse(marker);
        process.exit(parsed.schemaVersion === 1 && ["app", "terminal"].includes(parsed.distribution) ? 0 : 1);
      } catch { process.exit(1); }
    ' "$DIR/.bulochka-install.json"; then
      echo "Повреждена информация об установке Булочки. Откройте установщик заново."
      exit 1
    fi
    PACKAGED=1
    echo "Установка из пакета: проверяем и загружаем обновление."
  fi
  # Явные origin/main — не зависим от upstream-конфига клона (видели
  # «Cannot fast-forward to multiple branches» на машинах дизайнеров).
  # --autostash: у дизайнера почти всегда есть локальная правка team-notes.md, и без него
  # pull молча падает, а кнопка всё равно рапортует успех.
  if [ "$PACKAGED" -eq 1 ]; then
    "$NODE_BIN" "$DIR/scripts/update-package.mjs" 2>&1 || { echo "update-package: ошибка"; FAILED=1; }
  fi
  if [ "$PACKAGED" -eq 0 ]; then
    if ! mkdir "$DIR/.bulochka-update.lock" 2>/dev/null; then
      echo "Обновление уже выполняется"; exit 1
    fi
    trap 'rmdir "$DIR/.bulochka-update.lock" 2>/dev/null || true' EXIT
    git pull --autostash --ff-only origin main 2>&1 || { echo "git pull: ошибка; пробуем восстановить текущую установку"; FAILED=1; }
  fi
  # Перелинковать умения HR Tech помощнику (Codex и/или Claude Code). Заодно чинится
  # случай, когда ссылки указывают на другой клон репозитория.
  bash "$DIR/scripts/link-knowledge.sh" 2>&1 || { echo "link-knowledge: ошибка"; FAILED=1; }
  # Переподключить Figma-мост как MCP-сервер figma-hrtech. Самая частая поломка у дизайнера —
  # помощник не видит мост (секции [mcp_servers.figma-hrtech] нет в конфиге, или в ней путь
  # к другому клону/несуществующему node). Раньше это чинил только setup.sh, то есть терминал;
  # теперь чинит кнопка «Обновить». Отдельным вызовом — чтобы после git pull отработала
  # СВЕЖАЯ версия скрипта, а не та, что была на диске в момент старта repair.sh.
  bash "$DIR/scripts/connect-mcp.sh" 2>&1 || { echo "connect-mcp: ошибка"; FAILED=1; }
  # Пересобрать бандл только если есть тулчейн (у мейнтейнера). Дизайнерам не нужно —
  # готовый runtime/bin/bridge.mjs приходит из git.
  if [ "$PACKAGED" -eq 1 ]; then
    echo "Готовый мост проверен при загрузке обновления."
  elif [ -x node_modules/.bin/esbuild ] && [ -f runtime/build.sh ]; then
    bash runtime/build.sh 2>&1 || { echo "build: ошибка"; FAILED=1; }
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
  if [ "$FAILED" -eq 0 ]; then
    if [ "$PACKAGED" -eq 1 ]; then
      echo "обновление готово; мост подхватит его автоматически между командами"
    else
      echo "обновление готово; мост подхватит его автоматически между командами"
    fi
  else
    echo "обновление завершилось с ошибками; причины указаны выше"
  fi
  echo "=== repair done ==="
  exit "$FAILED"
} >> "$LOG" 2>&1
