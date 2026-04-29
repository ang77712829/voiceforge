/* ====================================================
   VoiceForge - FunSpeech (CosyVoice) 后端
   HTTP:  OpenAI 兼容 TTS 接口
   WS:    阿里云 NLS FlowingSpeechSynthesizer 双向流协议
          (StartSynthesis → SynthesisStarted → RunSynthesis → 音频帧 → SynthesisCompleted)
   ==================================================== */

const FunSpeechBackend = {
  name: 'funspeech',
  label: 'FunSpeech (CosyVoice)',
  defaultVoices: ['中文男', '中文女', '日语男', '粤语女', '英文女', '英文男', '韩语女'],

  /** 规范化 baseUrl：去掉末尾斜杠和多余子路径 */
  _rootUrl(baseUrl) {
    return baseUrl.replace(/\/$/, '').replace(/\/(ws|openai|stream)\/.*$/, '');
  },

  async getVoices(baseUrl) {
    const root = this._rootUrl(baseUrl);
    try {
      const resp = await fetch(`${root}/stream/v1/tts/voices`, { signal: AbortSignal.timeout(5000) });
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      const data = await resp.json();
      return data.voices || this.defaultVoices;
    } catch {
      return this.defaultVoices;
    }
  },

  async checkHealth(baseUrl) {
    const root = this._rootUrl(baseUrl);
    try {
      const resp = await fetch(`${root}/stream/v1/tts/health`, { signal: AbortSignal.timeout(3000) });
      return resp.ok;
    } catch {
      return false;
    }
  },

  /**
   * HTTP(S) 合成（阻塞式，返回完整音频）
   */
  async synthesize(baseUrl, { text, voice, speed, format }) {
    const root = this._rootUrl(baseUrl);
    const fmt = format === 'wav' ? 'wav' : 'mp3';
    const body = {
      model: 'cosyvoice',
      input: text,
      voice: voice || '中文男',
      response_format: fmt,
      speed: speed || 1.0,
    };

    const resp = await fetch(`${root}/openai/v1/audio/speech`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(60000),
    });

    if (!resp.ok) {
      const errText = await resp.text();
      throw new Error(`FunSpeech 错误 (${resp.status}): ${errText}`);
    }

    return await resp.arrayBuffer();
  },

  /**
   * WebSocket 流式合成（阿里云 NLS FlowingSpeechSynthesizer 协议）
   * @param {string}   baseUrl - FunSpeech 服务地址
   * @param {object}   params  - { text, voice, speed, format }
   * @param {function} onChunk - 回调: ({ chunk: Blob, index: number, totalBytes: number }) => void
   * @returns {Promise<ArrayBuffer>} 完整合并后的音频
   */
  synthesizeStreaming(baseUrl, params, onChunk) {
    return new Promise((resolve, reject) => {
      this._doStreamSynthesize(baseUrl, params, onChunk, resolve, reject);
    });
  },

  async _doStreamSynthesize(baseUrl, params, onChunk, resolve, reject) {
    const { text, voice, speed, format } = params;
    const fmt = format === 'wav' ? 'wav' : 'mp3';

    if (!text || !text.trim()) {
      return reject(new Error('请输入要合成的文本'));
    }

    try {
      const root = this._rootUrl(baseUrl);
      const httpUrl = new URL(root);
      const wsProtocol = httpUrl.protocol === 'https:' ? 'wss:' : 'ws:';
      const wsUrl = `${wsProtocol}//${httpUrl.host}/ws/v1/tts`;

      const ws = new WebSocket(wsUrl);
      const audioChunks = [];
      let taskId = null;
      let synthesisStarted = false;
      let complete = false;
      let timeoutId = null;

      const cleanup = (err) => {
        clearTimeout(timeoutId);
        if (!complete) {
          complete = true;
          if (err) reject(err);
          else if (audioChunks.length === 0) reject(new Error('FunSpeech 流式合成未收到音频'));
          else {
            // 即使没收到 SynthesisCompleted，有音频也算成功
            const totalLength = audioChunks.reduce((s, c) => s + c.byteLength, 0);
            const merged = new Uint8Array(totalLength);
            let offset = 0;
            for (const chunk of audioChunks) {
              merged.set(new Uint8Array(chunk), offset);
              offset += chunk.byteLength;
            }
            resolve(merged.buffer);
          }
        }
        if (ws.readyState === WebSocket.OPEN) ws.close();
      };

      timeoutId = setTimeout(() => cleanup(new Error('FunSpeech 流式合成超时（60s）')), 60000);

      ws.binaryType = 'arraybuffer';

      ws.onopen = () => {
        // 阿里云 NLS FlowingSpeechSynthesizer: 先发 StartSynthesis（不带 text）
        taskId = this._generateTaskId();
        const startMsg = {
          header: {
            message_id: this._generateId(),
            task_id: taskId,
            namespace: 'FlowingSpeechSynthesizer',
            name: 'StartSynthesis',
          },
          payload: {
            voice: voice || 'zhinan',
            format: fmt,
            sample_rate: 16000,
            volume: 50,
            speech_rate: 0,
            pitch_rate: 0,
            enable_subtitle: false,
            platform: 'javascript',
          },
        };
        ws.send(JSON.stringify(startMsg));
      };

      ws.onmessage = (event) => {
        if (typeof event.data === 'string') {
          try {
            const msg = JSON.parse(event.data);
            const header = msg.header || {};

            switch (header.name) {
              case 'SynthesisStarted':
                // 已开始，立即发送 RunSynthesis 带文本
                if (header.status === 20000000 && !synthesisStarted) {
                  synthesisStarted = true;
                  ws.send(JSON.stringify({
                    header: {
                      message_id: this._generateId(),
                      task_id: taskId,
                      namespace: 'FlowingSpeechSynthesizer',
                      name: 'RunSynthesis',
                    },
                    payload: { text },
                  }));
                }
                break;

              case 'SynthesisCompleted':
                complete = true;
                clearTimeout(timeoutId);
                ws.close();
                const totalLength = audioChunks.reduce((s, c) => s + c.byteLength, 0);
                const merged = new Uint8Array(totalLength);
                let offset = 0;
                for (const chunk of audioChunks) {
                  merged.set(new Uint8Array(chunk), offset);
                  offset += chunk.byteLength;
                }
                resolve(merged.buffer);
                break;

              case 'TaskFailed':
                cleanup(new Error(`FunSpeech WS 错误: ${header.status_text || header.status_message || '未知'}`));
                break;

              case 'MetaInfo':
                // 元信息，忽略
                break;

              default:
                console.log('FunSpeech WS 未处理消息:', header.name);
                break;
            }
          } catch (e) {
            console.warn('解析 FunSpeech WS JSON 消息失败:', e);
          }
        } else if (event.data instanceof ArrayBuffer) {
          // 二进制音频帧
          if (event.data.byteLength > 0) {
            audioChunks.push(event.data);
            if (typeof onChunk === 'function') {
              onChunk({
                chunk: new Blob([event.data], { type: fmt === 'wav' ? 'audio/wav' : 'audio/mpeg' }),
                index: audioChunks.length,
                totalBytes: audioChunks.reduce((s, c) => s + c.byteLength, 0),
              });
            }
          }
        }
      };

      ws.onerror = () => {
        if (!synthesisStarted) {
          // 还没开始就出错了，降级 HTTP
          console.warn('FunSpeech WebSocket 连接失败，降级到 HTTP 合成');
          clearTimeout(timeoutId);
          this.synthesize(baseUrl, params).then(resolve).catch(reject);
        }
      };

      ws.onclose = () => {
        if (!complete) cleanup();
      };
    } catch (e) {
      reject(e);
    }
  },

  _generateId() {
    return 'xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx'.replace(/[xy]/g, c => {
      const r = Math.random() * 16 | 0;
      return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16);
    });
  },

  _generateTaskId() {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 9);
  },
};