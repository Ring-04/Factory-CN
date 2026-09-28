#!/bin/bash
set -u

DIR="$(cd "$(dirname "$0")" && pwd)"
APP="/Applications/Factory.app"
PORT=9229
LOG="/tmp/factory-cn-launch.log"
INJECT_LOG="/tmp/factory-cn-inject.log"

if [ ! -d "$APP" ]; then
  osascript -e 'display alert "Factory CN" message "没有在 /Applications/Factory.app 找到 Factory。" as critical'
  exit 1
fi

osascript -e 'tell application "Factory" to quit' >/dev/null 2>&1 || true

for _ in {1..30}; do
  if ! pgrep -x "Factory" >/dev/null 2>&1; then break; fi
  sleep 0.2
done

"$APP/Contents/MacOS/Factory" \
  --remote-debugging-address=127.0.0.1 \
  --remote-debugging-port="$PORT" \
  >"$LOG" 2>&1 &

READY=0
for _ in {1..50}; do
  if curl -fsS "http://127.0.0.1:$PORT/json/version" >/dev/null 2>&1; then
    READY=1
    break
  fi
  sleep 0.2
done

if [ "$READY" -ne 1 ]; then
  osascript -e 'display alert "Factory CN" message "Factory 已启动，但本地调试接口没有就绪。查看 /tmp/factory-cn-launch.log" as critical'
  exit 2
fi

if ! command -v node >/dev/null 2>&1; then
  osascript -e 'display alert "Factory CN" message "没有找到 node。请先安装 Node.js。" as critical'
  exit 3
fi

if ! node -e 'process.exit(typeof WebSocket==="function"?0:1)' >/dev/null 2>&1; then
  DEPS="$DIR/.deps"
  if [ ! -d "$DEPS/node_modules/ws" ]; then
    echo "首次运行：正在安装补丁自己的 ws 依赖..."
    mkdir -p "$DEPS"
    npm install --silent --no-audit --no-fund --prefix "$DEPS" ws@8 || {
      osascript -e 'display alert "Factory CN" message "无法安装 ws 依赖。请确认 npm 可用。" as critical'
      exit 4
    }
  fi
  export NODE_PATH="$DEPS/node_modules"
fi

if [ -f "/tmp/factory-cn-inject.pid" ]; then
  OLD_PID="$(cat /tmp/factory-cn-inject.pid 2>/dev/null || true)"
  if [ -n "${OLD_PID:-}" ]; then kill "$OLD_PID" >/dev/null 2>&1 || true; fi
fi

: > "$INJECT_LOG"
rm -f /tmp/factory-cn-untranslated.txt

nohup node "$DIR/inject.js" >"$INJECT_LOG" 2>&1 &
echo $! > /tmp/factory-cn-inject.pid

sleep 2

if grep -q "已注入" "$INJECT_LOG" 2>/dev/null; then
  osascript -e 'display notification "Factory CN v0.8 已注入。" with title "Factory CN"'
else
  osascript -e 'display notification "Factory 已启动，汉化器正在等待界面就绪。" with title "Factory CN v0.8"'
fi

exit 0
