#!/bin/bash
# LexMind 法律合规 AI 助手 - 启动脚本

PROJECT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$PROJECT_DIR"

echo ""
echo "  ⚖️  LexMind 法律合规 AI 助手"
echo "  ━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

# 检查 Ollama
if ! command -v ollama &> /dev/null; then
    echo "  ❌ 未找到 Ollama，请先安装: https://ollama.ai"
    exit 1
fi

# 检查模型
if ! ollama list | grep -q "deepseek-r1"; then
    echo "  ⚠️  未找到 deepseek-r1 模型，正在拉取..."
    ollama pull deepseek-r1:8b
fi

# 检查 Ollama 服务
if ! curl -s http://localhost:11434/api/tags > /dev/null 2>&1; then
    echo "  🚀 启动 Ollama 服务..."
    ollama serve &
    sleep 3
fi

echo "  ✅ Ollama 已就绪"
echo "  🚀 启动 Web 服务..."
echo ""
echo "  📍 访问地址: http://localhost:8000"
echo ""

python3 -m uvicorn backend.main:app \
    --host 0.0.0.0 \
    --port 8000 \
    --reload \
    --log-level info
