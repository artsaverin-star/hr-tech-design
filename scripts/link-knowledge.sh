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
set -eu
DIR="$(cd "$(dirname "$0")/.." && pwd)"
CODEX_SKILLS_ROOT="$HOME/.agents/skills"
CODEX_LEGACY_SKILLS_ROOT="${CODEX_HOME:-$HOME/.codex}/skills"
CLAUDE_SKILLS_ROOT="$HOME/.claude/skills"
CLAUDE_COMMANDS_ROOT="$HOME/.claude/commands"

mkdir -p "$CODEX_SKILLS_ROOT" "$CLAUDE_SKILLS_ROOT" "$CLAUDE_COMMANDS_ROOT"

# Не вкладывать ссылку внутрь существующей папки и не заменять чужое умение.
# Исторические пути /codex/skills тоже принадлежат старому пакету Булочки.
link_skill() {
  local source="$1" target="$2" previous
  if [ -L "$target" ]; then
    previous="$(readlink "$target")"
    case "$previous" in
      */claude/skills/"$(basename "$source")"|*/codex/skills/"$(basename "$source")") ;;
      *) echo "✗ Сохранена сторонняя ссылка: $target. Умение Булочки туда не подключено."; return 1 ;;
    esac
  elif [ -e "$target" ]; then
    echo "✗ Сохранена существующая папка: $target. Уберите конфликт имён и повторите настройку."
    return 1
  fi
  ln -sfn "$source" "$target"
}

# 1. Слэш-команды и база знаний (их читает Claude Code; Codex берёт те же файлы из скилов).
link_command() {
  local source="$1" target="$2" previous relative
  relative="${source#"$DIR"/}"
  if [ ! -f "$source" ]; then
    echo "✗ В пакете не найдена команда или база знаний: $relative. Существующие файлы сохранены."
    return 1
  fi
  if [ -L "$target" ]; then
    previous="$(readlink "$target")"
    case "$previous" in
      */"$relative") ;;
      *) echo "✗ Сохранена сторонняя ссылка: $target. Команда Булочки туда не подключена."; return 1 ;;
    esac
  elif [ -e "$target" ]; then
    echo "✗ Сохранён существующий файл или папка: $target. Уберите конфликт имён и повторите настройку."
    return 1
  fi
  ln -sfn "$source" "$target"
}
FAILED=0
link_command "$DIR/claude/commands/hrtech.md"         "$CLAUDE_COMMANDS_ROOT/hrtech.md" || FAILED=1
link_command "$DIR/claude/commands/hrtech-digest.md"  "$CLAUDE_COMMANDS_ROOT/hrtech-digest.md" || FAILED=1
link_command "$DIR/claude/commands/hrds-knowledge.md" "$CLAUDE_COMMANDS_ROOT/hrds-knowledge.md" || FAILED=1
link_command "$DIR/claude/knowledge/team-notes.md"    "$CLAUDE_COMMANDS_ROOT/team-notes.md" || FAILED=1

# 2. Скилы — каждую папку с SKILL.md. Новый скил подхватывается без правки установщика.
SKILL_N=0
for SKILL_DIR in "$DIR"/claude/skills/*/; do
  [ -f "$SKILL_DIR/SKILL.md" ] || continue
  SKILL_NAME="$(basename "$SKILL_DIR")"
  if link_skill "${SKILL_DIR%/}" "$CODEX_SKILLS_ROOT/$SKILL_NAME"; then
    # Codex показывает совпадающие имена из двух каталогов отдельно. После успешной
    # миграции убираем только прежнюю ссылку Булочки, реальные папки сохраняем.
    LEGACY_LINK="$CODEX_LEGACY_SKILLS_ROOT/$SKILL_NAME"
    if [ -L "$LEGACY_LINK" ]; then
      case "$(readlink "$LEGACY_LINK")" in
        */claude/skills/"$SKILL_NAME"|*/codex/skills/"$SKILL_NAME") rm "$LEGACY_LINK" ;;
      esac
    fi
  else
    FAILED=1
  fi
  link_skill "${SKILL_DIR%/}" "$CLAUDE_SKILLS_ROOT/$SKILL_NAME" || FAILED=1
  SKILL_N=$((SKILL_N + 1))
done

# 3. Убираем только битые ссылки на старые клоны Булочки. Чужие skills не трогаем.
PRUNED=0
for LINK in "$CODEX_SKILLS_ROOT"/* "$CODEX_LEGACY_SKILLS_ROOT"/* "$CLAUDE_SKILLS_ROOT"/* "$CLAUDE_COMMANDS_ROOT"/*; do
  [ -L "$LINK" ] || continue
  [ -e "$LINK" ] && continue
  TARGET="$(readlink "$LINK")"
  # В commands не удалять чужие битые ссылки, даже если их проект тоже
  # использует каталог claude/commands. Только четыре известные ссылки Булочки.
  case "$LINK" in
    "$CLAUDE_COMMANDS_ROOT/"*)
      case "$(basename "$LINK")|$TARGET" in
        hrtech.md\|*/claude/commands/hrtech.md|hrtech-digest.md\|*/claude/commands/hrtech-digest.md|hrds-knowledge.md\|*/claude/commands/hrds-knowledge.md|team-notes.md\|*/claude/knowledge/team-notes.md) ;;
        *) continue ;;
      esac
      ;;
  esac
  case "$TARGET" in
    */claude/skills/*|*/claude/commands/*|*/claude/knowledge/*)
      rm -f "$LINK"
      PRUNED=$((PRUNED + 1))
      ;;
  esac
done

if [ "$SKILL_N" -eq 0 ]; then
  echo "✗ В проекте не найдены умения HR Tech. Повторите установку полного пакета Булочки."
  FAILED=1
fi
if [ "$FAILED" -eq 0 ]; then
  echo "· Умения Булочки подключены: $SKILL_N (Codex, Claude Code)"
else
  echo "· Часть умений не подключена — существующие файлы сохранены. Причины указаны выше."
fi
echo "  Помощник подгружает нужное умение сам, когда запрос совпал с его описанием"
[ "$PRUNED" -gt 0 ] && echo "· Убрано устаревших ссылок: $PRUNED"
exit "$FAILED"
