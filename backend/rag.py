"""
RAG 检索增强生成模块
使用 ChromaDB 作为向量数据库，sentence-transformers 进行文本向量化
"""
import os
import re
import chromadb
from chromadb.utils import embedding_functions
from pathlib import Path
import logging

logger = logging.getLogger(__name__)

# 数据目录
BASE_DIR = Path(__file__).parent
CHROMA_DIR = BASE_DIR / "chroma_db"
DOCS_DIR = BASE_DIR / "knowledge_base"

# 确保目录存在
CHROMA_DIR.mkdir(exist_ok=True)
DOCS_DIR.mkdir(exist_ok=True)

# 使用轻量级多语言模型（支持中文）
EMBEDDING_MODEL = "paraphrase-multilingual-MiniLM-L12-v2"


def get_embedding_function():
    """获取嵌入函数（使用本地 sentence-transformers）"""
    return embedding_functions.SentenceTransformerEmbeddingFunction(
        model_name=EMBEDDING_MODEL
    )


def get_collection():
    """获取或创建 ChromaDB 集合"""
    client = chromadb.PersistentClient(path=str(CHROMA_DIR))
    ef = get_embedding_function()
    collection = client.get_or_create_collection(
        name="legal_compliance",
        embedding_function=ef,
        metadata={"hnsw:space": "cosine"}
    )
    return collection


def chunk_text(text: str, chunk_size: int = 500, overlap: int = 100) -> list[str]:
    """将长文本切分为块"""
    text = re.sub(r'\n{3,}', '\n\n', text.strip())
    chunks = []
    
    # 按段落切分
    paragraphs = text.split('\n\n')
    current_chunk = ""
    
    for para in paragraphs:
        para = para.strip()
        if not para:
            continue
        
        if len(current_chunk) + len(para) <= chunk_size:
            current_chunk += "\n\n" + para if current_chunk else para
        else:
            if current_chunk:
                chunks.append(current_chunk.strip())
            # 如果单段落超过 chunk_size，按句子切分
            if len(para) > chunk_size:
                sentences = re.split(r'(?<=[。！？\.\!\?])', para)
                sent_chunk = ""
                for sent in sentences:
                    if len(sent_chunk) + len(sent) <= chunk_size:
                        sent_chunk += sent
                    else:
                        if sent_chunk:
                            chunks.append(sent_chunk.strip())
                        sent_chunk = sent
                if sent_chunk:
                    current_chunk = sent_chunk
                else:
                    current_chunk = ""
            else:
                current_chunk = para
    
    if current_chunk:
        chunks.append(current_chunk.strip())
    
    return [c for c in chunks if len(c) > 20]


def add_document(content: str, source: str, doc_type: str = "legal") -> int:
    """将文档添加到向量数据库"""
    collection = get_collection()
    chunks = chunk_text(content)
    
    if not chunks:
        return 0
    
    # 检查已存在的文档，避免重复
    existing = collection.get(where={"source": source})
    if existing["ids"]:
        logger.info(f"文档 {source} 已存在，跳过")
        return 0
    
    ids = [f"{source}_{i}" for i in range(len(chunks))]
    metadatas = [{"source": source, "doc_type": doc_type, "chunk_idx": i} 
                 for i in range(len(chunks))]
    
    collection.add(
        documents=chunks,
        ids=ids,
        metadatas=metadatas
    )
    
    logger.info(f"成功添加文档 {source}，共 {len(chunks)} 个片段")
    return len(chunks)


def search(query: str, n_results: int = 5) -> list[dict]:
    """检索相关法律条文"""
    collection = get_collection()
    
    # 检查集合是否有数据
    count = collection.count()
    if count == 0:
        return []
    
    results = collection.query(
        query_texts=[query],
        n_results=min(n_results, count),
        include=["documents", "metadatas", "distances"]
    )
    
    if not results["documents"][0]:
        return []
    
    retrieved = []
    for doc, meta, dist in zip(
        results["documents"][0],
        results["metadatas"][0],
        results["distances"][0]
    ):
        # 过滤低相似度结果（余弦距离 > 0.8 表示不相关）
        if dist < 0.8:
            retrieved.append({
                "content": doc,
                "source": meta.get("source", "未知"),
                "distance": dist
            })
    
    return retrieved


def get_stats() -> dict:
    """获取知识库统计"""
    try:
        collection = get_collection()
        count = collection.count()
        
        # 获取所有来源及其片段数
        if count > 0:
            all_data = collection.get(include=["metadatas"])
            source_chunks: dict = {}
            for m in all_data["metadatas"]:
                src = m.get("source", "")
                doc_type = m.get("doc_type", "unknown")
                if src not in source_chunks:
                    source_chunks[src] = {"source": src, "chunks": 0, "doc_type": doc_type}
                source_chunks[src]["chunks"] += 1
            sources_list = list(source_chunks.values())
            sources = [s["source"] for s in sources_list]
        else:
            sources_list = []
            sources = []
        
        return {
            "total_chunks": count,
            "documents": sources,
            "document_count": len(sources),
            "documents_detail": sources_list
        }
    except Exception as e:
        return {"total_chunks": 0, "documents": [], "document_count": 0, "documents_detail": []}


def delete_document(source: str) -> bool:
    """从知识库中删除指定来源的所有片段"""
    collection = get_collection()
    
    try:
        existing = collection.get(where={"source": source})
        if not existing["ids"]:
            return False  # 文档不存在
        
        collection.delete(where={"source": source})
        logger.info(f"已删除文档 '{source}'，共 {len(existing['ids'])} 个片段")
        return True
    except Exception as e:
        logger.error(f"删除文档失败: {e}")
        raise


def load_builtin_docs():
    """加载内置法律文档到知识库"""
    builtin_docs = get_builtin_legal_docs()
    
    total = 0
    for doc in builtin_docs:
        count = add_document(doc["content"], doc["source"], doc["type"])
        total += count
    
    return total


def get_builtin_legal_docs() -> list[dict]:
    """内置法律合规文档库"""
    return [
        {
            "source": "公司法2023",
            "type": "公司法",
            "content": """中华人民共和国公司法（2023年修订版）核心条款

第一章 总则

第一条 为了规范公司的组织和行为，保护公司、股东和债权人的合法权益，维护社会经济秩序，促进社会主义市场经济的发展，制定本法。

第二条 本法所称公司是指依照本法在中国境内设立的有限责任公司和股份有限公司。

第三条 公司是企业法人，有独立的法人财产，享有法人财产权。公司以其全部财产对公司的债务承担责任。
有限责任公司的股东以其认缴的出资额为限对公司承担责任；股份有限公司的股东以其认购的股份为限对公司承担责任。

第四条 公司股东依法享有资产收益、参与重大决策和选择管理者等权利。

第五条 公司从事经营活动，必须遵守法律、行政法规，遵守社会公德、商业道德，诚实守信，接受政府和社会公众的监督，承担社会责任。

第二章 有限责任公司的设立和组织机构

第二十三条 设立有限责任公司，应当具备下列条件：
（一）股东符合法定人数；
（二）有符合公司章程规定的全体股东认缴的出资额；
（三）股东共同制定公司章程；
（四）有公司名称，建立符合有限责任公司要求的组织机构；
（五）有公司住所。

第二十四条 有限责任公司由五十个以下股东出资设立。

第二十五条 有限责任公司注册资本为在公司登记机关登记的全体股东认缴的出资额。全体股东认缴的出资额由股东按照公司章程的规定自公司成立之日起五年内缴足。

第三章 股东权利与义务

第四十九条 股东会行使下列职权：
（一）决定公司的经营方针和投资计划；
（二）选举和更换非由职工代表担任的董事、监事，决定有关董事、监事的报酬事项；
（三）审议批准董事会的报告；
（四）审议批准监事会或者监事的报告；
（五）审议批准公司的年度财务预算方案、决算方案；
（六）审议批准公司的利润分配方案和弥补亏损方案；
（七）对公司增加或者减少注册资本作出决议；
（八）对发行公司债券作出决议；
（九）对公司合并、分立、解散、清算或者变更公司形式作出决议；
（十）修改公司章程；
（十一）公司章程规定的其他职权。"""
        },
        {
            "source": "劳动法合规指南",
            "type": "劳动法",
            "content": """劳动法合规核心要点

一、劳动合同管理合规

1. 签订要求：用人单位自用工之日起即与劳动者建立劳动关系。建立劳动关系，应当订立书面劳动合同。已建立劳动关系，未同时订立书面劳动合同的，应当自用工之日起一个月内订立书面劳动合同。

2. 试用期规定：
- 劳动合同期限三个月以上不满一年的，试用期不得超过一个月
- 劳动合同期限一年以上不满三年的，试用期不得超过二个月
- 三年以上固定期限和无固定期限的劳动合同，试用期不得超过六个月
- 同一用人单位与同一劳动者只能约定一次试用期

3. 违法后果：用人单位违反本法规定不与劳动者订立无固定期限劳动合同的，自应当订立无固定期限劳动合同之日起向劳动者每月支付二倍的工资。

二、工资薪酬合规

1. 最低工资：用人单位支付劳动者的工资不得低于当地最低工资标准。

2. 加班工资：
- 安排劳动者延长工作时间的，支付不低于工资的150%的工资报酬
- 休息日安排劳动者工作又不能安排补休的，支付不低于工资200%的工资报酬
- 法定休假日安排劳动者工作的，支付不低于工资300%的工资报酬

3. 工资发放：工资应当以货币形式按月支付给劳动者本人，不得克扣或者无故拖欠劳动者的工资。

三、社会保险合规

1. 五险一金：用人单位和劳动者必须依法参加社会保险，缴纳社会保险费，包括：养老保险、医疗保险、失业保险、工伤保险、生育保险，以及住房公积金。

2. 合规要点：
- 用人单位应当自成立之日起三十日内依法向社会保险经办机构申请办理社会保险登记
- 应当自用工之日起三十日内为其职工向社会保险经办机构申请办理社会保险登记

四、辞退解雇合规

1. 合法解除情形（用人单位可单方解除劳动合同）：
- 在试用期间被证明不符合录用条件的
- 严重违反用人单位的规章制度
- 严重失职，营私舞弊，给用人单位造成重大损害
- 劳动者同时与其他用人单位建立劳动关系，对完成本单位的工作任务造成严重影响
- 以欺诈、胁迫手段订立劳动合同的

2. 经济补偿：
- 每满一年支付一个月工资的标准向劳动者支付经济补偿
- 六个月以上不满一年的，按一年计算
- 不满六个月的，向劳动者支付半个月工资的经济补偿"""
        },
        {
            "source": "数据安全法合规指南",
            "type": "数据安全",
            "content": """数据安全法及个人信息保护法合规要点

一、数据安全法（2021年9月1日施行）

1. 数据分类分级：
- 国家建立数据分类分级保护制度，根据数据在经济社会发展中的重要程度，以及一旦遭到篡改、破坏、泄露或者非法获取、非法利用，对国家安全、公共利益或者个人权益造成的危害程度，对数据实行分类分级保护
- 重要数据：各地区、各部门应当按照数据分类分级保护制度，确定本地区、本部门以及相关行业、领域的重要数据具体目录

2. 数据安全义务：
- 开展数据处理活动，应当依照法律、法规的规定，建立健全全流程数据安全管理制度
- 加强数据安全风险监测，发现数据安全缺陷、漏洞等风险时，应当立即采取补救措施

3. 数据出境：
- 重要数据的处理者应当按照国家有关规定对其数据处理活动定期开展风险评估
- 关键信息基础设施的运营者在境内运营中收集和产生的重要数据的出境安全管理，适用《网络安全法》的规定

二、个人信息保护法（2021年11月1日施行）

1. 处理个人信息的原则：
- 合法、正当、必要和诚信原则
- 目的明确原则：处理个人信息应当具有明确、合理的目的，并应当与处理目的直接相关
- 最小必要原则：采取对个人权益影响最小的方式处理个人信息

2. 同意要求：
- 处理个人信息应当取得个人同意，同意应当由个人在充分知情的前提下自愿、明确作出
- 处理敏感个人信息（生物识别、医疗健康、金融账户、行踪轨迹等）需取得个人的单独同意

3. 个人权利：
- 知情权和决定权：个人对其个人信息的处理享有知情权、决定权
- 查阅复制权：个人有权向个人信息处理者查阅、复制其个人信息
- 更正补充权：个人发现其个人信息不准确或者不完整的，有权请求个人信息处理者更正、补充
- 删除权：在法定情形下，个人可以向个人信息处理者请求删除其个人信息

4. 违规处罚：
- 情节较重的：由省级以上履行个人信息保护职责的部门责令改正，没收违法所得，并处五千万元以下或者上一年度营业额百分之五以下罚款
- 对直接负责的主管人员和其他直接责任人员处以十万元以上一百万元以下的罚款

三、网络安全法合规

1. 网络安全等级保护制度：
- 国家对网络实行等级保护制度，网络运营者应当按照网络安全等级保护制度的要求，履行安全保护义务
- 第三级及以上的等保要求等级保护测评，测评周期通常为每年一次

2. 用户信息保护：
- 网络运营者不得收集与其提供的服务无关的个人信息
- 不得违反法律、行政法规的规定和双方的约定收集、使用个人信息
- 应当严格保密，并不得向他人出售或者非法提供"""
        },
        {
            "source": "合同法合规指南",
            "type": "合同法",
            "content": """合同法（民法典合同编）合规要点

一、合同订立规范

1. 要约与承诺：
- 合同成立的要件：一方当事人的要约（Offer）被另一方当事人承诺（Acceptance）
- 要约到达受要约人时生效
- 承诺应当在要约确定的期限内到达要约人

2. 合同形式要求：
- 当事人订立合同，可以采用书面形式、口头形式或者其他形式
- 法律、行政法规规定采用书面形式的，应当采用书面形式
- 建设工程合同、技术开发合同、融资租赁合同等，法律要求必须采用书面形式

3. 无效合同情形：
- 无民事行为能力人实施的民事法律行为无效
- 行为人与相对人以虚假的意思表示实施的民事法律行为无效
- 违反法律、行政法规的强制性规定的民事法律行为无效
- 违背公序良俗的民事法律行为无效

二、合同履行与违约

1. 违约责任：
- 当事人一方不履行合同义务或者履行合同义务不符合约定的，应当承担继续履行、采取补救措施或者赔偿损失等违约责任
- 当事人可以约定一方违约时应当根据违约情况向对方支付一定数额的违约金

2. 合同解除：
- 法定解除权：不可抗力致使不能实现合同目的、拒绝履行主要债务、迟延履行主要债务经催告后在合理期限内仍未履行
- 合同解除后，尚未履行的，终止履行；已经履行的，根据履行情况和合同性质，当事人可以要求恢复原状、采取其他补救措施，并有权请求赔偿损失

三、格式条款与消费者保护

1. 格式条款规范：
- 提供格式条款的一方应当遵循公平原则确定当事人之间的权利和义务，并采取合理的方式提示对方注意免除或者减轻其责任等与对方有重大利害关系的条款
- 格式条款具有本法第一百四十七条至第一百五十一条规定情形的，或者提供格式条款一方排除对方主要权利的，该条款无效

2. 免责条款限制：
- 造成对方人身损害的免责条款无效
- 因故意或者重大过失造成对方财产损失的免责条款无效"""
        },
        {
            "source": "知识产权合规指南",
            "type": "知识产权",
            "content": """知识产权合规核心要点

一、商标合规

1. 商标注册：
- 商标注册申请人应当就其生产、制造、加工、拣选或者经销的商品或者其提供的服务项目，申请注册商标
- 注册商标的有效期为十年，自核准注册之日起计算，到期续展

2. 侵权行为：
- 未经商标注册人的许可，在同一种商品上使用与其注册商标相同的商标的
- 未经商标注册人的许可，在同一种商品上使用与其注册商标近似的商标，或者在类似商品上使用与其注册商标相同或者近似的商标，容易导致混淆的
- 销售侵犯注册商标专用权的商品的

3. 侵权赔偿：
- 赔偿数额按照权利人因被侵权所受到的实际损失确定
- 实际损失难以确定的，可以按照侵权人因侵权所获得的利益确定
- 恶意侵犯商标专用权，情节严重的，可以在按照上述方法确定数额的一倍以上五倍以下确定赔偿数额

二、著作权合规

1. 著作权保护范围：
- 文字作品、口述作品、音乐作品、戏剧作品、曲艺作品、舞蹈作品、杂技艺术作品
- 美术作品、建筑作品、摄影作品、视听作品
- 计算机软件、图形作品、模型作品

2. 合理使用：
- 为个人学习、研究或者欣赏，使用他人已经发表的作品
- 为介绍、评论某一作品或者说明某一问题，在作品中适当引用他人已经发表的作品
- 注意：商业使用不在合理使用范围内，必须取得授权

三、专利合规

1. 专利类型：
- 发明专利：保护期二十年，技术方案必须具有新颖性、创造性和实用性
- 实用新型专利：保护期十年，针对产品的形状、构造或其结合
- 外观设计专利：保护期十五年，针对产品的形状、图案或其结合以及色彩

2. 专利侵权规避：
- 在研发和产品设计阶段应进行专利检索，避免侵犯他人专利
- 建立专利预警机制，定期监控竞争对手专利申请情况"""
        },
        {
            "source": "税务合规指南",
            "type": "税法",
            "content": """企业税务合规核心要点

一、增值税合规

1. 增值税税率：
- 一般纳税人提供财货（销售货物或特定应税服务）：13%（基本税率）
- 提供部分服务（交通运输、建筑等）：9%
- 提供现代服务、金融服务、非不动产处置：6%
- 小规模纳税人：一般适用3%征收率（阶段性减按1%）

2. 进项税额抵扣：
- 取得增值税专用发票上注明的增值税额
- 取得海关进口增值税专用缴款书上注明的增值税额
- 购进农产品，除取得增值税专用发票或海关进口增值税专用缴款书外，按照农产品收购发票或者销售发票上注明的农产品买价和9%的扣除率计算的进项税额

3. 虚开发票风险：
- 虚开增值税专用发票构成犯罪，处三年以下有期徒刑或者拘役，并处二万元以上二十万元以下罚金
- 虚开数额较大的，处三年以上十年以下有期徒刑，并处五万元以上五十万元以下罚金

二、企业所得税合规

1. 税率：
- 法定税率：25%
- 高新技术企业：15%
- 小型微利企业（年应纳税所得额不超过300万元）：适用优惠税率

2. 税前扣除要点：
- 企业实际发生的与取得收入有关的、合理的支出，包括成本、费用、税金、损失和其他支出，准予在计算应纳税所得额时扣除
- 企业发生的公益性捐赠支出，在年度利润总额12%以内的部分，准予在计算应纳税所得额时扣除

三、个人所得税合规（雇主责任）

1. 代扣代缴义务：
- 扣缴义务人每月或者每次预扣、代扣的税款，应当在次月十五日内缴入国库，并向税务机关报送扣缴个人所得税申报表

2. 专项附加扣除：
- 子女教育、继续教育、大病医疗、住房贷款利息或住房租金、赡养老人
- 用人单位应当配合员工申请专项附加扣除，不得以任何方式阻挠"""
        }
    ]
