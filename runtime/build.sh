#!/bin/bash
# Пересборка самодостаточного сервера моста в один файл (для мейнтейнеров).
# Запускать после изменений в src/: bash runtime/build.sh  (или npm run build:server)
# Файл runtime/bin/bridge.mjs коммитится в репо — у дизайнеров сборки нет.
set -e
DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$DIR"
npx esbuild src/local.ts --bundle --platform=node --format=esm --target=node18 --minify \
  --outfile=runtime/bin/bridge.mjs \
  --banner:js="import{createRequire as ___cr}from'module';const require=___cr(import.meta.url);"
# Some bundled dependency templates contain line-ending spaces. They are not
# semantically meaningful, but make repository-wide diff checks noisy.
perl -pi -e 's/[ \t]+$//' runtime/bin/bridge.mjs
echo "✓ Собрано: runtime/bin/bridge.mjs"
