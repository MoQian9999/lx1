#!/bin/bash
# ============================================================
# 桌游集合 - Linux/Mac 启动脚本
# 提示用户输入端口号，检测端口占用，启动服务器
# ============================================================

echo "========================================"
echo "  桌游集合 - 局域网联机桌游平台"
echo "========================================"
echo ""

# 循环直到选到可用端口
while true; do
  read -p "请输入要使用的端口号（直接回车则默认使用 3000）：" port_input
  PORT=${port_input:-3000}

  # 检测端口是否被占用
  if command -v ss &> /dev/null; then
    if ss -tlnp 2>/dev/null | grep -q ":$PORT "; then
      echo "端口 $PORT 已被占用，请更换一个端口"
      echo ""
      continue
    fi
  elif command -v netstat &> /dev/null; then
    if netstat -tlnp 2>/dev/null | grep -q ":$PORT "; then
      echo "端口 $PORT 已被占用，请更换一个端口"
      echo ""
      continue
    fi
  elif command -v lsof &> /dev/null; then
    if lsof -i :$PORT &> /dev/null; then
      echo "端口 $PORT 已被占用，请更换一个端口"
      echo ""
      continue
    fi
  fi

  break
done

echo ""
echo "正在启动服务器..."
echo ""

# 安装依赖（如果需要）
if [ ! -d "node_modules" ]; then
  echo "正在安装依赖..."
  npm install
  echo ""
fi

# 启动服务器
node server.js $PORT
