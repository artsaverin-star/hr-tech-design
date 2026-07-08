#!/bin/bash
# HR TECH DESIGN / Bulochka · синхронизация общей базы знаний через релей (Яндекс Облако).
#   knowledge-sync.sh pull | sync            — забрать общую базу в локальный team-notes.md (GET)
#   knowledge-sync.sh share <author> <file>  — дописать заметку из <file> в общую базу (POST)
# Без git и без регистрации: клиент ходит по HTTP на один URL. Запись прикрыта секретом.
# Печатает одну строку: OK: ... | ERR: ...  — её читает авто-раннер и показывает в плагине.
set -u
DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$DIR" || { echo "ERR: нет каталога репо"; exit 1; }
KB="claude/knowledge/team-notes.md"

# URL релея. Запись открыта (без секрета) — ради удобства; база внутренняя, мусор чистится пере-засевом.
RELAY_URL="${BULOCHKA_RELAY_URL:-https://d5daab1smfcq6f70h8o2.xxg4zr82.apigw.yandexcloud.net/knowledge}"

pull_from_relay() {
  mkdir -p "$(dirname "$KB")"
  local tmp; tmp=$(mktemp)
  if curl -fsS --max-time 20 "$RELAY_URL" -o "$tmp" && [ -s "$tmp" ]; then
    mv "$tmp" "$KB"; return 0
  fi
  rm -f "$tmp"; return 1
}

case "${1:-}" in
  pull|sync)
    pull_from_relay \
      && echo "OK: база знаний синхронизирована (релей)" \
      || echo "ERR: не удалось получить базу из релея (сеть?)"
    ;;

  share)
    AUTHOR="${2:-designer}"
    FILE="${3:-}"
    [ -s "$FILE" ] || { echo "ERR: пустая заметка"; exit 1; }
    BODY=$(AUTHOR="$AUTHOR" NOTE_FILE="$FILE" python3 -c \
      'import json,os;print(json.dumps({"author":os.environ["AUTHOR"],"note":open(os.environ["NOTE_FILE"],encoding="utf-8").read()}))') \
      || { echo "ERR: не удалось собрать заметку"; exit 1; }
    if curl -fsS --max-time 20 -X POST "$RELAY_URL" \
         -H 'Content-Type: application/json' -d "$BODY" >/dev/null; then
      pull_from_relay || true   # обновим локальную копию, чтобы Claude видел свежак
      echo "OK: знание отправлено команде (релей)"
    else
      echo "ERR: не удалось отправить в релей (проверь секрет/сеть)"
    fi
    ;;

  *)
    echo "ERR: использование: knowledge-sync.sh pull | sync | share <author> <file>"
    exit 1
    ;;
esac
