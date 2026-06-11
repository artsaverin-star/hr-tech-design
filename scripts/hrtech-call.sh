#!/bin/bash
# Использование: hrtech-call.sh <args-file.json> [timeout_sec]
# args-file: {"tool": "figma_execute", "args": {"code": "..."}}
set -e
ID="c$(date +%s)$RANDOM"
DIR=/tmp/hrtech-cmds
TIMEOUT="${2:-90}"
cp "$1" "$DIR/$ID.cmd.json"
for ((i=0; i<TIMEOUT*2; i++)); do
  if [ -f "$DIR/$ID.res.json" ]; then
    cat "$DIR/$ID.res.json"
    rm -f "$DIR/$ID.res.json"
    exit 0
  fi
  sleep 0.5
done
echo '{"error":"timeout waiting for bridge response"}'
exit 1
