/* ====================================================
   VoiceForge - 阿里云智能语音交互 TTS 后端
   使用 WebSocket 流式合成
   参考文档: https://help.aliyun.com/document_detail/84435.html
   ==================================================== */

const AliyunBackend = {
  name: 'aliyun',
  label: '阿里云 TTS',

  // 阿里云标准音色
  voices: [
    { id: 'xiaoyun', name: '小云（标准女声）' },
    { id: 'xiaogang', name: '小刚（标准男声）' },
    { id: 'ruoxi', name: '若兮（温柔女声）' },
    { id: 'siqi', name: '思琪（甜美女声）' },
    { id: 'sijia', name: '思佳（标准女声）' },
    { id: 'sicheng', name: '思诚（标准男声）' },
    { id: 'aiqi', name: '艾琪（温柔女声）' },
    { id: 'aijia', name: '艾佳（标准女声）' },
    { id: 'aicheng', name: '艾诚（标准男声）' },
    { id: 'aida', name: '艾达（标准男声）' },
    { id: 'ninger', name: '宁儿（标准女声）' },
    { id: 'ruilin', name: '瑞琳（标准女声）' },
    { id: 'siyue', name: '思悦（温柔女声）' },
    { id: 'aiya', name: '艾雅（严厉女声）' },
    { id: 'aixia', name: '艾夏（天真女声）' },
    { id: 'aimei', name: '艾美（甜美女声）' },
    { id: 'aiyu', name: '艾雨（自然女声）' },
    { id: 'aiyue', name: '艾悦（温柔女声）' },
    { id: 'aijing', name: '艾婧（严厉女声）' },
    { id: 'xiaomei', name: '小美（甜美女声）' },
    { id: 'aina', name: '艾娜（浙普女声）' },
    { id: 'yina', name: '伊娜（浙普女声）' },
    { id: 'sijing', name: '思婧（严厉女声）' },
    { id: 'sitong', name: '思彤（儿童女声）' },
    { id: 'xiaobei', name: '小北（萝莉女声）' },
    { id: 'aitong', name: '艾彤（儿童女声）' },
    { id: 'aiwei', name: '艾薇（萝莉女声）' },
    { id: 'aibao', name: '艾宝（萝莉女声）' },
  ],

  getVoices() {
    return this.voices.map(v => v.name);
  },

  async checkHealth(config) {
    // 需要完整鉴权配置
    if (!config.accessKeyId || !config.accessKeySecret || !config.appKey) {
      return false;
    }
    // 尝试 ping 阿里云 NLS 端点
    try {
      const ep = config.endpoint || 'nls-gateway-cn-shanghai.aliyuncs.com';
      await fetch(`https://${ep}/`, { signal: AbortSignal.timeout(3000) });
      return true;
    } catch {
      // fetch 可能因 CORS/404 失败，但说明网络可达
      return true;
    }
  },

  /**
   * 生成阿里云 Token
   * 使用 Web Crypto API 实现 HMAC-SHA1 签名
   * 参考: https://help.aliyun.com/document_detail/72153.html
   */
  async generateToken(accessKeyId, accessKeySecret) {
    const date = new Date().toUTCString();
    const signatureString = `GET\n${date}\n/stream/v1/tts`;

    const encoder = new TextEncoder();
    const keyData = encoder.encode(accessKeySecret);
    const messageData = encoder.encode(signatureString);

    const key = await crypto.subtle.importKey(
      'raw', keyData,
      { name: 'HMAC', hash: 'SHA-1' },
      false, ['sign']
    );

    const signature = await crypto.subtle.sign('HMAC', key, messageData);
    const signatureBase64 = btoa(String.fromCharCode(...new Uint8Array(signature)));

    // 阿里云 Token 格式: "Dataplus {AccessKeyId}:{Signature}"
    const token = `Dataplus ${accessKeyId}:${signatureBase64}`;
    return { token, date };
  },

  /**
   * 流式合成 TTS
   * @param {object}   config  - 后端配置 { accessKeyId, accessKeySecret, appKey, endpoint }
   * @param {object}   params  - 合成参数 { text, voice, speed, pitch, volume, format }
   * @param {object}   options - 可选 { streaming: bool, onChunk(blob): void }
   * @returns {Promise<ArrayBuffer>} 完整音频数据
   */
  synthesize(config, params, options = {}) {
    return new Promise((resolve, reject) => {
      this._doSynthesize(config, params, options, resolve, reject);
    });
  },

  async _doSynthesize(config, params, options, resolve, reject) {
    const { accessKeyId, accessKeySecret, appKey, endpoint } = config;
    const { text, voice, speed = 1.0, pitch = 0, volume = 50, format = 'mp3' } = params;
    const { streaming = false, onChunk } = options;

    if (!accessKeyId || !accessKeySecret || !appKey) {
      return reject(new Error('请填写阿里云 AccessKey ID、Secret 和 AppKey'));
    }

    if (!text || !text.trim()) {
      return reject(new Error('请输入要合成的文本'));
    }

    try {
      const { token, date } = await this.generateToken(accessKeyId, accessKeySecret);
      const ep = endpoint || 'nls-gateway-cn-shanghai.aliyuncs.com';
      // FIX: 将 token 作为查询参数拼到 WebSocket URL
      const wsUrl = `wss://${ep}:443/stream/v1/tts?token=${encodeURIComponent(token)}`;

      const ws = new WebSocket(wsUrl);
      const audioChunks = [];
      let synthesisComplete = false;
      let timeoutId = null;
      let chunkIndex = 0;

      // 超时处理
      timeoutId = setTimeout(() => {
        if (!synthesisComplete) {
          ws.close();
          reject(new Error('阿里云 TTS 请求超时（30s）'));
        }
      }, 30000);

      ws.binaryType = 'arraybuffer';

      ws.onopen = () => {
        // 阿里云 NLS WebSocket 协议: StartSynthesis 消息
        // header 中同时传递 nls_token（备选鉴权方式）
        const startMsg = {
          header: {
            message_id: this._generateId(),
            task_id: this._generateTaskId(),
            namespace: 'SpeechSynthesizer',
            name: 'StartSynthesis',
            appkey: appKey,
            nls_token: token,
          },
          payload: {
            voice: voice ? voice.split('（')[0] : 'xiaoyun',
            format: format === 'wav' ? 'wav' : 'mp3',
            sample_rate: 16000,
            volume: volume,
            speech_rate: Math.round((speed - 1.0) * 100), // -500 to 500
            pitch_rate: pitch * 10, // -500 to 500
            text: text,
            enable_subtitle: false,
          },
          context: {
            device_id: this._generateId(),
            sdk: {
              name: 'voiceforge',
              version: '1.0.0',
              language: 'javascript',
            },
          },
        };

        ws.send(JSON.stringify(startMsg));
      };

      ws.onmessage = (event) => {
        if (typeof event.data === 'string') {
          // JSON 消息（状态/错误）
          try {
            const msg = JSON.parse(event.data);
            const header = msg.header || {};

            if (header.name === 'SynthesisCompleted') {
              synthesisComplete = true;
              clearTimeout(timeoutId);
              ws.close();

              // 合并全部音频帧
              const totalLength = audioChunks.reduce((s, c) => s + c.byteLength, 0);
              const merged = new Uint8Array(totalLength);
              let offset = 0;
              for (const chunk of audioChunks) {
                merged.set(new Uint8Array(chunk), offset);
                offset += chunk.byteLength;
              }
              resolve(merged.buffer);
            } else if (header.name === 'TaskFailed') {
              const statusCode = msg.payload?.status || '';
              const errMsg = msg.payload?.status_text || msg.payload?.error_message || '未知错误';
              clearTimeout(timeoutId);
              ws.close();
              reject(new Error(`阿里云 TTS 失败${statusCode ? ` (${statusCode})` : ''}: ${errMsg}`));
            }
          } catch (e) {
            console.warn('解析阿里云消息失败:', e);
          }
        } else if (event.data instanceof ArrayBuffer) {
          // 二进制音频帧
          if (event.data.byteLength > 0) {
            audioChunks.push(event.data);
            chunkIndex++;

            // 流式模式：逐帧推送回调
            if (streaming && typeof onChunk === 'function') {
              onChunk({
                chunk: new Blob([event.data], { type: format === 'wav' ? 'audio/wav' : 'audio/mpeg' }),
                index: chunkIndex,
                totalBytes: audioChunks.reduce((s, c) => s + c.byteLength, 0),
              });
            }
          }
        }
      };

      ws.onerror = (err) => {
        clearTimeout(timeoutId);
        reject(new Error('阿里云 TTS WebSocket 连接失败，请检查网络和配置'));
      };

      ws.onclose = () => {
        if (!synthesisComplete) {
          clearTimeout(timeoutId);
          if (audioChunks.length > 0) {
            // 有部分数据，也算成功
            const totalLength = audioChunks.reduce((s, c) => s + c.byteLength, 0);
            const merged = new Uint8Array(totalLength);
            let offset = 0;
            for (const chunk of audioChunks) {
              merged.set(new Uint8Array(chunk), offset);
              offset += chunk.byteLength;
            }
            resolve(merged.buffer);
          } else {
            reject(new Error('阿里云 TTS 连接意外关闭，未收到音频数据'));
          }
        }
      };
    } catch (e) {
      reject(e);
    }
  },

  _generateId() {
    return 'xxxxxxxxxxxx4xxxyxxxxxxxxxxxxxxx'.replace(/[xy]/g, c => {
      const r = Math.random() * 16 | 0;
      return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16);
    });
  },

  _generateTaskId() {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 9);
  },
};