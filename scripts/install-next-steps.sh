#!/bin/bash
# Shared completion for install.sh and standalone setup.sh. No second agent is started.
set -e
DIR="$(cd "$(dirname "$0")/.." && pwd)"
. "$DIR/scripts/agent-paths.sh"

printf '\n✓ Булочка настроена на компьютере.\n'
printf 'Осталось подключить открытый макет:\n\n'
if [ -n "$CODEX_BIN" ] && [ -z "$CLAUDE_BIN" ] && [ -z "${CLAUDE_DESKTOP_APP:-}" ]; then
  printf '1. Откройте новый чат в Codex.\n'
elif { [ -n "$CLAUDE_BIN" ] || [ -n "${CLAUDE_DESKTOP_APP:-}" ]; } && [ -z "$CODEX_BIN" ]; then
  printf '1. Откройте новую сессию Claude Code.\n'
else
  printf '1. Откройте новый чат в Codex или новую сессию Claude Code.\n'
fi
if [ -n "${CLAUDE_DESKTOP_APP:-}" ]; then
  printf '   В приложении Claude выберите вкладку Code.\n'
fi
printf '\n2. Откройте макет в команде Yandex и запустите плагин:\n'
printf '   Plugins → From Yandex → Bulochka.\n'
printf '   Ссылка на плагин: https://www.figma.com/community/plugin/1656667332797186865\n'
printf '\n3. В новом чате помощника напишите:\n'
printf '   «Подключись к открытому файлу Figma через Булочку.\n'
printf '   Назови файл и выделенный экран, ничего не меняй».\n\n'
printf 'Когда помощник назовёт ваш файл — подключение проверено.\n'
printf 'Токен Figma для начала работы не нужен. Его можно добавить позже в Настройках.\n'
