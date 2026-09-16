#!/bin/bash
# Bulochka · подключение HR Tech skills к помощнику дизайнера (Codex CLI и/или Claude Code).
#
# Скилы остаются версионируемыми файлами репозитория, а помощник видит их через
# симлинки в своём user-scope каталоге. Поэтому обновление репозитория сразу
# обновляет умения без второй копии знания.
#
# Линкуем в ОБА каталога: помощник у дизайнера может быть любым, а поддержка
# «через одного» = у половины команды умения молча не доезжают. Заодно чиним две
# типовые поломки: симлинк указывает на ДРУГОЙ клон репозитория (у человека их два)
# и симлинк остался от удалённого скила.
set -u
DIR="$(cd "$(dirname "$0")/.." && pwd)"
CODEX_SKILLS_ROOT="${CODEX_HOME:-$HOME/.codex}/skills"
CLAUDE_SKILLS_ROOT="$HOME/.claude/skills"
CLAUDE_COMMANDS_ROOT="$HOME/.claude/commands"

mkdir -p "$CODEX_SKILLS_ROOT" "$CLAUDE_SKILLS_ROOT" "$CLAUDE_COMMANDS_ROOT"

# 1. Слэш-команды и база знаний (их читает Claude Code; Codex берёт те же файлы из скилов).
ln -sfn "$DIR/claude/commands/hrtech.md"          "$CLAUDE_COMMANDS_ROOT/hrtech.md"
ln -sfn "$DIR/claude/commands/hrtech-digest.md"   "$CLAUDE_COMMANDS_ROOT/hrtech-digest.md"
ln -sfn "$DIR/claude/commands/hrds-knowledge.md"  "$CLAUDE_COMMANDS_ROOT/hrds-knowledge.md"
ln -sfn "$DIR/claude/knowledge/team-notes.md"     "$CLAUDE_COMMANDS_ROOT/team-notes.md"

# 2. Скилы — каждую папку с SKILL.md. Новый скил подхватывается без правки установщика.
SKILL_N=0
for SKILL_DIR in "$DIR"/claude/skills/*/; do
  [ -f "$SKILL_DIR/SKILL.md" ] || continue
  ln -sfn "${SKILL_DIR%/}" "$CODEX_SKILLS_ROOT/$(basename "$SKILL_DIR")"
  ln -sfn "${SKILL_DIR%/}" "$CLAUDE_SKILLS_ROOT/$(basename "$SKILL_DIR")"
  SKILL_N=$((SKILL_N + 1))
done

# 3. Убираем только битые ссылки на старые клоны Булочки. Чужие skills не трогаем.
PRUNED=0
for LINK in "$CODEX_SKILLS_ROOT"/* "$CLAUDE_SKILLS_ROOT"/* "$CLAUDE_COMMANDS_ROOT"/*; do
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

echo "· Умения Булочки подключены: $SKILL_N (Codex, Claude Code)"
echo "  Помощник подгружает нужное умение сам, когда запрос совпал с его описанием"
[ "$PRUNED" -gt 0 ] && echo "· Убрано устаревших ссылок: $PRUNED"
exit 0
