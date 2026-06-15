# Claude + Figma — инструкция

## Установка (один раз) — всё в терминале

Открой **Терминал** (Cmd+Пробел → «Терминал» → Enter). Вставляй блоки по очереди, жми Enter.

**1. Поставь Homebrew и Node.js** (если Homebrew уже есть — первые 3 строки просто обновят его):
```
/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
echo 'eval "$(/opt/homebrew/bin/brew shellenv)"' >> ~/.zprofile
eval "$(/opt/homebrew/bin/brew shellenv)"
brew install node
```
(попросит пароль Mac; пароль при вводе не виден — это нормально)

**2. Поставь Claude:**
```
npm install -g @anthropic-ai/claude-code
```

**3. Войди в аккаунт** (авторизуйся в браузере, потом нажми Ctrl+C):
```
claude
```

**4. Скачай проект** (создаст папку `~/hr-tech-design`):
```
cd ~ && git clone https://github.com/artsaverin-star/hr-tech-design.git
```

**5. Установи:**
```
cd ~/hr-tech-design && ./setup.sh
```

**6. Поставь плагин в Figma:** десктопная Figma → Plugins → Development → Import plugin from manifest… → выбери файл:
```
~/hr-tech-design/figma-desktop-bridge/manifest.json
```

---

## Каждый раз

**1.** В Figma: Plugins → Development → **HR TECH DESIGN** → нажми **Activate Bridge** (лампочка зелёная). Не закрывай плагин.

**2.** В Терминале:
```
cd ~/hr-tech-design && claude
```

**3.** Пиши задачу словами. Например: «Собери макет по этой картинке» *(в Figma: ПКМ по слою → Copy link → вставь в чат)*

---

## Если отвалилось

В чате: **`/mcp`** → **figma-hrtech** → **Reconnect**.
