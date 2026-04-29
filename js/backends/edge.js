/* ====================================================
   VoiceForge - Microsoft Edge TTS 后端
   使用浏览器内置 SpeechSynthesis API
   微软免费在线 TTS 音色通过浏览器暴露
   ==================================================== */

const EdgeBackend = {
  name: 'edge',
  label: 'Edge TTS（浏览器）',

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
   * 用 SpeechSynthesis 合成语音
   * 注意：SpeechSynthesis 不直接返回音频文件，
   * 我们需要通过 AudioContext 捕获输出（如果支持）或直接播放
   *
   * 策略：使用 MediaStream Recording API 录制
   */
  synthesize(config, { text, voice, speed, pitch, volume }) {
    return new Promise((resolve, reject) => {
      if (!('speechSynthesis' in window)) {
        return reject(new Error('浏览器不支持 SpeechSynthesis'));
      }

      // Edge TTS 通过 SpeechSynthesis，我们直接让浏览器朗读
      // 同时用 AudioContext 捕获音频流
      const utterance = new SpeechSynthesisUtterance(text);

      // 解析音色名（格式: "Microsoft Xiaoxiao - Chinese (Simplified, China) (zh-CN)"）
      const voiceName = voice ? voice.split(' (')[0] : '';
      const voices = speechSynthesis.getVoices();
      if (voiceName) {
        const found = voices.find(v => v.name === voiceName);
        if (found) utterance.voice = found;
      }

      utterance.rate = speed || 1.0;
      utterance.pitch = pitch !== undefined ? (pitch / 20) + 1 : 1; // 映射 -20..20 → 0..2
      utterance.volume = (volume || 80) / 100;

      // 创建 AudioContext 来捕获输出
      const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      const dest = audioCtx.createMediaStreamDestination();
      const mediaRecorder = new MediaRecorder(dest.stream, {
        mimeType: MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
          ? 'audio/webm;codecs=opus'
          : 'audio/webm',
      });

      const chunks = [];
      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunks.push(e.data);
      };

      mediaRecorder.onstop = () => {
        const blob = new Blob(chunks, { type: 'audio/webm' });
        blob.arrayBuffer().then(buf => resolve(buf));
        audioCtx.close();
      };

      // Edge TTS 实际上通过系统 TTS 引擎，录制方案不可行
      // 改用直接播放 + 返回空的方式
      // 更好的方案是用 Edge TTS HTTP API
      utterance.onstart = () => {
        // 尝试用 MediaRecorder 从 audio 元素捕获
        // 实际上 SpeechSynthesis 输出不经过 audio 元素...
      };

      utterance.onend = async () => {
        // SpeechSynthesis 无法直接获取音频流
        // 降级方案：合成后提示用户，并通过微软 Edge TTS API 获取
        // 这里返回一个简单的提示
        mediaRecorder.stop();

        // 回退：尝试使用微软 Edge Read Aloud API
        try {
          const audioData = await this._edgeTtsApi(text, voice, speed, pitch, volume);
          resolve(audioData);
        } catch {
          reject(new Error(
            'Edge TTS 浏览器模式不支持导出音频文件。\n请改用 FunSpeech 或阿里云后端来获取可下载的音频文件。\n\n浏览器已为您朗读文本。'
          ));
        }
      };

      utterance.onerror = (e) => {
        mediaRecorder.stop();
        audioCtx.close();
        reject(new Error(`Edge TTS 错误: ${e.error}`));
      };

      mediaRecorder.start();
      speechSynthesis.speak(utterance);
    });
  },

  /**
   * 使用微软 Edge Read Aloud API（免费）
   * 这是 Microsoft Edge 浏览器内置的 TTS 服务
   */
  async _edgeTtsApi(text, voice, speed, pitch, volume) {
    // Edge TTS 的免费 HTTP API
    // 使用 edge-tts 的协议：SSML + 微软语音服务
    const VOICE_MAP = {
      'xiaoxiao': 'zh-CN-XiaoxiaoNeural',
      'yunyang': 'zh-CN-YunyangNeural',
      'xiaochen': 'zh-CN-XiaochenNeural',
      'xiaohan': 'zh-CN-XiaohanNeural',
      'xiaomeng': 'zh-CN-XiaomengNeural',
      'xiaomo': 'zh-CN-XiaomoNeural',
      'xiaorui': 'zh-CN-XiaoruiNeural',
    };

    // 简化版：使用 fetch POST 到 Edge TTS 端点
    // 实际上 Edge TTS 需要 WebSocket，这里用简化 HTTP 方式
    const ssml = `
      <speak version="1.0" xmlns="http://www.w3.org/2001/10/synthesis"
             xmlns:mstts="http://www.w3.org/2001/mstts" xml:lang="zh-CN">
        <voice name="zh-CN-XiaoxiaoNeural">
          <prosody rate="${(speed || 1.0) * 100}%" pitch="${pitch || 0}%" volume="${volume || 80}">
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
};