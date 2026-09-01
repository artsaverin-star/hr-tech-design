#!/bin/bash
# Bulochka · самолечение движка — вызывается сервером моста по кнопке «Починить».
# Подтягивает свежую версию (git pull → новый бандл+скрипты) и перезапускает помощника,
# который поднимает мост заново. Дизайнеру ничего в терминале делать не нужно.
set -u
DIR="$(cd "$(dirname "$0")/.." && pwd)"
LOG=/tmp/bulochka-repair.log
{
  echo "=== repair $(date) in $DIR ==="
  cd "$DIR" || exit 1
  # Явные origin/main — не зависим от upstream-конфига клона (видели
  # «Cannot fast-forward to multiple branches» на машинах дизайнеров).
  git pull --ff-only origin main 2>&1 || echo "git pull: пропущено/ошибка"
  # Перелинковать знания: команды, базу и СКИЛЫ. Без этого новый скил или новая
  # команда, приехавшие с git pull, до Claude Code не доедут — он читает только
  # ~/.claude, а симлинка на новую папку там нет. Заодно чинится случай, когда
  # ссылки указывают на другой клон репозитория.
  bash "$DIR/scripts/link-knowledge.sh" 2>&1 || echo "link-knowledge: ошибка"
  # Пересобрать бандл только если есть тулчейн (у мейнтейнера). Дизайнерам не нужно —
  # готовый runtime/bin/bridge.mjs приходит из git.
  if [ -x node_modules/.bin/esbuild ] && [ -f runtime/build.sh ]; then
    bash runtime/build.sh 2>&1 || echo "build: ошибка"
  else
    echo "build: пропущено (бандл из git)"
  fi
  # (Пере)запустить помощника — он поднимет свежий мост.
  PLIST="$HOME/Library/LaunchAgents/design.hrtech.bulochka.runner.plist"
  if [ -f "$PLIST" ]; then
    launchctl unload "$PLIST" 2>/dev/null || true
    launchctl load "$PLIST" 2>/dev/null && echo "помощник перезапущен (launchd)"
  else
    pkill -f "scripts/hrtech-watch.sh" 2>/dev/null || true
    nohup bash "$DIR/scripts/hrtech-watch.sh" >/tmp/hrtech-runner.log 2>&1 &
    echo "помощник запущен напрямую"
  fi
  echo "=== repair done ==="
} >> "$LOG" 2>&1
