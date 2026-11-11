#!/bin/bash
# Общий поиск для setup и repair: у приложений, запущенных из Finder, PATH короткий.
# Только обнаружение, без запуска помощника и без изменения его настроек.
bulochka_find_executable() {
  local found candidate
  found="$(command -v "$1" 2>/dev/null || true)"
  shift
  if [ -n "$found" ] && [ -x "$found" ]; then
    printf '%s\n' "$found"
    return 0
  fi
  for candidate in "$@"; do
    if [ -x "$candidate" ]; then
      printf '%s\n' "$candidate"
      return 0
    fi
  done
  return 0
}

# Совпадает с engines в package.json и требованиями зависимостей готового моста.
bulochka_node_supported() {
  "$1" -e 'const [major, minor] = process.versions.node.split(".").map(Number); process.exit((major === 20 && minor >= 19) || (major === 22 && minor >= 13) || major >= 24 ? 0 : 1)' >/dev/null 2>&1
}

if [ -n "${DIR:-}" ] && [ -x "$DIR/runtime/node/bin/node" ] && \
   bulochka_node_supported "$DIR/runtime/node/bin/node"; then
  NODE_BIN="$DIR/runtime/node/bin/node"
else
  NODE_BIN="$(bulochka_find_executable node /opt/homebrew/bin/node /usr/local/bin/node "$HOME/.local/bin/node")"
fi
CODEX_BIN="$(bulochka_find_executable codex \
  "$HOME/.local/bin/codex" /opt/homebrew/bin/codex /usr/local/bin/codex \
  /Applications/Codex.app/Contents/Resources/codex \
  "$HOME/Applications/Codex.app/Contents/Resources/codex" \
  /Applications/ChatGPT.app/Contents/Resources/codex \
  "$HOME/Applications/ChatGPT.app/Contents/Resources/codex")"
CLAUDE_BIN="$(bulochka_find_executable claude \
  "$HOME/.local/bin/claude" "$HOME/.claude/local/claude" \
  /opt/homebrew/bin/claude /usr/local/bin/claude)"
CLAUDE_DESKTOP_APP=""
for candidate in /Applications/Claude.app "$HOME/Applications/Claude.app"; do
  if [ -d "$candidate" ]; then
    CLAUDE_DESKTOP_APP="$candidate"
    break
  fi
done

# npm-установленные CLI используют /usr/bin/env node; одного абсолютного пути CLI мало.
if [ -n "$NODE_BIN" ]; then
  export PATH="$(dirname "$NODE_BIN"):$PATH"
fi
