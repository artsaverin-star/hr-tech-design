#!/bin/bash
# HR TECH DESIGN · авто-раннер очереди (v2, жёсткий стоп).
# Запусти в терминале и сверни: ./scripts/hrtech-watch.sh
# Драйвер-мост живёт постоянно (порт 9223) и следит за очередью и стоп-флагом.
# Claude запускается параллельно (его сервер встаёт на 9224 — плагин подхватывает сам).
# Кнопка Stop в плагине теперь УБИВАЕТ процесс Claude за пару секунд.

DIR="$(cd "$(dirname "$0")/.." && pwd)"
CMD=/tmp/hrtech-cmds
mkdir -p "$CMD"
CPID=""

# ── Надёжный поиск node и claude ─────────────────────────────────────────────
# LaunchAgent стартует с урезанным PATH; node/claude часто лежат в nvm/fnm/volta/
# asdf/~/.local/bin/~/.claude — которых там нет. Без этого демон молча падает на
# «nohup: node: No such file or directory» и мост не поднимается. Дополняем PATH
# известными местами и резолвим абсолютные пути (само-лечится без правки plist).
for _d in \
  /opt/homebrew/bin /usr/local/bin \
  "$HOME/.local/bin" "$HOME/bin" "$HOME/.claude/local" \
  "$HOME/.volta/bin" "$HOME/.asdf/shims" \
  "$HOME"/.nvm/versions/node/*/bin \
  "$HOME"/.local/share/fnm/node-versions/*/installation/bin \
  "$HOME"/n/bin /usr/local/n/versions/node/*/bin \
  /usr/bin /bin; do
  [ -d "$_d" ] || continue
  case ":$PATH:" in *":$_d:"*) ;; *) PATH="$PATH:$_d" ;; esac
done
export PATH
NODE_BIN="$(command -v node 2>/dev/null || echo node)"
CLAUDE_BIN="$(command -v claude 2>/dev/null || echo claude)"
echo "· node=$NODE_BIN  claude=$CLAUDE_BIN"

# Знание (команды, база, скилы) подключается при каждом старте помощника. Инструкции
# «сделай git pull и запусти линковку» никто не читает, а помощник стартует сам при входе
# в систему — поэтому новый скил доезжает без единого действия дизайнера.
bash "$DIR/scripts/link-knowledge.sh" >/dev/null 2>&1 || true

start_driver() {
  if ! pgrep -f hrtech-driver.mjs >/dev/null; then
    nohup "$NODE_BIN" "$DIR/scripts/hrtech-driver.mjs" >/tmp/hrtech-driver.log 2>&1 &
    sleep 3
  fi
}

cat > "$CMD/_watch_tpl.json" <<'EOF'
{"tool":"figma_execute","args":{"timeout":15000,"code":"const r=figma.root.getSharedPluginData('hrtech','task_queue');const q=r?JSON.parse(r):[];return {n: q.length, act: q[0]?q[0].action:'', stop: figma.root.getSharedPluginData('hrtech','stop')||''};"}}
EOF
cat > "$CMD/_clear_status.json" <<'EOF'
{"tool":"figma_execute","args":{"timeout":15000,"code":"figma.root.setSharedPluginData('hrtech','status',''); figma.root.setSharedPluginData('hrtech','stop',''); const r=figma.root.getSharedPluginData('hrtech','task_queue'); if(r){const q=JSON.parse(r); q.shift(); figma.root.setSharedPluginData('hrtech','task_queue', q.length?JSON.stringify(q):'');} return {ok:true};"}}
EOF

poll() {
  RES=$("$DIR/scripts/hrtech-call.sh" "$CMD/_watch_tpl.json" 25 2>/dev/null)
  N=$(echo "$RES" | grep -o '\\"n\\":[0-9]*' | grep -o '[0-9]*$' | head -1)
  STOP=$(echo "$RES" | grep -o '\\"stop\\":\\"1' | head -1)
  ACT=$(echo "$RES" | grep -o '\\"act\\":\\"[a-z-]*' | sed 's/.*"//' | head -1)
}

claude_running() { [ -n "$CPID" ] && kill -0 "$CPID" 2>/dev/null; }

echo "── HR TECH DESIGN · auto-runner v2 (hard stop) ──"
echo "Жду задачи из плагина. Плагин в Figma должен быть открыт (Activate Bridge)."
start_driver

while true; do
  start_driver
  poll

  if claude_running && [ -n "$RUN_START" ] && [ $(( $(date +%s) - RUN_START )) -gt 180 ]; then
    EXEC_NOW=$(grep " START " /tmp/hrtech-exec.log 2>/dev/null | grep -cv "task_queue');return {n:" || echo 0)
    if [ "$EXEC_NOW" = "$EXEC_BASE" ]; then
      echo "$(date +%H:%M:%S) · Claude 3 мин без вызовов моста (похоже на rate-limit) — убиваю"
      kill "$CPID" 2>/dev/null; sleep 2; kill -9 "$CPID" 2>/dev/null
      CPID=""
      cat > "$CMD/_err_status.json" <<'EOF3'
{"tool":"figma_execute","args":{"timeout":15000,"code":"figma.root.setSharedPluginData('hrtech','status', JSON.stringify({state:'error', label:'Claude API rate-limited — limits exhausted, try later'})); return {ok:true};"}}
EOF3
      "$DIR/scripts/hrtech-call.sh" "$CMD/_err_status.json" 20 >/dev/null 2>&1
      sleep 60
      continue
    fi
  fi
  if claude_running && [ -n "$RUN_START" ] && [ $(( $(date +%s) - RUN_START )) -gt 1500 ]; then
    echo "$(date +%H:%M:%S) · ТАЙМАУТ 25 мин — убиваю Claude (pid $CPID)"
    kill "$CPID" 2>/dev/null; sleep 2; kill -9 "$CPID" 2>/dev/null
    CPID=""
    "$DIR/scripts/hrtech-call.sh" "$CMD/_clear_status.json" 20 >/dev/null 2>&1
    continue
  fi

  if [ -n "$STOP" ]; then
    if claude_running; then
      echo "$(date +%H:%M:%S) · STOP — убиваю Claude (pid $CPID)"
      kill "$CPID" 2>/dev/null; sleep 2; kill -9 "$CPID" 2>/dev/null
      CPID=""
    fi
    # чистим статус/флаг и снимаем прерванную задачу; плагин может быть занят — ретраим
    for t in 1 2 3 4 5 6 7 8 9 10 11 12; do
      R=$("$DIR/scripts/hrtech-call.sh" "$CMD/_clear_status.json" 20 2>/dev/null)
      if echo "$R" | grep -q '"ok":true'; then
        echo "$(date +%H:%M:%S) · остановлено: статус очищен, задача снята из очереди"
        break
      fi
      sleep 4
    done
    sleep 2
    continue
  fi

  if ! claude_running && [ -n "$N" ] && [ "$N" -gt 0 ] 2>/dev/null; then
    # Пикер модели убран из виджета в 2.1 — модель выбирается по типу задачи.
    case "$ACT" in
      fix-spelling) M="haiku" ;;
      *) M="sonnet" ;;
    esac
    echo "$(date +%H:%M:%S) · в очереди: $N — запускаю Claude ($M)"
    cd "$DIR" || true
    "$CLAUDE_BIN" -p "/hrtech" --model "$M" --settings '{"effortLevel":"medium"}' --allowedTools "mcp__figma-hrtech__*,Bash(sleep:*)" >> /tmp/hrtech-claude.log 2>&1 &
    CPID=$!
    # Если claude не нашёлся в PATH, процесс умирает мгновенно, а помощник до этой правки
    # молча крутил перезапуск каждые три секунды. Теперь проверяем и говорим вслух.
    sleep 1
    if ! kill -0 "$CPID" 2>/dev/null; then
      echo "$(date +%H:%M:%S) · claude не запустился ($CLAUDE_BIN). Проверь установку Claude Code."
      CPID=""
      sleep 30
      continue
    fi
    RUN_START=$(date +%s)
    EXEC_BASE=$(grep " START " /tmp/hrtech-exec.log 2>/dev/null | grep -cv "task_queue');return {n:" || echo 0)
  fi

  if claude_running; then sleep 2; else sleep 3; fi
done
