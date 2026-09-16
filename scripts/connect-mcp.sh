#!/bin/bash
# Булочка · подключение Figma-моста как MCP-сервера `figma-hrtech` к найденным помощникам.
#
# Зачем отдельным файлом: раньше это умел ТОЛЬКО setup.sh, то есть терминал. Самая частая
# поломка у дизайнера — «помощник не видит мост» (в ~/.codex/config.toml нет секции
# [mcp_servers.figma-hrtech]) — кнопкой не лечилась. Теперь этот скрипт зовут оба:
# setup.sh при установке и repair.sh по кнопке «Обновить».
#
# PATH здесь минимальный: repair.sh запускается из процесса моста, а не из шелла дизайнера,
# поэтому node и помощников ищем ещё и по известным местам установки.
# set -u НЕ ставим: в bash 3.2 (штатный на macOS) "${ARR[@]}" на пустом массиве падает.
DIR="$(cd "$(dirname "$0")/.." && pwd)"

NODE_BIN="$(command -v node 2>/dev/null || true)"
for candidate in /opt/homebrew/bin/node /usr/local/bin/node; do
  [ -n "$NODE_BIN" ] && break
  [ -x "$candidate" ] && NODE_BIN="$candidate"
done
if [ -z "$NODE_BIN" ]; then
  echo "connect-mcp: Node.js не найден — мост подключить нечем"
  exit 1
fi

SERVER="$DIR/runtime/bin/bridge.mjs"
[ -f "$SERVER" ] || SERVER="$DIR/dist/local.js"
if [ ! -f "$SERVER" ]; then
  echo "connect-mcp: сервер моста не найден ($DIR/runtime/bin/bridge.mjs)"
  exit 1
fi

CODEX_BIN="$(command -v codex 2>/dev/null || true)"
for candidate in "$HOME/.local/bin/codex" /Applications/ChatGPT.app/Contents/Resources/codex; do
  [ -n "$CODEX_BIN" ] && break
  [ -x "$candidate" ] && CODEX_BIN="$candidate"
done
CLAUDE_BIN="$(command -v claude 2>/dev/null || true)"
for candidate in "$HOME/.local/bin/claude" "$HOME/.claude/local/claude"; do
  [ -n "$CLAUDE_BIN" ] && break
  [ -x "$candidate" ] && CLAUDE_BIN="$candidate"
done

TOKEN_FILE="$HOME/.hrtech/figma-token"
ENV_ARGS=()
if [ -s "$TOKEN_FILE" ]; then
  ENV_ARGS=(--env "FIGMA_ACCESS_TOKEN=$(tr -d '[:space:]' < "$TOKEN_FILE")")
fi

CONNECTED=""
if [ -n "$CODEX_BIN" ]; then
  "$CODEX_BIN" mcp remove figma-hrtech >/dev/null 2>&1 || true
  if "$CODEX_BIN" mcp add figma-hrtech ${ENV_ARGS[@]+"${ENV_ARGS[@]}"} -- "$NODE_BIN" "$SERVER" >/dev/null 2>&1; then
    CONNECTED="Codex"
  else
    echo "connect-mcp: Codex найден ($CODEX_BIN), но подключить мост не вышло — нужен вход в аккаунт"
  fi
fi
if [ -n "$CLAUDE_BIN" ]; then
  "$CLAUDE_BIN" mcp remove figma-hrtech -s user >/dev/null 2>&1 || true
  if "$CLAUDE_BIN" mcp add figma-hrtech -s user ${ENV_ARGS[@]+"${ENV_ARGS[@]}"} -- "$NODE_BIN" "$SERVER" >/dev/null 2>&1; then
    CONNECTED="${CONNECTED:+$CONNECTED, }Claude Code"
  else
    echo "connect-mcp: Claude Code найден ($CLAUDE_BIN), но подключить мост не вышло — нужен вход в аккаунт"
  fi
fi

if [ -z "$CONNECTED" ]; then
  echo "connect-mcp: ни одному помощнику мост подключить не удалось"
  exit 1
fi
echo "connect-mcp: мост подключён — $CONNECTED (новая сессия помощника увидит figma-hrtech)"
exit 0
