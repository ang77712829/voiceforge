/* ====================================================
   VoiceForge - FunSpeech (CosyVoice) 后端
   OpenAI 兼容 TTS 接口
   支持 HTTP(S) 合成 + WebSocket 流式合成
   ==================================================== */

const FunSpeechBackend = {
  name: 'funspeech',
  label: 'FunSpeech (CosyVoice)',
  defaultVoices: ['中文男', '中文女', '日语男', '粤语女', '英文女', '英文男', '韩语女'],

  async getVoices(baseUrl) {
    // 规范化 baseUrl
    let root = baseUrl.replace(/\/$/, '').replace(/\/(ws|openai|stream)\/.*$/, '');
    try {
      const resp = await fetch(`${root}/openai/v1/audio/voices`, { signal: AbortSignal.timeout(5000) });
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      const data = await resp.json();
      return data.voices || this.defaultVoices;
    } catch {
      // 返回默认音色列表
      return this.defaultVoices;
    }
  },

  async checkHealth(baseUrl) {
    // 规范化 baseUrl：去掉末尾斜杠和多余的 WS/HTTP 路径
    let root = baseUrl.replace(/\/$/, '');
    // 如果用户误填了 /ws/v1/tts 或 /openai/v1/audio/speech 等路径，提取根地址
    root = root.replace(/\/(ws|openai|stream)\/.*$/, '');
    try {
      // FunSpeech OpenAI 兼容接口健康检查
      const resp = await fetch(`${root}/openai/v1/models`, { signal: AbortSignal.timeout(3000) });
      return resp.ok;
    } catch {
      return false;
    }
  },

  /**
   * HTTP(S) 合成（阻塞式，返回完整音频）
   */
  async synthesize(baseUrl, { text, voice, speed, format }) {
    // 规范化 baseUrl
    let root = baseUrl.replace(/\/$/, '').replace(/\/(ws|openai|stream)\/.*$/, '');
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
   * WebSocket 流式合成（逐帧返回音频）
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
      // 规范化 baseUrl 并构造 WebSocket URL
      let root = baseUrl.replace(/\/$/, '').replace(/\/(ws|openai|stream)\/.*$/, '');
      const httpUrl = new URL(root);
      const wsProtocol = httpUrl.protocol === 'https:' ? 'wss:' : 'ws:';
      const wsUrl = `${wsProtocol}//${httpUrl.host}/ws/v1/tts`;

      const ws = new WebSocket(wsUrl);
      const audioChunks = [];
      let complete = false;
      let timeoutId = null;

      timeoutId = setTimeout(() => {
        if (!complete) {
          ws.close();
          reject(new Error('FunSpeech 流式合成超时（60s）'));
        }
      }, 60000);

      ws.binaryType = 'arraybuffer';

      ws.onopen = () => {
        // 发送合成请求
        ws.send(JSON.stringify({
          model: 'cosyvoice',
          input: text,
          voice: voice || '中文男',
          response_format: fmt,
          speed: speed || 1.0,
        }));
      };

      ws.onmessage = (event) => {
        if (typeof event.data === 'string') {
          try {
            const msg = JSON.parse(event.data);
            if (msg.type === 'done' || msg.status === 'complete') {
              complete = true;
              clearTimeout(timeoutId);
              ws.close();

              // 合并所有音频帧
              const totalLength = audioChunks.reduce((s, c) => s + c.byteLength, 0);
              const merged = new Uint8Array(totalLength);
              let offset = 0;
              for (const chunk of audioChunks) {
                merged.set(new Uint8Array(chunk), offset);
                offset += chunk.byteLength;
              }
              resolve(merged.buffer);
            } else if (msg.type === 'error' || msg.error) {
              clearTimeout(timeoutId);
              ws.close();
              reject(new Error(`FunSpeech 流式错误: ${msg.error || msg.message || '未知'}`));
            }
          } catch (e) {
            console.warn('解析 FunSpeech WS 消息失败:', e);
          }
        } else if (event.data instanceof ArrayBuffer) {
          // 音频帧
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
        clearTimeout(timeoutId);
        // WebSocket 流式不可用时，降级到 HTTP
        console.warn('FunSpeech WebSocket 连接失败，降级到 HTTP 合成');
        this.synthesize(baseUrl, params)
          .then(resolve)
          .catch(reject);
      };

      ws.onclose = () => {
        if (!complete) {
          clearTimeout(timeoutId);
          if (audioChunks.length > 0) {
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
      };
    } catch (e) {
      reject(e);
    }
  },
};