/**
 * LexMind - 法律合规 AI 助手
 * 前端应用逻辑
 */

// ── 状态管理 ──
const state = {
  messages: [],      // 对话历史 [{role, content}]
  isStreaming: false,
  lastQuestion: '',
  lastAnswer: '',
  useRag: true,
};

// ── DOM 引用 ──
const $ = (id) => document.getElementById(id);

const dom = {
  chatContainer: $('chatContainer'),
  welcomeScreen: $('welcomeScreen'),
  messages: $('messages'),
  userInput: $('userInput'),
  sendBtn: $('sendBtn'),
  mindmapBtn: $('mindmapBtn'),
  clearBtn: $('clearBtn'),
  ragToggle: $('ragToggle'),
  statusDot: $('statusDot'),
  statusText: $('statusText'),
  kbDocCount: $('kbDocCount'),
  kbChunkCount: $('kbChunkCount'),
  kbDocs: $('kbDocs'),
  mindmapModal: $('mindmapModal'),
  mindmapSvg: $('mindmapSvg'),
  mindmapLoading: $('mindmapLoading'),
  mindmapTitle: $('mindmapTitle'),
  sidebar: $('sidebar'),
  sidebarToggle: $('sidebarToggle'),
  currentTopic: $('currentTopic'),
  // Import Modal
  importModal: $('importModal'),
  openImportModal: $('openImportModal'),
  closeImportModal: $('closeImportModal'),
  dropZone: $('dropZone'),
  importFileInput: $('importFileInput'),
  fileQueue: $('fileQueue'),
  fileList: $('fileList'),
  fileQueueTitle: $('fileQueueTitle'),
  clearQueue: $('clearQueue'),
  importSubmitBtn: $('importSubmitBtn'),
  importProgressArea: $('importProgressArea'),
  importProgressFill: $('importProgressFill'),
  importProgressText: $('importProgressText'),
  importResults: $('importResults'),
};

// Import state
const importState = {
  files: [],  // Array of File objects
};

// ── 初始化 ──
document.addEventListener('DOMContentLoaded', () => {
  initParticles();
  checkHealth();
  setupEventListeners();
  setInterval(checkHealth, 30000);
});

// ── 粒子背景 ──
function initParticles() {
  const container = $('particles');
  const colors = ['#4f7cff', '#7c5dfa', '#2dd4a0', '#f0c040'];
  
  for (let i = 0; i < 20; i++) {
    const p = document.createElement('div');
    p.className = 'particle';
    const size = Math.random() * 4 + 2;
    const color = colors[Math.floor(Math.random() * colors.length)];
    const duration = Math.random() * 20 + 15;
    const delay = Math.random() * 10;
    const left = Math.random() * 100;
    
    p.style.cssText = `
      width: ${size}px;
      height: ${size}px;
      background: ${color};
      left: ${left}%;
      animation-duration: ${duration}s;
      animation-delay: ${delay}s;
      opacity: 0.3;
    `;
    container.appendChild(p);
  }
}

async function checkHealth() {
  try {
    const resp = await fetch('https://sara-pod-tar-dairy.trycloudflare.com/api/health');
    const data = await resp.json();
    
    if (data.ollama?.status === 'ok' && data.ollama?.target_model_ready) {
      dom.statusDot.className = 'status-dot online';
      dom.statusText.textContent = 'DeepSeek R1 8B 已就绪';
    } else {
      dom.statusDot.className = 'status-dot error';
      dom.statusText.textContent = '模型未就绪';
    }
    
    // 更新知识库统计
    const kb = data.knowledge_base || {};
    dom.kbDocCount.textContent = kb.document_count ?? 0;
    dom.kbChunkCount.textContent = kb.total_chunks ?? 0;
    
    updateKbDocs(kb.documents_detail || kb.documents || []);
    
  } catch (e) {
    dom.statusDot.className = 'status-dot error';
    dom.statusText.textContent = '服务连接失败';
  }
}

// 获取文件类型图标
function getFileIcon(source, docType) {
  const icons = {
    '公司法': '🏢',
    '劳动法': '👤',
    '数据安全': '🔒',
    '合同法': '📋',
    '知识产权': '™️',
    '税法': '💰',
    'custom': '📄',
    'legal': '⚖️',
  };
  return icons[docType] || icons['custom'];
}

function updateKbDocs(docs) {
  if (!docs || docs.length === 0) {
    dom.kbDocs.innerHTML = '<div style="font-size:10.5px;color:var(--text-muted);text-align:center;padding:8px">知识库为空</div>';
    return;
  }
  
  // docs 可能是字符串数组或对象数组
  const isDetailed = docs.length > 0 && typeof docs[0] === 'object';
  
  dom.kbDocs.innerHTML = docs.map(doc => {
    const source = isDetailed ? doc.source : doc;
    const chunks = isDetailed ? doc.chunks : '';
    const docType = isDetailed ? doc.doc_type : 'legal';
    const icon = getFileIcon(source, docType);
    const isBuiltin = ['\u516c\u53f8\u6cd5', '\u52b3\u52a8\u6cd5', '\u6570\u636e', '\u5408\u540c', '\u77e5\u8bc6', '\u7a0e\u52a1'].some(k => source.includes(k) || docType.includes(k));
    
    return `
      <div class="kb-doc-item">
        <span class="kb-doc-icon">${icon}</span>
        <div class="kb-doc-info">
          <span class="kb-doc-name" title="${source}">${source}</span>
          ${chunks ? `<span class="kb-doc-meta">${chunks} 个片段</span>` : ''}
        </div>
        ${!isBuiltin || true ? `<button class="kb-doc-delete" onclick="deleteDoc('${source}')" title="删除">✕</button>` : ''}
      </div>
    `;
  }).join('');
}

async function deleteDoc(source) {
  if (!confirm(`确定要从知识库中删除「${source}」吗？`)) return;
  
  try {
    const resp = await fetch(`https://sara-pod-tar-dairy.trycloudflare.com/api/knowledge-base/${encodeURIComponent(source)}`, {
      method: 'DELETE'
    });
    
    if (resp.ok) {
      showToast(`已删除「${source}」`, 'success');
      await checkHealth();
    } else {
      const err = await resp.json();
      showToast(err.detail || '删除失败', 'error');
    }
  } catch (e) {
    showToast('删除失败: ' + e.message, 'error');
  }
}


// ── 事件绑定 ──
function setupEventListeners() {
  // 发送消息
  dom.sendBtn.addEventListener('click', sendMessage);
  dom.userInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  });
  
  // 自适应高度
  dom.userInput.addEventListener('input', () => {
    dom.userInput.style.height = 'auto';
    dom.userInput.style.height = Math.min(dom.userInput.scrollHeight, 160) + 'px';
    dom.sendBtn.disabled = !dom.userInput.value.trim() || state.isStreaming;
  });
  
  // RAG 切换
  dom.ragToggle.addEventListener('change', (e) => {
    state.useRag = e.target.checked;
  });
  
  // 思维导图
  dom.mindmapBtn.addEventListener('click', openMindmap);
  $('closeMindmap').addEventListener('click', closeMindmap);
  $('downloadMindmap').addEventListener('click', downloadMindmap);
  dom.mindmapModal.addEventListener('click', (e) => {
    if (e.target === dom.mindmapModal) closeMindmap();
  });
  
  // 清空
  dom.clearBtn.addEventListener('click', clearChat);
  
  // 新建对话
  $('newChatBtn').addEventListener('click', clearChat);
  
  // 快速问题
  document.querySelectorAll('.quick-q').forEach(btn => {
    btn.addEventListener('click', () => {
      const q = btn.getAttribute('data-q');
      dom.userInput.value = q;
      dom.sendBtn.disabled = false;
      dom.userInput.focus();
      sendMessage();
    });
  });
  
  // 侧边栏收起
  $('sidebarToggle').addEventListener('click', toggleSidebar);
  $('menuBtn').addEventListener('click', toggleSidebar);
  
  // 导入弹窗
  setupImportModal();
}


function toggleSidebar() {
  dom.sidebar.classList.toggle('collapsed');
  $('sidebarToggle').textContent = dom.sidebar.classList.contains('collapsed') ? '›' : '‹';
}

// ── 发送消息 ──
async function sendMessage() {
  const text = dom.userInput.value.trim();
  if (!text || state.isStreaming) return;
  
  // 显示用户消息
  appendMessage('user', text);
  state.lastQuestion = text;
  state.messages.push({ role: 'user', content: text });
  
  // 重置输入
  dom.userInput.value = '';
  dom.userInput.style.height = 'auto';
  dom.sendBtn.disabled = true;
  
  // 更新标题
  dom.currentTopic.textContent = text.slice(0, 60) + (text.length > 60 ? '...' : '');
  
  // 隐藏欢迎页
  dom.welcomeScreen.style.display = 'none';
  
  // 流式输出
  await streamAIResponse(text);
}

// ── 流式 AI 响应 ──
async function streamAIResponse(question) {
  state.isStreaming = true;
  dom.mindmapBtn.disabled = true;
  
  // 创建 AI 消息容器
  const msgId = 'msg_' + Date.now();
  const msgEl = createAIMessageEl(msgId);
  dom.messages.appendChild(msgEl);
  scrollToBottom();
  
  const contentEl = msgEl.querySelector('.msg-content-inner');
  const thinkingEl = msgEl.querySelector('.thinking-content');
  const thinkingBlock = msgEl.querySelector('.thinking-block');
  
  let fullText = '';
  let thinkText = '';
  let inThinking = false;
  
  try {
    const resp = await fetch('https://sara-pod-tar-dairy.trycloudflare.com/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message: question,
        history: state.messages.slice(-10, -1),
        use_rag: state.useRag
      })
    });
    
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    
    const reader = resp.body.getReader();
    const decoder = new TextDecoder();
    
    // 移除打字指示器
    const typingEl = msgEl.querySelector('.typing');
    if (typingEl) typingEl.remove();
    
    let buffer = '';
    
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';
      
      for (const line of lines) {
        if (!line.startsWith('data: ')) continue;
        const chunk = line.slice(6);
        
        if (chunk === '[DONE]') break;
        if (chunk.startsWith('[错误]')) {
          contentEl.innerHTML = `<span style="color: var(--accent-crimson)">${chunk}</span>`;
          break;
        }
        
        fullText += chunk;
        
        // 处理 DeepSeek R1 的 <think> 标签
        const rendered = processThinking(fullText, thinkingBlock, thinkingEl, contentEl);
        if (rendered.mainText !== undefined) {
          contentEl.innerHTML = marked.parse(rendered.mainText || '▌');
        }
        
        scrollToBottom();
      }
    }
    
    // 最终渲染
    const cleanText = removeThinkingTags(fullText);
    state.lastAnswer = cleanText;
    contentEl.innerHTML = marked.parse(cleanText || '（无回答）');
    
    // 保存到历史
    state.messages.push({ role: 'assistant', content: cleanText });
    
    // 启用思维导图按钮
    dom.mindmapBtn.disabled = false;
    
    // 显示操作按钮
    showMessageActions(msgEl, question, cleanText);
    
  } catch (e) {
    contentEl.innerHTML = `<span style="color: var(--accent-crimson)">❌ 连接失败: ${e.message}</span>`;
  } finally {
    state.isStreaming = false;
    dom.sendBtn.disabled = !dom.userInput.value.trim();
  }
}

function processThinking(text, thinkingBlock, thinkingEl, contentEl) {
  const thinkStart = text.indexOf('<think>');
  const thinkEnd = text.indexOf('</think>');
  
  if (thinkStart !== -1) {
    thinkingBlock.style.display = 'block';
    
    if (thinkEnd !== -1) {
      // 思考结束
      const thinkContent = text.slice(thinkStart + 7, thinkEnd);
      thinkingEl.textContent = thinkContent;
      const mainText = text.slice(thinkEnd + 8);
      return { mainText };
    } else {
      // 还在思考中
      const thinkContent = text.slice(thinkStart + 7);
      thinkingEl.textContent = thinkContent;
      return { mainText: '' };
    }
  }
  
  return { mainText: text };
}

function removeThinkingTags(text) {
  return text
    .replace(/<think>[\s\S]*?<\/think>/g, '')
    .trim();
}

function createAIMessageEl(id) {
  const div = document.createElement('div');
  div.className = 'message ai';
  div.id = id;
  div.innerHTML = `
    <div class="avatar ai">⚖️</div>
    <div class="message-body">
      <div class="thinking-block" style="display:none">
        <div class="thinking-label">🧠 深度思考中...</div>
        <div class="thinking-content"></div>
      </div>
      <div class="message-content">
        <div class="typing">
          <div class="typing-dot"></div>
          <div class="typing-dot"></div>
          <div class="typing-dot"></div>
        </div>
        <div class="msg-content-inner"></div>
      </div>
      <div class="message-actions"></div>
    </div>
  `;
  return div;
}

function showMessageActions(msgEl, question, answer) {
  const actionsEl = msgEl.querySelector('.message-actions');
  actionsEl.innerHTML = `
    <button class="action-btn" onclick="copyText(this, \`${escapeTemplate(answer)}\`)">📋 复制</button>
    <button class="action-btn" onclick="generateMindmapFor(\`${escapeTemplate(question)}\`, \`${escapeTemplate(answer)}\`)">🗺️ 思维导图</button>
  `;
}

function escapeTemplate(str) {
  return str.replace(/`/g, '\\`').replace(/\$/g, '\\$');
}

// ── 追加用户消息 ──
function appendMessage(role, content) {
  const div = document.createElement('div');
  div.className = `message ${role}`;
  
  if (role === 'user') {
    div.innerHTML = `
      <div class="avatar user-av">👤</div>
      <div class="message-body">
        <div class="message-content">${escapeHtml(content)}</div>
      </div>
    `;
  }
  
  dom.messages.appendChild(div);
  scrollToBottom();
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.appendChild(document.createTextNode(text));
  return div.innerHTML;
}

function scrollToBottom() {
  dom.chatContainer.scrollTop = dom.chatContainer.scrollHeight;
}

// ── 复制文本 ──
async function copyText(btn, text) {
  try {
    await navigator.clipboard.writeText(text);
    btn.textContent = '✅ 已复制';
    setTimeout(() => btn.textContent = '📋 复制', 2000);
  } catch {
    showToast('复制失败', 'error');
  }
}

// ── 思维导图 ──
async function openMindmap() {
  if (!state.lastQuestion) {
    showToast("没有找到提问内容", 'error');
    return;
  }
  const answer = state.lastAnswer || '（当前AI未能正常生成总结，可能仅停留在思考阶段）';
  await generateMindmapFor(state.lastQuestion, answer);
}

async function generateMindmapFor(question, answer) {
  if (!answer || answer.trim() === '') {
    answer = '未生成有效回答内容';
  }
  
  dom.mindmapModal.classList.add('active');
  dom.mindmapLoading.style.display = 'flex';
  dom.mindmapSvg.style.display = 'none';
  dom.mindmapTitle.textContent = question.slice(0, 50) + (question.length > 50 ? '...' : '');
  
  try {
    const resp = await fetch('https://sara-pod-tar-dairy.trycloudflare.com/api/mindmap', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ question, answer })
    });
    
    const data = await resp.json();
    
    if (data.markdown) {
      renderMindmap(data.markdown);
    } else {
      throw new Error('无效的思维导图数据');
    }
    
  } catch (e) {
    dom.mindmapLoading.innerHTML = `
      <div style="color: var(--accent-crimson)">❌ 生成失败: ${e.message}</div>
    `;
  }
}

function renderMindmap(markdown) {
  dom.mindmapLoading.style.display = 'none';
  dom.mindmapSvg.style.display = 'block';
  
  // 清理 SVG
  dom.mindmapSvg.innerHTML = '';
  
  try {
    const { Markmap, Transformer } = window.markmap;
    
    // 转换 markdown 为 markmap 数据
    const transformer = new Transformer();
    const { root } = transformer.transform(markdown);
    
    // 渲染
    Markmap.create(dom.mindmapSvg, {
      color: (node) => {
        const colors = ['#4f7cff', '#7c5dfa', '#2dd4a0', '#f0c040', '#ff8c42', '#ff4e6a'];
        return colors[node.depth % colors.length];
      },
      duration: 500,
      maxWidth: 280,
      initialExpandLevel: 3,
    }, root);
    
  } catch (e) {
    console.error('Markmap render error:', e);
    dom.mindmapSvg.innerHTML = `
      <text x="50%" y="50%" text-anchor="middle" fill="#8b95b0" font-family="Inter, sans-serif" font-size="14">
        思维导图渲染失败，请重试
      </text>
    `;
  }
}

// ── 下载思维导图 ──
function downloadMindmap() {
  const svgEl = dom.mindmapSvg;
  const svgData = new XMLSerializer().serializeToString(svgEl);
  const blob = new Blob([svgData], { type: 'image/svg+xml' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'mindmap_' + Date.now() + '.svg';
  a.click();
  URL.revokeObjectURL(url);
  showToast('思维导图已导出为 SVG', 'success');
}

function closeMindmap() {
  dom.mindmapModal.classList.remove('active');
}

// ── 文件上传 ──
function handleFileUpload(e) {
  const file = e.target.files[0];
  if (file) uploadFile(file);
}

async function uploadFile(file) {
  const maxSize = 10 * 1024 * 1024; // 10MB
  if (file.size > maxSize) {
    showToast('文件大小不能超过 10MB', 'error');
    return;
  }
  
  const allowedTypes = ['.txt', '.md', '.pdf'];
  const ext = '.' + file.name.split('.').pop().toLowerCase();
  if (!allowedTypes.includes(ext)) {
    showToast('仅支持 TXT、PDF、MD 格式', 'error');
    return;
  }
  
  // 显示进度
  dom.uploadProgress.style.display = 'block';
  dom.uploadArea.querySelector('.upload-inner').style.display = 'none';
  dom.progressFill.style.width = '0%';
  dom.uploadStatus.textContent = '正在上传...';
  
  // 模拟进度
  let progress = 0;
  const progressInterval = setInterval(() => {
    progress = Math.min(progress + Math.random() * 15, 85);
    dom.progressFill.style.width = progress + '%';
  }, 200);
  
  try {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('doc_type', 'custom');
    
    const resp = await fetch('https://sara-pod-tar-dairy.trycloudflare.com/api/upload', {
      method: 'POST',
      body: formData
    });
    
    clearInterval(progressInterval);
    dom.progressFill.style.width = '100%';
    
    if (resp.ok) {
      const data = await resp.json();
      dom.uploadStatus.textContent = `✅ ${data.message}`;
      showToast(`已导入 ${file.name}（${data.chunks} 个片段）`, 'success');
      await checkHealth();
    } else {
      const err = await resp.json();
      dom.uploadStatus.textContent = `❌ ${err.detail}`;
      showToast(err.detail, 'error');
    }
    
  } catch (e) {
    clearInterval(progressInterval);
    dom.uploadStatus.textContent = '❌ 上传失败';
    showToast('上传失败: ' + e.message, 'error');
  }
  
  setTimeout(() => {
    dom.uploadProgress.style.display = 'none';
    dom.uploadArea.querySelector('.upload-inner').style.display = 'block';
    dom.progressFill.style.width = '0%';
    dom.fileInput.value = '';
  }, 2000);
}

// ── 清空对话 ──
function clearChat() {
  state.messages = [];
  state.lastQuestion = '';
  state.lastAnswer = '';
  dom.messages.innerHTML = '';
  dom.welcomeScreen.style.display = 'flex';
  dom.mindmapBtn.disabled = true;
  dom.currentTopic.textContent = '法律合规智能问答';
}

// ── Toast 通知 ──
function showToast(message, type = 'info') {
  const existing = document.querySelector('.toast');
  if (existing) existing.remove();
  
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.textContent = message;
  document.body.appendChild(toast);
  
  setTimeout(() => {
    toast.style.animation = 'toastIn 0.3s ease reverse';
    setTimeout(() => toast.remove(), 300);
  }, 3000);
}

// ──────────────────────────────────
//   导入文档弹窗
// ──────────────────────────────────

function setupImportModal() {
  // 打开
  dom.openImportModal.addEventListener('click', openImportModal);
  dom.closeImportModal.addEventListener('click', closeImportModal);
  dom.importModal.addEventListener('click', (e) => {
    if (e.target === dom.importModal) closeImportModal();
  });
  
  // 拖拽
  dom.dropZone.addEventListener('dragover', (e) => {
    e.preventDefault();
    dom.dropZone.classList.add('dragover');
  });
  dom.dropZone.addEventListener('dragleave', (e) => {
    if (!dom.dropZone.contains(e.relatedTarget))
      dom.dropZone.classList.remove('dragover');
  });
  dom.dropZone.addEventListener('drop', (e) => {
    e.preventDefault();
    dom.dropZone.classList.remove('dragover');
    addFilesToQueue(Array.from(e.dataTransfer.files));
  });
  
  // 文件选择
  dom.importFileInput.addEventListener('change', (e) => {
    addFilesToQueue(Array.from(e.target.files));
    e.target.value = '';
  });
  
  // 清空队列
  dom.clearQueue.addEventListener('click', () => {
    importState.files = [];
    renderFileQueue();
  });
  
  // 提交
  dom.importSubmitBtn.addEventListener('click', startImport);
}

function openImportModal() {
  dom.importModal.classList.add('active');
  // 重置状态
  dom.importProgressArea.style.display = 'none';
  dom.importResults.style.display = 'none';
  dom.importSubmitBtn.disabled = importState.files.length === 0;
}

function closeImportModal() {
  dom.importModal.classList.remove('active');
}

function getExtIcon(filename) {
  const ext = '.' + filename.split('.').pop().toLowerCase();
  const map = { '.pdf': '📕', '.docx': '📘', '.doc': '📘', '.md': '📗', '.txt': '📄' };
  return map[ext] || '📄';
}

function formatSize(bytes) {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / 1024 / 1024).toFixed(1) + ' MB';
}

function addFilesToQueue(newFiles) {
  const allowed = ['.pdf', '.docx', '.md', '.txt'];
  const MAX = 10;
  
  for (const file of newFiles) {
    const ext = '.' + file.name.split('.').pop().toLowerCase();
    
    if (!allowed.includes(ext)) {
      showToast(`跳过 ${file.name}：不支持该格式`, 'error');
      continue;
    }
    if (file.size > 100 * 1024 * 1024) {
      showToast(`跳过 ${file.name}：超过 100MB 限制`, 'error');
      continue;
    }
    if (importState.files.length >= MAX) {
      showToast('最多可选择 10 个文件', 'error');
      break;
    }
    // 去重
    if (!importState.files.find(f => f.name === file.name && f.size === file.size)) {
      importState.files.push(file);
    }
  }
  
  renderFileQueue();
  dom.importSubmitBtn.disabled = importState.files.length === 0;
}

function renderFileQueue() {
  if (importState.files.length === 0) {
    dom.fileQueue.style.display = 'none';
    dom.importSubmitBtn.disabled = true;
    return;
  }
  
  dom.fileQueue.style.display = 'block';
  dom.fileQueueTitle.textContent = `待导入文件（${importState.files.length}）`;
  
  dom.fileList.innerHTML = importState.files.map((file, idx) => `
    <div class="file-item" id="file-item-${idx}">
      <span class="file-item-icon">${getExtIcon(file.name)}</span>
      <div class="file-item-info">
        <span class="file-item-name" title="${file.name}">${file.name}</span>
        <span class="file-item-size">${formatSize(file.size)}</span>
      </div>
      <span class="file-item-status pending">待导入</span>
      <button class="file-item-remove" onclick="removeFileFromQueue(${idx})">×</button>
    </div>
  `).join('');
}

function removeFileFromQueue(idx) {
  importState.files.splice(idx, 1);
  renderFileQueue();
  dom.importSubmitBtn.disabled = importState.files.length === 0;
}

async function startImport() {
  if (importState.files.length === 0) return;
  
  const docType = document.querySelector('input[name="docType"]:checked')?.value || 'custom';
  const total = importState.files.length;
  
  dom.importSubmitBtn.disabled = true;
  dom.importProgressArea.style.display = 'flex';
  dom.importResults.style.display = 'none';
  
  const results = [];
  const errors = [];
  
  for (let i = 0; i < total; i++) {
    const file = importState.files[i];
    const progress = Math.round((i / total) * 100);
    dom.importProgressFill.style.width = progress + '%';
    dom.importProgressText.textContent = `正在导入 ${i + 1}/${total}: ${file.name}`;
    
    // 更新文件项状态
    const itemEl = $(`file-item-${i}`);
    if (itemEl) {
      const statusEl = itemEl.querySelector('.file-item-status');
      statusEl.className = 'file-item-status loading';
      statusEl.textContent = '导入中...';
    }
    
    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('doc_type', docType);
      
      const resp = await fetch('https://sara-pod-tar-dairy.trycloudflare.com/api/upload', { method: 'POST', body: formData });
      const data = await resp.json();
      
      if (resp.ok) {
        results.push({ filename: file.name, chunks: data.chunks, status: 'ok' });
        if (itemEl) {
          const statusEl = itemEl.querySelector('.file-item-status');
          statusEl.className = 'file-item-status success';
          statusEl.textContent = `✓ ${data.chunks} 个片段`;
          itemEl.querySelector('.file-item-remove')?.remove();
        }
      } else {
        errors.push({ filename: file.name, error: data.detail || '未知错误' });
        if (itemEl) {
          const statusEl = itemEl.querySelector('.file-item-status');
          statusEl.className = 'file-item-status error';
          statusEl.textContent = data.detail || '失败';
        }
      }
    } catch (e) {
      errors.push({ filename: file.name, error: e.message });
      if (itemEl) {
        const statusEl = itemEl.querySelector('.file-item-status');
        statusEl.className = 'file-item-status error';
        statusEl.textContent = '连接失败';
      }
    }
  }
  
  // 完成
  dom.importProgressFill.style.width = '100%';
  dom.importProgressText.textContent = `导入完成：成功 ${results.length} 个，失败 ${errors.length} 个`;
  
  // 显示结果
  showImportResults(results, errors, total);
  
  // 更新知识库
  await checkHealth();
  
  // 清空待导入列表
  importState.files = [];
}

function showImportResults(results, errors, total) {
  dom.importResults.style.display = 'block';
  
  const allItems = [
    ...results.map(r => `
      <div class="result-item ok">
        <span class="result-item-icon">✅</span>
        <span class="result-item-name">${r.filename}</span>
        <span class="result-item-info">${r.chunks} 个片段入库</span>
      </div>
    `),
    ...errors.map(e => `
      <div class="result-item fail">
        <span class="result-item-icon">❌</span>
        <span class="result-item-name">${e.filename}</span>
        <span class="result-item-info">${e.error}</span>
      </div>
    `)
  ].join('');
  
  dom.importResults.innerHTML = `
    <div class="import-result-title">导入结果</div>
    <div class="import-result-summary">
      <div class="result-stat">
        <span class="result-stat-num total-num">${total}</span>
        <span class="result-stat-label">总计</span>
      </div>
      <div class="result-stat">
        <span class="result-stat-num success-num">${results.length}</span>
        <span class="result-stat-label">成功</span>
      </div>
      ${errors.length ? `<div class="result-stat">
        <span class="result-stat-num error-num">${errors.length}</span>
        <span class="result-stat-label">失败</span>
      </div>` : ''}
    </div>
    <div class="import-result-items">${allItems}</div>
  `;
}

// ── 全局暴露（供 HTML onclick 使用）──
window.copyText = copyText;
window.generateMindmapFor = generateMindmapFor;
window.removeFileFromQueue = removeFileFromQueue;
window.deleteDoc = deleteDoc;
