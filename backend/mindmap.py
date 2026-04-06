"""
思维导图生成模块
将 AI 回答转化为 Markdown 层级格式，供 Markmap.js 渲染
"""
import re
from backend.llm import simple_chat


MINDMAP_PROMPT_TEMPLATE = """请将以下法律合规问答内容整理成思维导图格式。

要求：
1. 使用 Markdown 标题层级格式（# ## ### ####）
2. 根节点（#）：问题的核心主题
3. 二级节点（##）：主要法律概念或分类（3-6个）
4. 三级节点（###）：具体法律条文、要求或细节
5. 四级节点（####）：补充说明或注意事项（可选）
6. 节点内容简洁，每个节点不超过20个字
7. 直接输出 Markdown，不要包含任何解释文字

问题：{question}

回答内容：
{answer}

请输出思维导图的 Markdown 格式："""


async def generate_mindmap(question: str, answer: str) -> str:
    """生成思维导图的 Markdown 数据"""
    
    prompt = MINDMAP_PROMPT_TEMPLATE.format(
        question=question,
        answer=answer
    )
    
    result = await simple_chat(prompt)
    
    # 提取 Markdown 内容（去除代码块标记等）
    result = extract_markdown(result)
    
    # 确保有根节点
    if not result.startswith("#"):
        # 尝试从问题生成根节点
        topic = question[:30] + ("..." if len(question) > 30 else "")
        result = f"# {topic}\n\n" + result
    
    return result


def extract_markdown(text: str) -> str:
    """从 AI 回答中提取 Markdown 内容"""
    
    # 移除 <think> 标签（DeepSeek R1 特有的思考过程）
    text = re.sub(r'<think>.*?</think>', '', text, flags=re.DOTALL)
    
    # 移除 ```markdown 代码块标记
    text = re.sub(r'```(?:markdown|md)?\s*\n?', '', text)
    text = re.sub(r'```\s*$', '', text)
    
    # 清理多余空行
    text = re.sub(r'\n{3,}', '\n\n', text)
    
    return text.strip()


def validate_mindmap_markdown(markdown: str) -> bool:
    """验证 Markdown 是否适合思维导图渲染"""
    lines = markdown.strip().split('\n')
    has_h1 = any(line.startswith('# ') and not line.startswith('## ') for line in lines)
    has_content = len([l for l in lines if l.strip()]) > 2
    return has_h1 and has_content


def create_fallback_mindmap(question: str, answer: str) -> str:
    """当 AI 生成失败时的备用思维导图"""
    topic = question[:40] + ("..." if len(question) > 40 else "")
    
    # 简单提取回答中的要点
    lines = answer.split('\n')
    points = []
    for line in lines:
        line = line.strip()
        if line and (line.startswith(('•', '-', '1', '2', '3', '4', '5', '（')) or 
                     ('：' in line and len(line) < 50)):
            points.append(line[:40])
        if len(points) >= 6:
            break
    
    md = f"# {topic}\n\n"
    
    if points:
        md += "## 核心要点\n\n"
        for p in points[:3]:
            md += f"### {p}\n\n"
        
        if len(points) > 3:
            md += "## 补充说明\n\n"
            for p in points[3:6]:
                md += f"### {p}\n\n"
    else:
        md += "## 法律依据\n\n### 相关法律条文\n\n"
        md += "## 合规建议\n\n### 操作指南\n\n"
        md += "## 风险提示\n\n### 注意事项\n\n"
    
    return md
