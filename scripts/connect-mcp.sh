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
. "$DIR/scripts/agent-paths.sh"
if [ -z "$NODE_BIN" ]; then
  echo "connect-mcp: Node.js не найден — мост подключить нечем"
  exit 1
fi
if ! bulochka_node_supported "$NODE_BIN"; then
  echo "connect-mcp: нужен Node.js 20.19+, 22.13+ или 24+"
  exit 1
fi

SERVER="$DIR/runtime/bin/bridge.mjs"
[ -f "$SERVER" ] || SERVER="$DIR/dist/local.js"
if [ ! -f "$SERVER" ]; then
  echo "connect-mcp: сервер моста не найден ($DIR/runtime/bin/bridge.mjs)"
  exit 1
fi

TOKEN_FILE="$HOME/.hrtech/figma-token"
ENV_ARGS=()
FIGMA_TOKEN=""
if [ -s "$TOKEN_FILE" ]; then
  FIGMA_TOKEN="$(tr -d '[:space:]' < "$TOKEN_FILE")"
  ENV_ARGS=(--env "FIGMA_ACCESS_TOKEN=$FIGMA_TOKEN")
fi

# Ошибку сохраняем для диагностики, но личный токен никогда не печатаем.
report_failure() {
  local detail="$2"
  if [ -n "$FIGMA_TOKEN" ]; then detail="${detail//"$FIGMA_TOKEN"/[токен скрыт]}"; fi
  echo "connect-mcp: не удалось подключить $1. Причина:"
  printf '%s\n' "$detail"
}

# Это чтение конфигурации, без запуска моста и без проверки входа в аккаунт.
# JSON может содержать токен, поэтому в диагностике показываем только итог проверки.
verify_codex_config() {
  local saved
  if ! saved="$("$CODEX_BIN" mcp get figma-hrtech --json 2>&1)"; then
    report_failure "Codex: проверить сохранённую настройку" "$saved"
    return 1
  fi
  if ! printf '%s' "$saved" | "$NODE_BIN" -e '
    let input = "";
    process.stdin.setEncoding("utf8");
    process.stdin.on("data", chunk => input += chunk);
    process.stdin.on("end", () => {
      try {
        const config = JSON.parse(input);
        const transport = config.transport;
        const matches = config.name === "figma-hrtech" && config.enabled === true &&
          transport?.type === "stdio" && transport.command === process.argv[1] &&
          Array.isArray(transport.args) && transport.args.length === 1 &&
          transport.args[0] === process.argv[2];
        process.exit(matches ? 0 : 1);
      } catch { process.exit(1); }
    });
  ' "$NODE_BIN" "$SERVER"; then
    report_failure "Codex" "Сохранённая запись MCP выключена или не совпадает с путём к этому мосту. Повторите настройку и передайте эту ошибку поддержке."
    return 1
  fi
}

CONNECTED=""
FAILED=0
if [ -n "$CODEX_BIN" ]; then
  # Codex add обновляет существующую запись. Предварительный remove терял рабочую
  # настройку, если следом add падал (например, из-за ошибки конфигурации).
  if RESULT="$("$CODEX_BIN" mcp add figma-hrtech ${ENV_ARGS[@]+"${ENV_ARGS[@]}"} -- "$NODE_BIN" "$SERVER" 2>&1)"; then
    if verify_codex_config; then
      CONNECTED="Codex"
    else
      FAILED=1
    fi
  else
    report_failure "Codex" "$RESULT"
    FAILED=1
  fi
fi
if [ -n "${CLAUDE_DESKTOP_APP:-}" ]; then
  # CLI и локальная вкладка Code в Claude Desktop читают один user-scope JSON.
  # Атомарное обновление не удаляет рабочую запись перед проверкой и также чинит
  # существующий legacy desktop override с тем же именем сервера.
  if RESULT="$("$NODE_BIN" "$DIR/scripts/configure-claude-desktop.mjs" --node "$NODE_BIN" --server "$SERVER" --token-file "$TOKEN_FILE" 2>&1)"; then
    CONNECTED="${CONNECTED:+$CONNECTED, }Claude Code"
  else
    report_failure "Claude Code" "$RESULT"
    FAILED=1
  fi
elif [ -n "$CLAUDE_BIN" ]; then
  "$CLAUDE_BIN" mcp remove figma-hrtech -s user >/dev/null 2>&1 || true
  if RESULT="$("$CLAUDE_BIN" mcp add figma-hrtech -s user ${ENV_ARGS[@]+"${ENV_ARGS[@]}"} -- "$NODE_BIN" "$SERVER" 2>&1)"; then
    CONNECTED="${CONNECTED:+$CONNECTED, }Claude Code"
  else
    report_failure "Claude Code" "$RESULT"
    FAILED=1
  fi
fi

if [ -z "$CONNECTED" ]; then
  echo "connect-mcp: настройка MCP не сохранена или не прошла проверку. Причина указана выше."
  exit 1
fi
echo "· Настройка сохранена: $CONNECTED"
exit "$FAILED"
