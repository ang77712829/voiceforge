/* ====================================================
   VoiceForge - localStorage 管理
   ==================================================== */

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
    history.unshift({
      id: Date.now().toString(36) + Math.random().toString(36).slice(2, 7),
      text: item.text,
      voice: item.voice,
      backend: item.backend,
      timestamp: Date.now(),
      audioData: item.audioData, // base64 data URL
      format: item.format || 'mp3',
    });
    // 最多保留 50 条
    const trimmed = history.slice(0, 50);
    localStorage.setItem(this.KEYS.HISTORY, JSON.stringify(trimmed));
    return trimmed;
  },

  /** 删除单条历史 */
  removeHistory(id) {
    const history = this.getHistory().filter(h => h.id !== id);
    localStorage.setItem(this.KEYS.HISTORY, JSON.stringify(history));
    return history;
  },

  /** 清空历史 */
  clearHistory() {
    localStorage.setItem(this.KEYS.HISTORY, '[]');
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