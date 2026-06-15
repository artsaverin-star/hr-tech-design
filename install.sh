#!/bin/bash
# HR TECH DESIGN — установщик «всё одной командой».
# Использование (в Терминале):
#   curl -fsSL https://raw.githubusercontent.com/artsaverin-star/hr-tech-design/main/install.sh | bash
set -e
echo "════════ HR TECH DESIGN — установка ════════"

# 1. git (Xcode Command Line Tools)
if ! command -v git >/dev/null 2>&1; then
  echo "· Нужны инструменты разработчика. Если появилось окно — подтверди установку и запусти установщик снова."
  xcode-select --install 2>/dev/null || true
  echo "✗ Останавливаюсь — доустанови инструменты и запусти установщик ещё раз."
  exit 1
fi

# 2. Node.js (через Homebrew, если node нет)
if ! command -v node >/dev/null 2>&1; then
  echo "· Node.js не найден — ставлю…"
  if ! command -v brew >/dev/null 2>&1; then
    echo "· Ставлю Homebrew (попросит пароль Mac — вводи, он не виден)…"
    NONINTERACTIVE=1 /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
  fi
  [ -x /opt/homebrew/bin/brew ] && eval "$(/opt/homebrew/bin/brew shellenv)"
  [ -x /usr/local/bin/brew ]   && eval "$(/usr/local/bin/brew shellenv)"
  brew install node
fi

# 3. Claude Code
if ! command -v claude >/dev/null 2>&1; then
  echo "· Ставлю Claude Code…"
  npm install -g @anthropic-ai/claude-code
fi

# 4. Проект (скачать или обновить) в ~/hr-tech-design
DIR="$HOME/hr-tech-design"
if [ -d "$DIR/.git" ]; then
  echo "· Обновляю проект…"
  git -C "$DIR" pull --ff-only || true
else
  echo "· Скачиваю проект в $DIR …"
  git clone https://github.com/artsaverin-star/hr-tech-design.git "$DIR"
fi

# 5. Подключение моста (без сборки — сервер уже готов в репо)
( cd "$DIR" && ./setup.sh )

# 6. Открыть папку с плагином в Finder
open "$DIR/figma-desktop-bridge" 2>/dev/null || true

cat <<EOF

════════ Почти готово! Осталось 2 шага вручную ════════

1) Войди в Claude (один раз):
   открой Терминал, набери   claude   и войди в свой аккаунт.

2) Поставь плагин в Figma (один раз):
   десктопная Figma → Plugins → Development → Import plugin from manifest…
   → выбери файл (папку я открыл в Finder):
   $DIR/figma-desktop-bridge/manifest.json

Дальше каждый день: открой плагин → Activate Bridge →
в Терминале  cd ~/hr-tech-design && claude  → пиши задачи словами.
EOF
