#!/bin/bash
# HR TECH DESIGN · синхронизация общей базы знаний (для кнопок плагина).
#   knowledge-sync.sh pull                  — подтянуть последнюю версию (git pull --ff-only)
#   knowledge-sync.sh share <author> <file> — дописать заметку из <file> в общую базу, закоммитить и запушить в main
# Текст заметки передаётся ФАЙЛОМ (а не аргументом), чтобы не экранировать произвольный ввод.
# Печатает одну строку: OK: ... | ERR: ...  — её читает авто-раннер и показывает в плагине.
set -u
DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$DIR" || { echo "ERR: нет каталога репо"; exit 1; }
KB="claude/knowledge/team-notes.md"
BRANCH="$(git rev-parse --abbrev-ref HEAD 2>/dev/null || echo main)"

case "${1:-}" in
  pull)
    OUT=$(git pull --ff-only origin "$BRANCH" 2>&1) \
      && echo "OK: база знаний обновлена ($(echo "$OUT" | tail -1))" \
      || echo "ERR: не удалось обновить — $(echo "$OUT" | tail -1)"
    ;;

  share)
    AUTHOR="${2:-designer}"
    FILE="${3:-}"
    [ -f "$FILE" ] || { echo "ERR: нет файла заметки"; exit 1; }
    [ -s "$FILE" ] || { echo "ERR: пустая заметка"; exit 1; }
    mkdir -p "$(dirname "$KB")"
    [ -f "$KB" ] || printf '# База знаний команды\n\n---\n' > "$KB"
    # синхронизируемся перед добавлением, чтобы свести конфликты к минимуму
    git pull --ff-only origin "$BRANCH" >/dev/null 2>&1 || true
    {
      printf '\n## %s — %s\n\n' "$AUTHOR" "$(date '+%Y-%m-%d %H:%M')"
      cat "$FILE"
      printf '\n'
    } >> "$KB"
    git add "$KB" >/dev/null 2>&1
    git -c user.name="${GIT_AUTHOR_NAME:-$AUTHOR}" -c user.email="${GIT_AUTHOR_EMAIL:-design@hrtech.local}" \
        commit -m "knowledge: заметка от $AUTHOR" >/dev/null 2>&1 \
      || { echo "ERR: нечего коммитить"; exit 1; }
    OUT=$(git push origin "$BRANCH" 2>&1) \
      && echo "OK: знание сохранено и отправлено команде" \
      || echo "ERR: коммит сделан, но push не прошёл (нет доступа?) — $(echo "$OUT" | tail -1)"
    ;;

  *)
    echo "ERR: использование: knowledge-sync.sh pull | share <author> <file>"
    exit 1
    ;;
esac
