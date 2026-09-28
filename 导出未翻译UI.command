#!/bin/bash
FILE="/tmp/factory-cn-untranslated.txt"
DEST="$HOME/Desktop/factory-cn-untranslated.txt"

if [ ! -f "$FILE" ]; then
  osascript -e 'display alert "Factory CN" message "还没有扫描结果。先用 Factory 中文.command 启动 Factory，并把页面点一遍。"'
  exit 1
fi

cp "$FILE" "$DEST"
LINES="$(wc -l < "$DEST" | tr -d ' ')"
osascript -e "display notification \"已导出 ${LINES} 条未翻译 UI 到桌面。\" with title \"Factory CN\""
open -R "$DEST"
