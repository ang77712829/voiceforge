# VoiceForge 多后端 TTS 前端修复方案

> 审查日期：2026-05-03 | 审查人：宏宏

## 修复清单

### 🔴 P0 — 必须修复（功能失效）

#### 1. `js/storage.js:77` — 历史记录播放/下载完全失效
- **问题**：`addHistory` 只存了 `hasAudio: !!item.audioData`（布尔值），没存实际音频数据
- **影响**：`ui.js:322-323` 和 `ui.js:333-338` 读取 `item.audioData` 永远为 undefined
- **修复方案**：使用 IndexedDB 存储音频数据（localStorage 有 5MB 限制，不适合存音频）
```javascript
// 在 storage.js 中添加 IndexedDB 支持
const DB_NAME = 'VoiceForgeAudio';
const DB_VERSION = 1;
const STORE_NAME = 'audio';

function openDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = (e) => {
      e.target.result.createObjectStore(STORE_NAME, { keyPath: 'id' });
    };
    req.onsuccess = (e) => resolve(e.target.result);
    req.onerror = (e) => reject(e.target.error);
  });
}

async function saveAudio(id, audioData) {
  const db = await openDB();
  const tx = db.transaction(STORE_NAME, 'readwrite');
  tx.objectStore(STORE_NAME).put({ id, audioData });
}

async function getAudio(id) {
  const db = await openDB();
  const tx = db.transaction(STORE_NAME, 'readonly');
  return new Promise((resolve) => {
    const req = tx.objectStore(STORE_NAME).get(id);
    req.onsuccess = () => resolve(req.result?.audioData);
    req.onerror = () => resolve(null);
  });
}
```
- 修改 `addHistory`：存完 localStorage 后同时 `saveAudio(id, item.audioData)`
- 修改 `ui.js` 的播放/下载逻辑：从 IndexedDB 读取 `getAudio(item.id)`

#### 2. `index.html:95-106` — 重复的流式播放开关
- **问题**：`streamingToggle`（自定义开关）和 `chkStreaming`（普通复选框）功能完全相同
- **修复**：删除 `index.html:101-106` 的 `chkStreaming` 复选框（保留 `streamingToggle`）

#### 3. `js/backends/funspeech.js:139` — 音色默认值不一致
- **问题**：storage 默认 `'中文男'`，WebSocket 发送 `'zhinan'`
- **修复**：将 `funspeech.js:139` 的 fallback 改为与 storage 一致：
```javascript
// 修复前
voice: voice || 'zhinan'
// 修复后
voice: voice || '中文男'
```

### ⚠️ P1 — 内存/稳定性

#### 4. `js/audio.js:17` — Object URL 内存泄漏
- **问题**：每次 `play()` 创建新 URL 但没释放旧的
- **修复**：
```javascript
// 在 play() 方法开头添加
if (this.currentUrl) {
  URL.revokeObjectURL(this.currentUrl);
  this.currentUrl = null;
}
```

#### 5. `js/backends/funspeech.js:224-231` — WebSocket 启动后出错静默失败
- **问题**：`ws.onerror` 在 `synthesisStarted` 后不调用 `cleanup`，Promise 永远 pending
- **修复**：
```javascript
ws.onerror = (err) => {
  console.error('WebSocket error:', err);
  cleanup(new Error(`WebSocket error: ${err.message || 'unknown'}`));
};
```

#### 6. `js/backends/edge.js:77-83` — 降级朗读成功后仍 reject
- **问题**：`SpeechSynthesis` 降级成功后调用 `reject(new Error(...))`，UI 显示错误
- **修复**：降级成功后 resolve 而非 reject：
```javascript
// 修复前
reject(new Error('...'));
// 修复后  
resolve(null); // 成功但无 audioData（浏览器直接朗读）
```
对应 `app.js:189` 也要处理 `audioData === null` 的情况（显示"已朗读"而非错误）

#### 7. `js/backends/edge.js:138-158` — SpeechSynthesis 无超时保护
- **修复**：添加 30 秒超时：
```javascript
const timeout = setTimeout(() => {
  cleanup(new Error('Speech synthesis timeout'));
}, 30000);
// 在 onend/onerror 中 clearTimeout(timeout)
```

### 🟡 P2 — 代码质量

#### 8. 音频合并逻辑重复
- **funspeech.js** 中 3 处相同的合并逻辑 → 提取为 `_mergeChunks(audioChunks)` 公共函数
- **aliyun.js** 中 2 处相同逻辑 → 同样提取

#### 9. `funspeech.js:198` — 死代码 `case 'SynthesisStarted'`
- **修复**：删除第二个重复的 case

#### 10. 健康检查并行化
- **位置**：`js/app.js:71-89`
- **修复**：将串行 `await` 改为 `Promise.allSettled([checkFunspeech(), checkAliyun(), ...])`

#### 11. FunSpeech URL 硬编码 3 处
- **修复**：只在 `Storage.DEFAULT_SETTINGS` 定义一次，其他地方引用它

### 🟢 P3 — 项目规范

#### 12. README 数据修正
- 历史记录数量：50 → 20（或修改代码支持 50 条）
- 添加浏览器兼容性说明（Chrome 103+, Firefox 100+, Safari 16+）

## 验证步骤

1. 打开 `index.html`，确认只有一个流式播放开关
2. 测试 FunSpeech 合成 → 检查历史记录 → 点击播放/下载 → 确认可用
3. 打开 DevTools → Application → IndexedDB → VoiceForgeAudio，确认音频数据已存储
4. 测试 Edge TTS 降级：禁用 FunSpeech，使用 Edge TTS，确认不显示错误
5. 检查控制台无 JS 错误
6. 检查 Audio 内存：多次播放后确认旧 Object URL 已释放

## Git 提交规范

```
fix: 使用 IndexedDB 存储历史记录音频数据，修复播放/下载失效
fix: 删除重复的流式播放开关
fix: 统一 FunSpeech 默认音色值
fix: 修复 Audio Object URL 内存泄漏
fix: FunSpeech WebSocket 出错后正确调用 cleanup
fix: Edge TTS 降级成功后不再错误 reject
fix: Edge TTS 添加 30 秒超时保护
refactor: 提取音频合并公共函数消除代码重复
refactor: 健康检查改为并行执行
chore: 更新 README 浏览器兼容性说明
```
