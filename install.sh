#!/bin/bash
# One terminal command. No app, sudo, git, Homebrew or system Node installation.
set -e
set -o pipefail
INSTALL_DIR="${BULOCHKA_INSTALL_DIR:-$HOME/Library/Application Support/Bulochka}"
INSTALL_LOG="${BULOCHKA_INSTALL_LOG:-$HOME/.hrtech/install.log}"
INSTALL_TMP=""
umask 077
mkdir -p "$(dirname "$INSTALL_LOG")"
: > "$INSTALL_LOG"
chmod 600 "$INSTALL_LOG"
cleanup() { [ -z "$INSTALL_TMP" ] || rm -rf "$INSTALL_TMP"; }
trap cleanup EXIT
fail() {
  printf '\nНе удалось закончить установку: %s\n' "$1" >&2
  printf 'Отчёт: %s\n' "$INSTALL_LOG" >&2
  exit 1
}
run_logged() { "$@" >> "$INSTALL_LOG" 2>&1; }
trap 'fail "ошибка на текущем шаге (строка $LINENO). Повторите ту же команду."' ERR
node_supported() {
  local version major minor patch
  version="$("$1" -p 'process.versions.node' 2>> "$INSTALL_LOG")" || return 1
  [[ "$version" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]] || return 1
  IFS=. read -r major minor patch <<< "$version"
  (( (major == 20 && minor >= 19) || (major == 22 && minor >= 13) || major >= 24 ))
}
printf '\nБулочка · настройка подключения\n\n[1/3] Проверяю компьютер…\n'
[ "$(uname -s)" = Darwin ] || fail "эта команда предназначена для macOS."
MACOS_VERSION="$(sw_vers -productVersion)"
IFS=. read -r OS_MAJOR OS_MINOR OS_PATCH <<< "$MACOS_VERSION"
case "$OS_MAJOR:$OS_MINOR" in *[!0-9:]*|:*) fail "не удалось определить версию macOS." ;; esac
if [ "$OS_MAJOR" -lt 13 ] || { [ "$OS_MAJOR" -eq 13 ] && [ "$OS_MINOR" -lt 5 ]; }; then fail "нужна macOS 13.5 или новее."; fi
case "$(uname -m)" in
  arm64) NODE_ARCH=arm64; NODE_SHA=aa9549349e47dffaa42dcf95d6e06ade8c4bdafc980979883b88767670df385a ;;
  x86_64) NODE_ARCH=x64; NODE_SHA=d5e336d588c45be0c37dbd52cc29895593009ca4997a77a1fd02815131ed0e52 ;;
  *) fail "неподдерживаемый процессор Mac." ;;
esac
command -v curl >/dev/null 2>&1 || fail "не найдена системная команда curl."
# Downloads and validation happen away from the installation. Partial downloads never execute.
INSTALL_TMP="$(mktemp -d "${TMPDIR:-/tmp}/bulochka-install.XXXXXX")"
printf '[2/3] Скачиваю и проверяю Булочку…\n'
if ! run_logged curl --proto '=https' --proto-redir '=https' -fsSL --connect-timeout 15 --max-time 120 --retry 2 \
  https://codeload.github.com/artsaverin-star/hr-tech-design/tar.gz/refs/heads/main -o "$INSTALL_TMP/package.tar.gz"; then
  fail "не удалось скачать Булочку. Проверьте доступ к GitHub и повторите команду."
fi
if ! run_logged tar -xzf "$INSTALL_TMP/package.tar.gz" -C "$INSTALL_TMP"; then fail "архив Булочки повреждён."; fi
SOURCE="$INSTALL_TMP/hr-tech-design-main"
[ -f "$SOURCE/update-manifest.json" ] && [ -f "$SOURCE/scripts/bootstrap-package.mjs" ] || fail "пакет обновления неполный. Повторите команду позже."
NODE_BIN="$INSTALL_DIR/runtime/node/bin/node"
NODE_ROOT="$INSTALL_DIR/runtime/node"
if [ ! -x "$NODE_BIN" ] || ! node_supported "$NODE_BIN"; then
  NODE_RELEASE="node-v24.22.2-darwin-$NODE_ARCH"
  if ! run_logged curl --proto '=https' --proto-redir '=https' -fsSL --connect-timeout 15 --max-time 180 --retry 2 \
    "https://nodejs.org/dist/v24.22.2/$NODE_RELEASE.tar.gz" -o "$INSTALL_TMP/node.tar.gz"; then
    fail "не удалось скачать движок. Проверьте доступ к nodejs.org и повторите команду."
  fi
  ACTUAL_SHA="$(shasum -a 256 "$INSTALL_TMP/node.tar.gz" | awk '{print $1}')"
  [ "$ACTUAL_SHA" = "$NODE_SHA" ] || fail "контрольная сумма движка не совпала. Файлы установки не изменены."
  run_logged tar -xzf "$INSTALL_TMP/node.tar.gz" -C "$INSTALL_TMP" "$NODE_RELEASE/bin/node" "$NODE_RELEASE/LICENSE" || fail "архив движка повреждён."
  NODE_ROOT="$INSTALL_TMP/$NODE_RELEASE"
  NODE_BIN="$NODE_ROOT/bin/node"
  node_supported "$NODE_BIN" || fail "движок не запускается на этом Mac."
fi
if ! run_logged "$NODE_BIN" "$SOURCE/scripts/bootstrap-package.mjs" "$SOURCE" "$INSTALL_DIR" "$NODE_ROOT"; then
  tail -n 3 "$INSTALL_LOG" >&2
  fail "пакет не прошёл проверку или место установки занято."
fi
printf '[3/3] Настраиваю Codex, Claude и умения HR Tech…\n'
if ! BULOCHKA_INSTALLER=1 bash "$INSTALL_DIR/setup.sh" >> "$INSTALL_LOG" 2>&1; then
  tail -n 10 "$INSTALL_LOG" >&2
  fail "настройка помощника не завершилась. Файлы сохранены; повторная команда восстановит настройку."
fi
"$INSTALL_DIR/runtime/node/bin/node" "$INSTALL_DIR/scripts/bootstrap-package.mjs" --ready "$INSTALL_DIR" >> "$INSTALL_LOG" 2>&1
bash "$INSTALL_DIR/scripts/install-next-steps.sh"
printf '\nОбновление и восстановление — этой же командой или кнопкой в плагине.\n'
