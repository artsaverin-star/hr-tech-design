#!/bin/bash
# Bulochka · подключение знаний к Claude Code.
#
# Линкует в ~/.claude команды, базу знаний и ВСЕ скилы из репозитория.
# Вызывается и при установке (setup.sh), и при «Починить» (repair.sh) — иначе новый
# скил или новая команда, приехавшие с git pull, до дизайнера не доедут: Claude Code
# читает только ~/.claude, а симлинка на новую папку там нет.
#
# Заодно чинит две типовые поломки:
#   · симлинк указывает на ДРУГОЙ клон репозитория (у человека их два) — перенаправляем на этот;
#   · симлинк остался от удалённого скила — битые ссылки на наш репозиторий убираем.
set -u
DIR="$(cd "$(dirname "$0")/.." && pwd)"

mkdir -p "$HOME/.claude/commands" "$HOME/.claude/skills"

# 1. Слэш-команды и база знаний.
ln -sfn "$DIR/claude/commands/hrtech.md"          "$HOME/.claude/commands/hrtech.md"
ln -sfn "$DIR/claude/commands/hrtech-digest.md"   "$HOME/.claude/commands/hrtech-digest.md"
ln -sfn "$DIR/claude/commands/hrds-knowledge.md"  "$HOME/.claude/commands/hrds-knowledge.md"
ln -sfn "$DIR/claude/knowledge/team-notes.md"     "$HOME/.claude/commands/team-notes.md"

# 2. Скилы — каждую папку с SKILL.md. Новый скил подхватывается без правки установщика.
SKILL_N=0
for SKILL_DIR in "$DIR"/claude/skills/*/; do
  [ -f "$SKILL_DIR/SKILL.md" ] || continue
  ln -sfn "${SKILL_DIR%/}" "$HOME/.claude/skills/$(basename "$SKILL_DIR")"
  SKILL_N=$((SKILL_N + 1))
done

# 3. Прибрать за собой: битые симлинки, которые вели в наш репозиторий.
#    Чужие скилы и команды не трогаем — смотрим только на путь ссылки.
PRUNED=0
for LINK in "$HOME"/.claude/skills/* "$HOME"/.claude/commands/*; do
  [ -L "$LINK" ] || continue
  [ -e "$LINK" ] && continue
  TARGET="$(readlink "$LINK")"
  case "$TARGET" in
    */claude/skills/*|*/claude/commands/*|*/claude/knowledge/*)
      rm -f "$LINK"
      PRUNED=$((PRUNED + 1))
      ;;
  esac
done

echo "· Команды и база знаний подключены из $DIR"
echo "· Скилов подключено: $SKILL_N (подгружаются сами, когда задача совпала с описанием)"
[ "$PRUNED" -gt 0 ] && echo "· Убрано устаревших ссылок: $PRUNED"
exit 0
