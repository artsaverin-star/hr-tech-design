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

start_driver() {
  if ! pgrep -f hrtech-driver.mjs >/dev/null; then
    nohup node "$DIR/scripts/hrtech-driver.mjs" >/tmp/hrtech-driver.log 2>&1 &
    sleep 3
  fi
}

cat > "$CMD/_watch_tpl.json" <<'EOF'
{"tool":"figma_execute","args":{"timeout":15000,"code":"const r=figma.root.getSharedPluginData('hrtech','task_queue');const q=r?JSON.parse(r):[];return {n: q.length, act: q[0]?q[0].action:'', model: figma.root.getSharedPluginData('hrtech','model')||'', stop: figma.root.getSharedPluginData('hrtech','stop')||'', kn: figma.root.getSharedPluginData('hrtech','kn_action')||''};"}}
EOF
# Запрос текста+автора заметки (base64, чтобы не экранировать произвольный ввод)
cat > "$CMD/_kn_get.json" <<'EOF'
{"tool":"figma_execute","args":{"timeout":15000,"code":"const b=s=>btoa(unescape(encodeURIComponent(s||'')));return {a:b(figma.root.getSharedPluginData('hrtech','kn_author')),n:b(figma.root.getSharedPluginData('hrtech','kn_note'))};"}}
EOF
cat > "$CMD/_clear_status.json" <<'EOF'
{"tool":"figma_execute","args":{"timeout":15000,"code":"figma.root.setSharedPluginData('hrtech','status',''); figma.root.setSharedPluginData('hrtech','stop',''); const r=figma.root.getSharedPluginData('hrtech','task_queue'); if(r){const q=JSON.parse(r); q.shift(); figma.root.setSharedPluginData('hrtech','task_queue', q.length?JSON.stringify(q):'');} return {ok:true};"}}
EOF

poll() {
  RES=$("$DIR/scripts/hrtech-call.sh" "$CMD/_watch_tpl.json" 25 2>/dev/null)
  N=$(echo "$RES" | grep -o '\\"n\\":[0-9]*' | grep -o '[0-9]*$' | head -1)
  MODEL=$(echo "$RES" | grep -o '\\"model\\":\\"[a-z-]*' | sed 's/.*"//' | head -1)
  STOP=$(echo "$RES" | grep -o '\\"stop\\":\\"1' | head -1)
  ACT=$(echo "$RES" | grep -o '\\"act\\":\\"[a-z-]*' | sed 's/.*"//' | head -1)
  KN=$(echo "$RES" | grep -o '\\"kn\\":\\"[a-z-]*' | sed 's/.*"//' | head -1)
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

  # ── База знаний (кнопки плагина): pull / share ── (git, без Claude)
  if ! claude_running && [ -n "$KN" ]; then
    echo "$(date +%H:%M:%S) · знание: $KN"
    KN_OUT=""
    if [ "$KN" = "pull" ]; then
      KN_OUT=$("$DIR/scripts/knowledge-sync.sh" pull 2>&1 | tail -1)
    elif [ "$KN" = "share" ]; then
      GET=$("$DIR/scripts/hrtech-call.sh" "$CMD/_kn_get.json" 25 2>/dev/null)
      A64=$(echo "$GET" | grep -o '\\"a\\":\\"[A-Za-z0-9+/=]*' | sed 's/.*"//' | head -1)
      N64=$(echo "$GET" | grep -o '\\"n\\":\\"[A-Za-z0-9+/=]*' | sed 's/.*"//' | head -1)
      AUTHOR=$(printf '%s' "$A64" | base64 -d 2>/dev/null); [ -z "$AUTHOR" ] && AUTHOR="designer"
      printf '%s' "$N64" | base64 -d > /tmp/hrtech-note.txt 2>/dev/null
      KN_OUT=$("$DIR/scripts/knowledge-sync.sh" share "$AUTHOR" /tmp/hrtech-note.txt 2>&1 | tail -1)
      rm -f /tmp/hrtech-note.txt
    else
      KN_OUT="ERR: неизвестное действие ($KN)"
    fi
    STATUS_B64=$(printf '%s' "$KN_OUT" | base64 | tr -d '\n')
    cat > "$CMD/_kn_done.json" <<EOF2
{"tool":"figma_execute","args":{"timeout":15000,"code":"figma.root.setSharedPluginData('hrtech','kn_status', decodeURIComponent(escape(atob('$STATUS_B64')))); figma.root.setSharedPluginData('hrtech','kn_action',''); figma.root.setSharedPluginData('hrtech','kn_note',''); return {ok:true};"}}
EOF2
    "$DIR/scripts/hrtech-call.sh" "$CMD/_kn_done.json" 20 >/dev/null 2>&1
    echo "$(date +%H:%M:%S) · знание готово: $KN_OUT"
    sleep 1
    continue
  fi

  if ! claude_running && [ -n "$N" ] && [ "$N" -gt 0 ] 2>/dev/null; then
    M="${MODEL:-auto}"
    if [ "$M" = "auto" ] || [ -z "$M" ]; then
      case "$ACT" in
        fix-spelling) M="haiku" ;;
        *) M="sonnet" ;;
      esac
    fi
    echo "$(date +%H:%M:%S) · в очереди: $N — запускаю Claude ($M)"
    cd "$DIR" || true
    claude -p "/hrtech" --model "$M" --settings '{"effortLevel":"medium"}' --allowedTools "mcp__figma-hrtech__*,Bash(sleep:*)" >> /tmp/hrtech-claude.log 2>&1 &
    CPID=$!
    RUN_START=$(date +%s)
    EXEC_BASE=$(grep " START " /tmp/hrtech-exec.log 2>/dev/null | grep -cv "task_queue');return {n:" || echo 0)
  fi

  if claude_running; then sleep 2; else sleep 3; fi
done
