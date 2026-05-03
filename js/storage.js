/* ====================================================
   VoiceForge - localStorage + IndexedDB 管理
   ==================================================== */

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
  try {
    const db = await openDB();
    const tx = db.transaction(STORE_NAME, 'readwrite');
    tx.objectStore(STORE_NAME).put({ id, audioData });
  } catch (e) {
    console.warn('IndexedDB saveAudio 失败:', e);
  }
}

async function getAudio(id) {
  try {
    const db = await openDB();
    const tx = db.transaction(STORE_NAME, 'readonly');
    return new Promise((resolve) => {
      const req = tx.objectStore(STORE_NAME).get(id);
      req.onsuccess = () => resolve(req.result?.audioData || null);
      req.onerror = () => resolve(null);
    });
  } catch (e) {
    console.warn('IndexedDB getAudio 失败:', e);
    return null;
  }
}

async function deleteAudio(id) {
  try {
    const db = await openDB();
    const tx = db.transaction(STORE_NAME, 'readwrite');
    tx.objectStore(STORE_NAME).delete(id);
  } catch (e) {
    console.warn('IndexedDB deleteAudio 失败:', e);
  }
}

async function clearAllAudio() {
  try {
    const db = await openDB();
    const tx = db.transaction(STORE_NAME, 'readwrite');
    tx.objectStore(STORE_NAME).clear();
  } catch (e) {
    console.warn('IndexedDB clearAllAudio 失败:', e);
  }
}

const Storage = {
  KEYS: {
    SETTINGS: 'voiceforge_settings',
    HISTORY: 'voiceforge_history',
    ACTIVE_BACKEND: 'voiceforge_backend',
    ACTIVE_VOICE: 'voiceforge_voice',
  },

  DEFAULT_SETTINGS: {
    funspeechUrl: 'http://192.168.1.2:8000',
    aliAccessKeyId: '',
    aliAccessKeySecret: '',
    aliAppKey: '',
    aliEndpoint: 'nls-gateway-cn-shanghai.aliyuncs.com',
    theme: 'dark',
    speed: 1.0,
    pitch: 0,
    volume: 80,
    format: 'mp3',
    streaming: true,
    activeBackend: 'funspeech',
    activeVoice: '中文男',
  },

  /** 获取设置 */
  getSettings() {
    try {
      const raw = localStorage.getItem(this.KEYS.SETTINGS);
      if (!raw) return { ...this.DEFAULT_SETTINGS };
      return { ...this.DEFAULT_SETTINGS, ...JSON.parse(raw) };
    } catch {
      return { ...this.DEFAULT_SETTINGS };
    }
  },

  /** 保存设置 */
  saveSettings(settings) {
    try {
      const merged = { ...this.getSettings(), ...settings };
      localStorage.setItem(this.KEYS.SETTINGS, JSON.stringify(merged));
      return merged;
    } catch (e) {
      console.error('保存设置失败:', e);
      return this.DEFAULT_SETTINGS;
    }
  },

  /** 重置设置 */
  resetSettings() {
    localStorage.removeItem(this.KEYS.SETTINGS);
    return { ...this.DEFAULT_SETTINGS };
  },

  /** 获取历史记录 */
  getHistory() {
    try {
      const raw = localStorage.getItem(this.KEYS.HISTORY);
      return raw ? JSON.parse(raw) : [];
    } catch {
      return [];
    }
  },

  /** 添加历史记录 */
  addHistory(item) {
    const history = this.getHistory();
    const id = Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
    history.unshift({
      id,
      text: item.text,
      voice: item.voice,
      backend: item.backend,
      timestamp: Date.now(),
      hasAudio: !!item.audioData,
      format: item.format || 'mp3',
    });
    // 将音频数据存入 IndexedDB（localStorage 有 5MB 限制，不适合存音频）
    if (item.audioData) {
      saveAudio(id, item.audioData);
    }
    // 最多保留 20 条
    const trimmed = history.slice(0, 20);
    let serialized = JSON.stringify(trimmed);
    // 4MB localStorage 溢出保护：超限则逐条删除最旧的
    while (serialized.length > 4 * 1024 * 1024 && trimmed.length > 1) {
      const removed = trimmed.pop();
      if (removed) deleteAudio(removed.id);
      serialized = JSON.stringify(trimmed);
    }
    localStorage.setItem(this.KEYS.HISTORY, serialized);
    return trimmed;
  },

  /** 删除单条历史 */
  removeHistory(id) {
    const history = this.getHistory().filter(h => h.id !== id);
    localStorage.setItem(this.KEYS.HISTORY, JSON.stringify(history));
    deleteAudio(id);
    return history;
  },

  /** 清空历史 */
  clearHistory() {
    localStorage.setItem(this.KEYS.HISTORY, '[]');
    clearAllAudio();
  },

  /** 获取当前后端 */
  getActiveBackend() {
    return localStorage.getItem(this.KEYS.ACTIVE_BACKEND) || 'funspeech';
  },

  /** 保存当前后端 */
  saveActiveBackend(backend) {
    localStorage.setItem(this.KEYS.ACTIVE_BACKEND, backend);
  },

  /** 获取当前音色 */
  getActiveVoice() {
    const settings = this.getSettings();
    return settings.activeVoice || '中文男';
  },

  /** 保存当前音色 */
  saveActiveVoice(voice) {
    this.saveSettings({ activeVoice: voice });
  },
};