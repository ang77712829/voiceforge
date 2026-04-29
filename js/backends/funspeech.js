/* ====================================================
   VoiceForge - FunSpeech (CosyVoice) 后端
   OpenAI 兼容 TTS 接口
   ==================================================== */

const FunSpeechBackend = {
  name: 'funspeech',
  label: 'FunSpeech (CosyVoice)',
  defaultVoices: ['中文男', '中文女', '日语男', '粤语女', '英文女', '英文男', '韩语女'],

  async getVoices(baseUrl) {
    try {
      const resp = await fetch(`${baseUrl}/stream/v1/tts/voices`, { signal: AbortSignal.timeout(5000) });
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      const data = await resp.json();
      return data.voices || this.defaultVoices;
    } catch {
      // 返回默认音色列表
      return this.defaultVoices;
    }
  },

  async checkHealth(baseUrl) {
    try {
      const resp = await fetch(`${baseUrl}/stream/v1/tts/health`, { signal: AbortSignal.timeout(3000) });
      if (resp.ok) return true;
      return false;
    } catch {
      return false;
    }
  },

  async synthesize(baseUrl, { text, voice, speed, format }) {
    const fmt = format === 'wav' ? 'wav' : 'mp3';
    const body = {
      model: 'cosyvoice',
      input: text,
      voice: voice || '中文男',
      response_format: fmt,
      speed: speed || 1.0,
    };

    const resp = await fetch(`${baseUrl}/openai/v1/audio/speech`, {
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
};