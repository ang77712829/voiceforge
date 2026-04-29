/* ====================================================
   VoiceForge - UI 交互层
   ==================================================== */

const UI = {
  elements: {},

  init() {
    this._cacheElements();
    this._bindEvents();
    this._applyTheme();
  },

  _cacheElements() {
    const ids = [
      'btnTheme', 'btnSettings', 'btnCloseSettings', 'btnSaveSettings', 'btnResetSettings',
      'btnSynthesize', 'btnDownload', 'btnClear', 'btnRefreshVoices', 'btnClearHistory',
      'textInput', 'charCount', 'voiceSelect', 'speed', 'speedVal', 'pitch', 'pitchVal',
      'volume', 'volumeVal', 'formatSelect', 'audioPlayer', 'playerArea',
      'synthStatus', 'historyList',
      'fsBaseUrl', 'aliAccessKeyId', 'aliAccessKeySecret', 'aliAppKey', 'aliEndpoint',
      'setFsUrl', 'setAliEndpoint', 'setAliKeyId', 'setAliKeySecret', 'setAliAppKey',
      'settingsModal', 'configFunspeech', 'configAliyun', 'voicePanel',
      'pitchGroup', 'volumeGroup',
      // status dots
      'status-funspeech', 'status-aliyun', 'status-edge', 'status-browser',
    ];
    for (const id of ids) {
      this.elements[id] = document.getElementById(id);
    }
  },

  _bindEvents() {
    const el = this.elements;

    // 主题切换
    el.btnTheme.addEventListener('click', () => this._toggleTheme());

    // 设置弹窗
    el.btnSettings.addEventListener('click', () => this._openSettings());
    el.btnCloseSettings.addEventListener('click', () => this._closeSettings());
    el.btnSaveSettings.addEventListener('click', () => this._saveSettings());
    el.btnResetSettings.addEventListener('click', () => this._resetSettings());
    el.settingsModal.addEventListener('click', (e) => {
      if (e.target === el.settingsModal) this._closeSettings();
    });

    // 文本输入
    el.textInput.addEventListener('input', () => this._updateCharCount());
    el.btnClear.addEventListener('click', () => {
      el.textInput.value = '';
      this._updateCharCount();
    });

    // 参数滑块
    el.speed.addEventListener('input', () => { el.speedVal.textContent = el.speed.value + 'x'; });
    el.pitch.addEventListener('input', () => { el.pitchVal.textContent = el.pitch.value; });
    el.volume.addEventListener('input', () => { el.volumeVal.textContent = el.volume.value; });

    // 后端切换
    document.querySelectorAll('input[name="backend"]').forEach(radio => {
      radio.addEventListener('change', () => App.switchBackend(radio.value));
    });

    // 音色切换
    el.voiceSelect.addEventListener('change', () => {
      Storage.saveActiveVoice(el.voiceSelect.value);
    });

    // 刷新音色
    el.btnRefreshVoices.addEventListener('click', () => App.loadVoices());

    // 合成按钮
    el.btnSynthesize.addEventListener('click', () => App.synthesize());

    // 下载按钮
    el.btnDownload.addEventListener('click', () => App.download());

    // 清空历史
    el.btnClearHistory.addEventListener('click', () => {
      if (confirm('确定要清空所有历史记录吗？')) {
        Storage.clearHistory();
        this.renderHistory();
      }
    });

    // 键盘快捷键 Ctrl+Enter 合成
    el.textInput.addEventListener('keydown', (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
        e.preventDefault();
        App.synthesize();
      }
    });
  },

  /* --- 主题 --- */
  _toggleTheme() {
    const html = document.documentElement;
    const current = html.getAttribute('data-theme');
    const next = current === 'dark' ? 'light' : 'dark';
    html.setAttribute('data-theme', next);
    this.elements.btnTheme.textContent = next === 'dark' ? '🌙' : '☀️';
    Storage.saveSettings({ theme: next });
  },

  _applyTheme() {
    const settings = Storage.getSettings();
    const theme = settings.theme || 'dark';
    document.documentElement.setAttribute('data-theme', theme);
    this.elements.btnTheme.textContent = theme === 'dark' ? '🌙' : '☀️';
  },

  /* --- 设置弹窗 --- */
  _openSettings() {
    const s = Storage.getSettings();
    this.elements.setFsUrl.value = s.funspeechUrl || 'http://192.168.1.2:8000';
    this.elements.setAliEndpoint.value = s.aliEndpoint || 'nls-gateway-cn-shanghai.aliyuncs.com';
    this.elements.setAliKeyId.value = s.aliAccessKeyId || '';
    this.elements.setAliKeySecret.value = s.aliAccessKeySecret || '';
    this.elements.setAliAppKey.value = s.aliAppKey || '';
    this.elements.settingsModal.classList.remove('hidden');
  },

  _closeSettings() {
    this.elements.settingsModal.classList.add('hidden');
  },

  _saveSettings() {
    Storage.saveSettings({
      funspeechUrl: this.elements.setFsUrl.value,
      aliEndpoint: this.elements.setAliEndpoint.value,
      aliAccessKeyId: this.elements.setAliKeyId.value,
      aliAccessKeySecret: this.elements.setAliKeySecret.value,
      aliAppKey: this.elements.setAliAppKey.value,
    });
    // 同步到侧边栏
    this.elements.fsBaseUrl.value = this.elements.setFsUrl.value;
    this.elements.aliEndpoint.value = this.elements.setAliEndpoint.value;
    this.elements.aliAccessKeyId.value = this.elements.setAliKeyId.value;
    this.elements.aliAccessKeySecret.value = this.elements.setAliKeySecret.value;
    this.elements.aliAppKey.value = this.elements.setAliAppKey.value;
    this._closeSettings();
    App.loadVoices();
    App.checkBackendHealth();
  },

  _resetSettings() {
    const def = Storage.resetSettings();
    this.elements.setFsUrl.value = def.funspeechUrl;
    this.elements.setAliEndpoint.value = def.aliEndpoint;
    this.elements.setAliKeyId.value = '';
    this.elements.setAliKeySecret.value = '';
    this.elements.setAliAppKey.value = '';
  },

  /* --- 字符计数 --- */
  _updateCharCount() {
    const len = this.elements.textInput.value.length;
    this.elements.charCount.textContent = `${len} / 5000`;
  },

  /* --- 状态显示 --- */
  setStatus(text, type = '') {
    this.elements.synthStatus.textContent = text;
    this.elements.synthStatus.className = type;
  },

  setLoading(loading) {
    const btn = this.elements.btnSynthesize;
    if (loading) {
      btn.classList.add('loading');
      btn.disabled = true;
      btn.querySelector('.btn-icon-text').textContent = '⏳';
    } else {
      btn.classList.remove('loading');
      btn.disabled = false;
      btn.querySelector('.btn-icon-text').textContent = '▶';
    }
  },

  setHealthStatus(backend, status) {
    const dot = document.getElementById(`status-${backend}`);
    if (!dot) return;
    dot.className = 'status-dot ' + status; // online, offline, checking
  },

  /* --- 音色列表 --- */
  populateVoices(voices) {
    const select = this.elements.voiceSelect;
    select.innerHTML = '';
    if (!voices || voices.length === 0) {
      select.innerHTML = '<option>无可用音色</option>';
      return;
    }
    voices.forEach(v => {
      const opt = document.createElement('option');
      opt.value = v;
      opt.textContent = v;
      select.appendChild(opt);
    });
    // 恢复上次选择的音色
    const saved = Storage.getActiveVoice();
    if (saved && voices.includes(saved)) {
      select.value = saved;
    }
  },

  /* --- 后端配置面板 --- */
  showBackendConfig(backend) {
    this.elements.configFunspeech.classList.toggle('hidden', backend !== 'funspeech');
    this.elements.configAliyun.classList.toggle('hidden', backend !== 'aliyun');

    // 显示/隐藏参数（浏览器/Edge 不需要音调等）
    const needsPitch = ['edge', 'browser', 'aliyun'].includes(backend);
    const needsVolume = ['aliyun', 'edge', 'browser'].includes(backend);
    this.elements.pitchGroup.classList.toggle('hidden', !needsPitch);
    this.elements.volumeGroup.classList.toggle('hidden', !needsVolume);
  },

  /* --- 历史记录 --- */
  renderHistory() {
    const history = Storage.getHistory();
    const container = this.elements.historyList;

    if (history.length === 0) {
      container.innerHTML = '<div class="history-empty">暂无历史记录</div>';
      return;
    }

    container.innerHTML = history.map(item => `
      <div class="history-item" data-id="${item.id}">
        <div class="hi-text" title="${this._escapeHtml(item.text)}">${this._escapeHtml(item.text.slice(0, 40))}${item.text.length > 40 ? '...' : ''}</div>
        <div class="hi-meta">
          <span>${item.voice} · ${item.backend}</span>
          <span>${this._formatTime(item.timestamp)}</span>
        </div>
        <div class="hi-actions">
          <button class="hi-play" data-id="${item.id}">▶ 播放</button>
          <button class="hi-download" data-id="${item.id}">💾 下载</button>
          <button class="hi-delete" data-id="${item.id}">🗑</button>
        </div>
      </div>
    `).join('');

    // 绑定事件
    container.querySelectorAll('.hi-play').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const id = btn.dataset.id;
        const item = history.find(h => h.id === id);
        if (item && item.audioData) {
          AudioManager.playDataUrl(item.audioData, item.format);
        }
      });
    });

    container.querySelectorAll('.hi-download').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const id = btn.dataset.id;
        const item = history.find(h => h.id === id);
        if (item && item.audioData) {
          const blob = AudioManager.dataUrlToBlob(item.audioData);
          const audioManagerTmp = Object.create(AudioManager);
          audioManagerTmp.currentBlob = blob;
          audioManagerTmp.currentFormat = item.format;
          audioManagerTmp.download(`voiceforge-${item.timestamp}.${item.format}`);
        }
      });
    });

    container.querySelectorAll('.hi-delete').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const id = btn.dataset.id;
        Storage.removeHistory(id);
        this.renderHistory();
      });
    });
  },

  _escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  },

  _formatTime(ts) {
    const d = new Date(ts);
    const pad = n => String(n).padStart(2, '0');
    return `${pad(d.getHours())}:${pad(d.getMinutes())} ${pad(d.getMonth() + 1)}/${pad(d.getDate())}`;
  },

  /** 获取当前后端配置 */
  getBackendConfig(backend) {
    const s = Storage.getSettings();
    switch (backend) {
      case 'funspeech':
        return { baseUrl: this.elements.fsBaseUrl.value || s.funspeechUrl };
      case 'aliyun':
        return {
          accessKeyId: this.elements.aliAccessKeyId.value || s.aliAccessKeyId,
          accessKeySecret: this.elements.aliAccessKeySecret.value || s.aliAccessKeySecret,
          appKey: this.elements.aliAppKey.value || s.aliAppKey,
          endpoint: this.elements.aliEndpoint.value || s.aliEndpoint,
        };
      case 'edge':
      case 'browser':
        return {};
      default:
        return {};
    }
  },
};