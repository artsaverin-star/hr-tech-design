# Запуск без системного Node.js

Установщик Булочки кладёт Node.js внутрь пакета. На чистом Mac команда `node` может
отсутствовать в PATH, хотя Булочка установлена правильно. Сначала перейди в реальный
каталог умения (`cd -P "<путь к hrtech-figma-search>"`), затем выбери движок:

```sh
BULOCHKA_NODE="$(cd ../../.. && pwd -P)/runtime/node/bin/node"
if [ ! -x "$BULOCHKA_NODE" ]; then
  BULOCHKA_NODE="$(command -v node || true)"
fi
```

Если переменная пуста, нужен повторный запуск установочной команды Булочки: в этом
пакете нет доступного движка. Не устанавливай Homebrew или глобальный Node ради поиска.
В рабочем клоне разработчика допускается системный Node.js 20.19+, 22.13+ или 24+.

Используй найденный путь для всех команд умения:

```sh
"$BULOCHKA_NODE" scripts/search.mjs "календарь" --type FILE
"$BULOCHKA_NODE" scripts/scan.mjs status --catalog /absolute/path/catalog.json
"$BULOCHKA_NODE" scripts/pack.mjs --source /absolute/local/catalog.json --destination /absolute/local/backup/catalog.json
```

Путь вычисляется от реального каталога умения и работает с пробелами в
`Library/Application Support/Bulochka`. Переменная нужна в той же shell-сессии, где
запускается команда; новый вызов shell должен определить её заново.
