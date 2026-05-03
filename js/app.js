/* ====================================================
   VoiceForge - 主应用入口
   ==================================================== */

const App = {
  currentBackend: 'funspeech',

  init() {
    AudioManager.init();
    UI.init();

    // 恢复上次使用的后端
    const saved = Storage.getActiveBackend();
    this.switchBackend(saved, true);

    // 初始化历史记录
    UI.renderHistory();

    // 检查后端健康状态
    this.checkBackendHealth();
  },

  /** 切换后端 */
  async switchBackend(backend, isInit = false) {
    this.currentBackend = backend;
    Storage.saveActiveBackend(backend);
    UI.showBackendConfig(backend);

    // 更新 radio
    const radio = document.querySelector(`input[name="backend"][value="${backend}"]`);
    if (radio) radio.checked = true;

    // 加载音色
    await this.loadVoices();

    // 检查健康
    if (!isInit) this.checkBackendHealth();
  },

  /** 加载当前后端音色 */
  async loadVoices() {
    const backend = this.currentBackend;
    let voices = [];

    try {
      switch (backend) {
        case 'funspeech': {
          const config = UI.getBackendConfig('funspeech');
          voices = await FunSpeechBackend.getVoices(config.baseUrl);
          break;
        }
        case 'aliyun':
          voices = AliyunBackend.getVoices();
          break;
        case 'edge':
          voices = await EdgeBackend.getVoiceNames();
          break;
        case 'browser':
          voices = await BrowserBackend.getVoices();
          break;
      }
    } catch (e) {
      console.warn('加载音色失败:', e);
      voices = ['（加载失败，点击刷新重试）'];
    }

    UI.populateVoices(voices);
  },

  /** 检查所有后端健康状态 */
  async checkBackendHealth() {
    // 设置所有状态为 checking
    UI.setHealthStatus('funspeech', 'checking');
    UI.setHealthStatus('aliyun', 'checking');
    UI.setHealthStatus('edge', 'checking');
    UI.setHealthStatus('browser', 'checking');

    // 并行检查所有后端
    const fsConfig = UI.getBackendConfig('funspeech');
    const aliConfig = UI.getBackendConfig('aliyun');

    const results = await Promise.allSettled([
      FunSpeechBackend.checkHealth(fsConfig.baseUrl),
      AliyunBackend.checkHealth(aliConfig),
      EdgeBackend.checkHealth(),
      BrowserBackend.checkHealth(),
    ]);

    const backends = ['funspeech', 'aliyun', 'edge', 'browser'];
    backends.forEach((name, i) => {
      const status = results[i].status === 'fulfilled' && results[i].value ? 'online' : 'offline';
      UI.setHealthStatus(name, status);
    });
  },

  /** 合成语音 */
  async synthesize() {
    const text = UI.elements.textInput.value.trim();
    if (!text) {
      UI.setStatus('⚠️ 请输入文本', 'error');
      return;
    }
    if (text.length > 5000) {
      UI.setStatus('❌ 文本过长，最多 5000 字符', 'error');
      return;
    }

    const speed = parseFloat(UI.elements.speed.value);
    const pitch = parseInt(UI.elements.pitch.value);
    const volume = parseInt(UI.elements.volume.value);
    let format = UI.elements.formatSelect.value;
    const voice = UI.elements.voiceSelect.value;
    const streaming = UI.getStreamingEnabled();
    const config = UI.getBackendConfig(this.currentBackend);

    UI.setLoading(true);

    if (streaming) {
      UI.showProgress();
      UI.setStatus('🎵 流式合成中...', '');
    } else {
      UI.setStatus('🎵 正在合成...', '');
    }

    try {
      let audioData = null;

      switch (this.currentBackend) {
        case 'funspeech':
          if (streaming) {
            // WebSocket 流式合成
            audioData = await FunSpeechBackend.synthesizeStreaming(
              config.baseUrl,
              { text, voice, speed, format },
              (info) => {
                UI.updateProgress(info.index, info.totalBytes);
              }
            );
          } else {
            audioData = await FunSpeechBackend.synthesize(config.baseUrl, { text, voice, speed, format });
          }
          break;

        case 'aliyun':
          if (streaming) {
            audioData = await AliyunBackend.synthesize(
              config,
              { text, voice, speed, pitch, volume, format },
              {
                streaming: true,
                onChunk: (info) => {
                  UI.updateProgress(info.index, info.totalBytes);
                },
              }
            );
          } else {
            audioData = await AliyunBackend.synthesize(config, { text, voice, speed, pitch, volume, format });
          }
          break;

        case 'edge':
          audioData = await EdgeBackend.synthesize(config, { text, voice, speed, pitch, volume });
          format = 'mp3'; // Edge 返回 mp3
          if (audioData === null) {
            // Edge TTS 降级到浏览器朗读，不返回音频数据
            UI.setStatus('✅ 已通过浏览器朗读（不支持导出音频）', 'success');
            UI.hideProgress();
            UI.setLoading(false);
            return;
          }
          break;

        case 'browser':
          await BrowserBackend.synthesize(config, { text, voice, speed, pitch, volume });
          UI.setStatus('✅ 浏览器已开始朗读（不支持导出音频）', 'success');
          UI.hideProgress();
          UI.setLoading(false);
          return;
      }

      if (audioData) {
        const blob = new Blob([audioData], { type: format === 'wav' ? 'audio/wav' : 'audio/mpeg' });
        AudioManager.play(blob, format);

        // 保存到历史
        const dataUrl = await AudioManager.blobToDataUrl(blob);
        Storage.addHistory({
          text,
          voice,
          backend: this.currentBackend,
          audioData: dataUrl,
          format,
        });
        UI.renderHistory();

        UI.setStatus('✅ 合成完成！', 'success');
      } else {
        UI.setStatus('✅ 完成', 'success');
      }
    } catch (e) {
      console.error('合成失败:', e);
      UI.setStatus(`❌ ${e.message}`, 'error');
    } finally {
      UI.hideProgress();
      UI.setLoading(false);
    }
  },

  /** 下载音频 */
  download() {
    const settings = Storage.getSettings();
    // 导出名称：文本前10字 + 时间戳
    const text = UI.elements.textInput.value.trim();
    let prefix = text ? text.replace(/\s/g, '').slice(0, 10) : '';
    if (!prefix) prefix = 'voiceforge';
    AudioManager.download(`${prefix}-${Date.now()}.${settings.format}`);
  },
};

// 启动
document.addEventListener('DOMContentLoaded', () => App.init());

// 定期检查后端健康（每30秒）
setInterval(() => App.checkBackendHealth(), 30000);