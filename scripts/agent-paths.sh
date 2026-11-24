#!/bin/bash
# Общий поиск для setup и repair: у приложений, запущенных из Finder или IDE, PATH короткий.
# Только обнаружение, без запуска помощника и без изменения его настроек.
# Совместим с macOS bash 3.2.
bulochka_find_executable() {
  local found candidate
  found="$(command -v "$1" 2>/dev/null || true)"
  shift
  if [ -n "$found" ] && [ -x "$found" ]; then
    printf '%s\n' "$found"
    return 0
  fi
  for candidate in "$@"; do
    if [ -n "$candidate" ] && [ -x "$candidate" ]; then
      printf '%s\n' "$candidate"
      return 0
    fi
  done
  return 0
}

bulochka_find_nvm_bin() {
  local tool="$1" latest="" candidate
  if [ -d "$HOME/.nvm/versions/node" ]; then
    for candidate in "$HOME/.nvm/versions/node"/*/bin/"$tool"; do
      if [ -x "$candidate" ]; then
        latest="$candidate"
      fi
    done
  fi
  if [ -n "$latest" ]; then
    printf '%s\n' "$latest"
  fi
}

# Совпадает с engines в package.json и требованиями зависимостей готового моста.
bulochka_node_supported() {
  "$1" -e 'const [major, minor] = process.versions.node.split(".").map(Number); process.exit((major === 20 && minor >= 19) || (major === 22 && minor >= 13) || major >= 24 ? 0 : 1)' >/dev/null 2>&1
}

# BULOCHKA_APPS_DIR и BULOCHKA_SYS_BINS позволяют изолировать тесты от реального Mac разработчика.
BULOCHKA_SYS_APPS="${BULOCHKA_APPS_DIR-/Applications}"
BULOCHKA_BREW_BIN="${BULOCHKA_BREW_BIN-/opt/homebrew/bin}"
BULOCHKA_LOCAL_BIN="${BULOCHKA_LOCAL_BIN-/usr/local/bin}"

if [ -n "${DIR:-}" ] && [ -x "$DIR/runtime/node/bin/node" ] && \
   bulochka_node_supported "$DIR/runtime/node/bin/node"; then
  NODE_BIN="$DIR/runtime/node/bin/node"
else
  NODE_BIN="$(bulochka_find_executable node \
    "${BULOCHKA_BREW_BIN:+$BULOCHKA_BREW_BIN/node}" "${BULOCHKA_LOCAL_BIN:+$BULOCHKA_LOCAL_BIN/node}" "$HOME/.local/bin/node" \
    "$HOME/.volta/bin/node" "$HOME/.fnm/current/bin/node" \
    "$(bulochka_find_nvm_bin node)")"
fi

CODEX_BIN="$(bulochka_find_executable codex \
  "$HOME/.local/bin/codex" "${BULOCHKA_BREW_BIN:+$BULOCHKA_BREW_BIN/codex}" "${BULOCHKA_LOCAL_BIN:+$BULOCHKA_LOCAL_BIN/codex}" \
  "$HOME/.volta/bin/codex" "$HOME/.npm-global/bin/codex" \
  "$(bulochka_find_nvm_bin codex)" \
  "${BULOCHKA_SYS_APPS:+$BULOCHKA_SYS_APPS/Codex.app/Contents/Resources/codex}" \
  "${BULOCHKA_SYS_APPS:+$BULOCHKA_SYS_APPS/Codex.app/Contents/Resources/codex-cli/CodexCLI.app/Contents/MacOS/codex}" \
  "$HOME/Applications/Codex.app/Contents/Resources/codex" \
  "$HOME/Applications/Codex.app/Contents/Resources/codex-cli/CodexCLI.app/Contents/MacOS/codex" \
  "${BULOCHKA_SYS_APPS:+$BULOCHKA_SYS_APPS/ChatGPT.app/Contents/Resources/codex}" \
  "${BULOCHKA_SYS_APPS:+$BULOCHKA_SYS_APPS/ChatGPT.app/Contents/Resources/codex-cli/CodexCLI.app/Contents/MacOS/codex}" \
  "$HOME/Applications/ChatGPT.app/Contents/Resources/codex" \
  "$HOME/Applications/ChatGPT.app/Contents/Resources/codex-cli/CodexCLI.app/Contents/MacOS/codex")"

CODEX_APP=""
for candidate in \
  "${BULOCHKA_SYS_APPS:+$BULOCHKA_SYS_APPS/Codex.app}" \
  "$HOME/Applications/Codex.app"; do
  if [ -n "$candidate" ] && [ -d "$candidate" ]; then
    CODEX_APP="$candidate"
    break
  fi
done
CODEX_CONFIG_FILE=""
if [ -f "${CODEX_HOME:-$HOME/.codex}/config.toml" ]; then
  CODEX_CONFIG_FILE="${CODEX_HOME:-$HOME/.codex}/config.toml"
fi

CLAUDE_BIN="$(bulochka_find_executable claude \
  "$HOME/.local/bin/claude" "$HOME/.claude/local/claude" \
  "${BULOCHKA_BREW_BIN:+$BULOCHKA_BREW_BIN/claude}" "${BULOCHKA_LOCAL_BIN:+$BULOCHKA_LOCAL_BIN/claude}" \
  "$HOME/.volta/bin/claude" "$HOME/.npm-global/bin/claude" \
  "$(bulochka_find_nvm_bin claude)")"

CLAUDE_DESKTOP_APP=""
for candidate in \
  "${BULOCHKA_SYS_APPS:+$BULOCHKA_SYS_APPS/Claude.app}" \
  "$HOME/Applications/Claude.app"; do
  if [ -n "$candidate" ] && [ -d "$candidate" ]; then
    CLAUDE_DESKTOP_APP="$candidate"
    break
  fi
done

ANTIGRAVITY_BIN="$(bulochka_find_executable agy \
  "$HOME/.local/bin/agy" "${BULOCHKA_BREW_BIN:+$BULOCHKA_BREW_BIN/agy}" "${BULOCHKA_LOCAL_BIN:+$BULOCHKA_LOCAL_BIN/agy}")"
ANTIGRAVITY_APP=""
for candidate in \
  "${BULOCHKA_SYS_APPS:+$BULOCHKA_SYS_APPS/Antigravity.app}" \
  "$HOME/Applications/Antigravity.app"; do
  if [ -n "$candidate" ] && [ -d "$candidate" ]; then
    ANTIGRAVITY_APP="$candidate"
    break
  fi
done
ANTIGRAVITY_CONFIG_DIR=""
if [ -d "$HOME/.gemini/config" ] || [ -d "$HOME/.gemini/antigravity" ]; then
  ANTIGRAVITY_CONFIG_DIR="$HOME/.gemini/config"
fi
ANTIGRAVITY_DETECTED=""
if [ -n "$ANTIGRAVITY_BIN" ] || [ -n "$ANTIGRAVITY_APP" ] || [ -n "$ANTIGRAVITY_CONFIG_DIR" ]; then
  ANTIGRAVITY_DETECTED="1"
fi

CURSOR_BIN="$(bulochka_find_executable cursor \
  "$HOME/.local/bin/cursor" "${BULOCHKA_BREW_BIN:+$BULOCHKA_BREW_BIN/cursor}" "${BULOCHKA_LOCAL_BIN:+$BULOCHKA_LOCAL_BIN/cursor}" \
  "${BULOCHKA_SYS_APPS:+$BULOCHKA_SYS_APPS/Cursor.app/Contents/Resources/app/bin/cursor}" \
  "$HOME/Applications/Cursor.app/Contents/Resources/app/bin/cursor")"
CURSOR_APP=""
for candidate in \
  "${BULOCHKA_SYS_APPS:+$BULOCHKA_SYS_APPS/Cursor.app}" \
  "$HOME/Applications/Cursor.app"; do
  if [ -n "$candidate" ] && [ -d "$candidate" ]; then
    CURSOR_APP="$candidate"
    break
  fi
done
CURSOR_CONFIG_DIR=""
if [ -d "$HOME/.cursor" ]; then
  CURSOR_CONFIG_DIR="$HOME/.cursor"
fi
CURSOR_DETECTED=""
if [ -n "$CURSOR_BIN" ] || [ -n "$CURSOR_APP" ] || [ -n "$CURSOR_CONFIG_DIR" ]; then
  CURSOR_DETECTED="1"
fi

# npm-установленные CLI используют /usr/bin/env node; одного абсолютного пути CLI мало.
if [ -n "$NODE_BIN" ]; then
  export PATH="$(dirname "$NODE_BIN"):$PATH"
fi
