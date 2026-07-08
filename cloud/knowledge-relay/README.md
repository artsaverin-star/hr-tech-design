# Bulochka · knowledge relay (Yandex Cloud)

Serverless-релей общей базы знаний. Дизайнеру не нужен ни git, ни регистрация — плагин
ходит по HTTP на один URL. Запись прикрыта общим секретом `X-Bulochka-Key`.

```
Bulochka → API Gateway → Cloud Function (Node 18) → Object Storage (team-notes.md)
              GET  → отдать файл
              POST {author, note} → дописать секцию
```

Всё влезает в бесплатный тариф (функция + шлюз + бакет — копейки трафика).

## Что понадобится
- Установленный `yc` CLI (`brew install yandex-cloud-cli`) и `yc init` (выбрать облако/каталог), **или** консоль console.cloud.yandex.ru.
- Придумай секрет для записи, напр. `SHARED_SECRET=$(openssl rand -hex 16)` — его же вобьём в плагин.

## Деплой через yc CLI

```bash
cd cloud/knowledge-relay
FOLDER=$(yc config get folder-id)

# 1) Бакет для хранения (имя должно быть глобально-уникальным)
BUCKET=bulochka-knowledge-$(openssl rand -hex 3)
yc storage bucket create --name "$BUCKET"

# 2) Сервис-аккаунт + права на бакет + статический ключ (для S3 API из функции)
yc iam service-account create --name bulochka-relay
SA_ID=$(yc iam service-account get bulochka-relay --format json | python3 -c 'import sys,json;print(json.load(sys.stdin)["id"])')
yc resource-manager folder add-access-binding "$FOLDER" --role storage.editor --subject serviceAccount:$SA_ID
# статический ключ доступа (S3) — сохрани оба значения:
yc iam access-key create --service-account-name bulochka-relay --format json
# → {"access_key":{"key_id":"..."},"secret":"..."}   ← key_id и secret ниже

SHARED_SECRET=$(openssl rand -hex 16); echo "SHARED_SECRET=$SHARED_SECRET  (запиши — вобьём в плагин)"

# 3) Функция (deps из package.json собираются автоматически)
yc serverless function create --name bulochka-knowledge
yc serverless function version create \
  --function-name bulochka-knowledge \
  --runtime nodejs18 --entrypoint index.handler \
  --memory 128m --execution-timeout 10s \
  --source-path . \
  --service-account-id "$SA_ID" \
  --environment BUCKET="$BUCKET",OBJECT_KEY=team-notes.md,S3_ACCESS_KEY_ID=<KEY_ID>,S3_SECRET_ACCESS_KEY=<SECRET>,SHARED_SECRET="$SHARED_SECRET"
FUNC_ID=$(yc serverless function get bulochka-knowledge --format json | python3 -c 'import sys,json;print(json.load(sys.stdin)["id"])')

# 4) API Gateway (даёт публичный HTTPS + CORS уже в функции)
#    подставь FUNC_ID и SA_ID в apigw.yaml, дай SA роль functions.functionInvoker:
yc resource-manager folder add-access-binding "$FOLDER" --role functions.functionInvoker --subject serviceAccount:$SA_ID
sed -e "s/REPLACE_FUNCTION_ID/$FUNC_ID/" -e "s/REPLACE_SA_ID/$SA_ID/" apigw.yaml > /tmp/apigw.yaml
yc serverless api-gateway create --name bulochka --spec=/tmp/apigw.yaml
yc serverless api-gateway get bulochka --format json | python3 -c 'import sys,json;print("URL:", "https://"+json.load(sys.stdin)["domain"]+"/knowledge")'
```

Итог — URL вида `https://<id>.apigw.yandexcloud.net/knowledge`.

## Проверка
```bash
URL=https://<id>.apigw.yandexcloud.net/knowledge
curl "$URL"                                              # GET — вернёт базу
curl -X POST "$URL" -H 'X-Bulochka-Key: <SHARED_SECRET>' \
     -H 'Content-Type: application/json' \
     -d '{"author":"Тест","note":"первая заметка"}'      # POST — допишет
curl "$URL"                                              # снова GET — увидишь секцию
```

## Что дальше (сделаю я)
Дай мне **URL** и **SHARED_SECRET** — я:
1. добавлю домен шлюза в `figma-desktop-bridge/manifest.json` (`networkAccess.allowedDomains`);
2. перепишу кнопку ⟳ в плагине на `fetch` GET/POST к релею (вместо git-через-раннер);
3. локальный раннер тоже переведу на релей (GET → пишет `team-notes.md` для Claude, POST — отправляет), чтобы `/hrtech` видел общую базу без git-доступа.
