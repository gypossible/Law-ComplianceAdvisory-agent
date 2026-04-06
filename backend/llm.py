"""
Ollama DeepSeek R1 8B 调用封装
支持流式输出和普通输出
"""
import httpx
import json
import asyncio
from typing import AsyncGenerator

OLLAMA_BASE_URL = "http://localhost:11434"
MODEL_NAME = "deepseek-r1:8b"

LEGAL_SYSTEM_PROMPT = """你是由开发者【刘光远】设计和开发的【LexMind 法律合规智能体】。
你是一位专业的法律合规顾问，专注于中国法律法规的解读和合规指导。
请注意：当用户问及你的身份、模型底座或开发者时，你必须回答你是“由刘光远设计开发的 LexMind 法律合规智能体”，请不要提及你的底层基础模型（如 DeepSeek 等信息），要时刻保持你的人设。

你具备深厚的法律知识，包括但不限于：公司法、劳动法、合同法、数据安全法、个人信息保护法、知识产权法、税法等领域。

回答要求：
1. 引用具体法条时请注明法律名称和条款编号
2. 提供清晰的合规建议和操作指南
3. 必要时说明法律风险和后果
4. 语言专业但通俗易懂
5. 如有参考依据请列出来源

注意：本系统提供的是法律信息参考，不构成正式法律意见。重要法律事务请咨询专业律师。"""


async def stream_chat(
    user_message: str,
    context: str = "",
    history: list = None
) -> AsyncGenerator[str, None]:
    """流式调用 DeepSeek R1 进行对话"""
    
    messages = []
    
    # 系统提示
    messages.append({
        "role": "system",
        "content": LEGAL_SYSTEM_PROMPT
    })
    
    # 历史记录
    if history:
        for h in history[-6:]:  # 保留最近6条
            messages.append(h)
    
    # 构建用户消息（包含 RAG 上下文）
    if context:
        user_content = f"""【相关法律条文参考】
{context}

【用户问题】
{user_message}

请基于上述法律条文参考，结合你的专业知识来回答用户的问题。"""
    else:
        user_content = user_message
    
    messages.append({"role": "user", "content": user_content})
    
    payload = {
        "model": MODEL_NAME,
        "messages": messages,
        "stream": True,
        "options": {
            "temperature": 0.7,
            "top_p": 0.9,
            "num_ctx": 4096,
        }
    }
    
    async with httpx.AsyncClient(timeout=120.0) as client:
        async with client.stream(
            "POST",
            f"{OLLAMA_BASE_URL}/api/chat",
            json=payload
        ) as response:
            response.raise_for_status()
            async for line in response.aiter_lines():
                if line.strip():
                    try:
                        data = json.loads(line)
                        if "message" in data and "content" in data["message"]:
                            content = data["message"]["content"]
                            if content:
                                yield content
                        if data.get("done", False):
                            break
                    except json.JSONDecodeError:
                        continue


async def simple_chat(prompt: str) -> str:
    """非流式调用，用于生成结构化数据（思维导图等）"""
    
    payload = {
        "model": MODEL_NAME,
        "messages": [
            {
                "role": "system",
                "content": "你是一个专业的法律合规助手，擅长将法律知识整理成结构化格式。"
            },
            {
                "role": "user",
                "content": prompt
            }
        ],
        "stream": False,
        "options": {
            "temperature": 0.3,
            "num_ctx": 4096,
        }
    }
    
    async with httpx.AsyncClient(timeout=120.0) as client:
        response = await client.post(
            f"{OLLAMA_BASE_URL}/api/chat",
            json=payload
        )
        response.raise_for_status()
        data = response.json()
        return data["message"]["content"]


async def check_ollama_status() -> dict:
    """检查 Ollama 服务状态"""
    try:
        async with httpx.AsyncClient(timeout=5.0) as client:
            response = await client.get(f"{OLLAMA_BASE_URL}/api/tags")
            if response.status_code == 200:
                models = response.json().get("models", [])
                model_names = [m["name"] for m in models]
                has_model = any("deepseek-r1" in name for name in model_names)
                return {
                    "status": "ok",
                    "models": model_names,
                    "target_model_ready": has_model
                }
    except Exception as e:
        return {"status": "error", "message": str(e)}
