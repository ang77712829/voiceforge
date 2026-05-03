/* ====================================================
   VoiceForge - Microsoft Edge TTS 后端
   使用微软 Edge Read Aloud HTTP API 合成音频
   降级方案：浏览器内置 SpeechSynthesis
   ==================================================== */

const EdgeBackend = {
  name: 'edge',
  label: 'Edge TTS（浏览器）',

  /** Edge TTS HTTP API 音色映射 */
  VOICE_MAP: {
    'xiaoxiao': 'zh-CN-XiaoxiaoNeural',
    'yunyang': 'zh-CN-YunyangNeural',
    'xiaochen': 'zh-CN-XiaochenNeural',
    'xiaohan': 'zh-CN-XiaohanNeural',
    'xiaomeng': 'zh-CN-XiaomengNeural',
    'xiaomo': 'zh-CN-XiaomoNeural',
    'xiaorui': 'zh-CN-XiaoruiNeural',
    'xiaozhen': 'zh-CN-XiaozhenNeural',
    'xiaoyu': 'zh-CN-XiaoyuNeural',
    'xiaoyan': 'zh-CN-XiaoyanNeural',
    'yunxi': 'zh-CN-YunxiNeural',
    'yunjian': 'zh-CN-YunjianNeural',
  },

  /** 获取可用音色 */
  getVoices() {
    return new Promise((resolve) => {
      const voices = speechSynthesis.getVoices();
      if (voices.length > 0) {
        resolve(voices);
        return;
      }
      // 等待音色加载
      speechSynthesis.onvoiceschanged = () => {
        resolve(speechSynthesis.getVoices());
      };
    });
  },

  /** 获取音色名称列表 */
  async getVoiceNames() {
    const voices = await this.getVoices();
    const zhVoices = voices.filter(v => v.lang.startsWith('zh'));
    const allVoices = voices.filter(v => !v.lang.startsWith('zh'));

    // 中文音色优先
    return [
      ...zhVoices.map(v => `${v.name} (${v.lang})`),
      ...allVoices.map(v => `${v.name} (${v.lang})`),
    ];
  },

  async checkHealth() {
    return 'speechSynthesis' in window;
  },

  /**
   * 合成语音
   * 策略：优先使用 Edge HTTP API 获取音频数据，
   * 失败时降级到浏览器 SpeechSynthesis 朗读
   */
  synthesize(config, { text, voice, speed, pitch, volume }) {
    return new Promise((resolve, reject) => {
      if (!('speechSynthesis' in window)) {
        return reject(new Error('浏览器不支持 SpeechSynthesis'));
      }

      // 优先尝试 Edge HTTP API
      this._edgeTtsApi(text, voice, speed, pitch, volume)
        .then(resolve)
        .catch((apiErr) => {
          console.warn('Edge HTTP API 失败，降级到浏览器朗读:', apiErr);
          // 降级到 SpeechSynthesis
          this._speechSynthesize(text, voice, speed, pitch, volume)
            .then(() => {
              // SpeechSynthesis 朗读成功但不返回音频数据
              resolve(null);
            })
            .catch(reject);
        });
    });
  },

  /**
   * 使用微软 Edge Read Aloud API（免费）
   * 微软 Edge 浏览器内置 TTS 服务的 HTTP 接口
   */
  async _edgeTtsApi(text, voice, speed, pitch, volume) {
    // 解析音色名：从 "Microsoft Xiaoxiao - Chinese (Simplified, China) (zh-CN)" 提取
    let voiceShortName = 'zh-CN-XiaoxiaoNeural';

    if (voice) {
      // 尝试从显示名中提取拼音名
      const match = voice.match(/\b(xiao\w+|yun\w+|aida\w+|rui\w+|si\w+)\b/i);
      if (match) {
        const key = match[1].toLowerCase();
        voiceShortName = this.VOICE_MAP[key] || voiceShortName;
      }
    }

    const rate = (speed || 1.0) * 100;
    const pitchVal = pitch || 0;

    const ssml = `<speak version="1.0" xmlns="http://www.w3.org/2001/10/synthesis"
             xmlns:mstts="http://www.w3.org/2001/mstts" xml:lang="zh-CN">
        <voice name="${voiceShortName}">
          <prosody rate="${rate}%" pitch="${pitchVal}%" volume="${volume || 80}">
            ${text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')}
          </prosody>
        </voice>
      </speak>`;

    const resp = await fetch(
      'https://speech.platform.bing.com/consumer/speech/synthesize/readaloud/edge/v1?TrustedClientToken=6A5AA1D4EAFF4E9FB37E23D68491D6F4',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/ssml+xml',
          'X-Microsoft-OutputFormat': 'audio-16khz-128kbitrate-mono-mp3',
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        },
        body: ssml,
        signal: AbortSignal.timeout(30000),
      }
    );

    if (!resp.ok) throw new Error(`Edge TTS API 错误: ${resp.status}`);
    return await resp.arrayBuffer();
  },

  /**
   * 浏览器 SpeechSynthesis 降级（纯朗读，不导出音频）
   */
  _speechSynthesize(text, voice, speed, pitch, volume) {
    return new Promise((resolve, reject) => {
      const utterance = new SpeechSynthesisUtterance(text);

      // 解析音色名
      if (voice) {
        const voiceName = voice.split(' (')[0];
        const voices = speechSynthesis.getVoices();
        const found = voices.find(v => v.name === voiceName);
        if (found) utterance.voice = found;
      }

      utterance.rate = speed || 1.0;
      utterance.pitch = pitch !== undefined ? (pitch / 20) + 1 : 1;
      utterance.volume = (volume || 80) / 100;

      let settled = false;
      const timeout = setTimeout(() => {
        if (!settled) {
          settled = true;
          speechSynthesis.cancel();
          reject(new Error('Speech synthesis timeout'));
        }
      }, 30000);

      utterance.onend = () => {
        if (!settled) {
          settled = true;
          clearTimeout(timeout);
          resolve(null);
        }
      };
      utterance.onerror = (e) => {
        if (!settled) {
          settled = true;
          clearTimeout(timeout);
          reject(new Error(`浏览器 TTS 错误: ${e.error}`));
        }
      };

      speechSynthesis.speak(utterance);
    });
  },
};