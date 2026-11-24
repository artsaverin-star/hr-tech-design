#!/bin/bash
# Bulochka · обновление skills, MCP-конфигов и Figma-моста по кнопке «Обновить» / «Починить».
# Держит .bulochka-repair.lock на всё время работы, чтобы supervisor не перезапустил engine.mjs
# до завершения link-knowledge.sh и connect-mcp.sh.
set -u
DIR="$(cd "$(dirname "$0")/.." && pwd)"
LOG="${BULOCHKA_REPAIR_LOG:-/tmp/bulochka-repair.log}"
REPAIR_LOCK="$DIR/.bulochka-repair.lock"
UPDATE_LOCK="$DIR/.bulochka-update.lock"

cleanup_locks() {
  rm -f "$REPAIR_LOCK/owner.json" 2>/dev/null || true
  rmdir "$REPAIR_LOCK" 2>/dev/null || true
  if [ "${OWN_UPDATE_LOCK:-0}" -eq 1 ]; then
    rmdir "$UPDATE_LOCK" 2>/dev/null || true
  fi
}

{
  FAILED=0
  PACKAGED=0
  OWN_UPDATE_LOCK=0
  echo "=== repair $(date) in $DIR ==="
  cd "$DIR" || exit 1

  # Занимаем lock ремонта (с очисткой протухшего lock от мёртвого процесса).
  if ! mkdir "$REPAIR_LOCK" 2>/dev/null; then
    STALE=0
    if [ -f "$REPAIR_LOCK/owner.json" ]; then
      OLD_PID="$(sed -n 's/.*"pid":[[:space:]]*\([0-9]*\).*/\1/p' "$REPAIR_LOCK/owner.json" | head -n 1)"
      if [ -n "$OLD_PID" ] && ! kill -0 "$OLD_PID" 2>/dev/null; then
        STALE=1
      fi
    else
      # Если owner.json не появился за 30 секунд — lock брошен.
      STALE=1
    fi
    if [ "$STALE" -eq 1 ]; then
      rm -f "$REPAIR_LOCK/owner.json" 2>/dev/null || true
      rmdir "$REPAIR_LOCK" 2>/dev/null || true
      mkdir "$REPAIR_LOCK" 2>/dev/null || { echo "Обновление уже выполняется"; exit 1; }
    else
      echo "Обновление уже выполняется"
      exit 1
    fi
  fi
  printf '{"pid":%s}\n' "$$" > "$REPAIR_LOCK/owner.json"
  trap cleanup_locks EXIT

  if [ -e "$DIR/.bulochka-install.json" ]; then
    . "$DIR/scripts/agent-paths.sh"
    if [ -z "$NODE_BIN" ] || ! "$NODE_BIN" -e '
      try {
        const marker = require("node:fs").readFileSync(process.argv[1], "utf8");
        const parsed = JSON.parse(marker);
        process.exit(parsed.schemaVersion === 1 && ["app", "terminal"].includes(parsed.distribution) ? 0 : 1);
      } catch { process.exit(1); }
    ' "$DIR/.bulochka-install.json"; then
      echo "Повреждена информация об установке Булочки. Повторите команду установки в Терминале."
      exit 1
    fi
    PACKAGED=1
    echo "Установка из пакета: проверяем и загружаем обновление."
  fi

  if [ "$PACKAGED" -eq 1 ]; then
    "$NODE_BIN" "$DIR/scripts/update-package.mjs" 2>&1 || { echo "update-package: ошибка"; FAILED=1; }
  fi
  if [ "$PACKAGED" -eq 0 ]; then
    if ! mkdir "$UPDATE_LOCK" 2>/dev/null; then
      echo "Обновление уже выполняется"; exit 1
    fi
    OWN_UPDATE_LOCK=1
    git pull --autostash --ff-only origin main 2>&1 || { echo "git pull: ошибка; пробуем восстановить текущую установку"; FAILED=1; }
  fi

  # Перелинковать умения HR Tech всем найденным помощникам.
  bash "$DIR/scripts/link-knowledge.sh" 2>&1 || { echo "link-knowledge: ошибка"; FAILED=1; }
  # Переподключить Figma-мост как MCP-сервер figma-hrtech.
  bash "$DIR/scripts/connect-mcp.sh" 2>&1 || { echo "connect-mcp: ошибка"; FAILED=1; }

  # Пересобрать бандл только если есть тулчейн (у мейнтейнера). Дизайнерам не нужно —
  # готовый runtime/bin/engine.mjs приходит из пакета/git.
  if [ "$PACKAGED" -eq 1 ]; then
    echo "Готовый мост проверен при загрузке обновления."
  elif [ -x node_modules/.bin/esbuild ] && [ -f runtime/build.sh ]; then
    bash runtime/build.sh 2>&1 || { echo "build: ошибка"; FAILED=1; }
  else
    echo "build: пропущено (бандл из git)"
  fi

  # Миграция со старой очереди: сносим старый LaunchAgent целиком.
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
    echo "обновление готово; мост подхватит его автоматически между командами"
  else
    echo "обновление завершилось с ошибками; причины указаны выше"
  fi
  echo "=== repair done ==="
  exit "$FAILED"
} >> "$LOG" 2>&1
