#!/bin/bash
# Shared completion for install.sh and standalone setup.sh. No second agent is started.
set -e
DIR="$(cd "$(dirname "$0")/.." && pwd)"
. "$DIR/scripts/agent-paths.sh"

AGENTS=""
if [ -n "$CODEX_BIN" ] || [ -n "${CODEX_APP:-}" ] || [ -n "${CODEX_CONFIG_FILE:-}" ]; then
  AGENTS="${AGENTS:+$AGENTS, }Codex"
fi
if [ -n "$CLAUDE_BIN" ] || [ -n "${CLAUDE_DESKTOP_APP:-}" ]; then
  AGENTS="${AGENTS:+$AGENTS, }Claude Code"
fi
if [ -n "${ANTIGRAVITY_DETECTED:-}" ]; then
  AGENTS="${AGENTS:+$AGENTS, }Antigravity"
fi
if [ -n "${CURSOR_DETECTED:-}" ]; then
  AGENTS="${AGENTS:+$AGENTS, }Cursor"
fi

printf '\n✓ Булочка настроена на компьютере.\n'
printf 'Осталось подключить открытый макет:\n\n'
if [ -n "$AGENTS" ]; then
  printf '1. Откройте новый чат в %s.\n' "$AGENTS"
else
  printf '1. Откройте новый чат в Codex, Claude Code, Antigravity или Cursor.\n'
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
