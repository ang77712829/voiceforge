/* ====================================================
   VoiceForge - 浏览器原生 TTS 后端
   最简模式，直接用 SpeechSynthesis
   ==================================================== */

const BrowserBackend = {
  name: 'browser',
  label: '浏览器原生',

  async getVoices() {
    return new Promise((resolve) => {
      const voices = speechSynthesis.getVoices();
      if (voices.length > 0) {
        resolve(voices.map(v => `${v.name} (${v.lang})`));
        return;
      }
      speechSynthesis.onvoiceschanged = () => {
        resolve(speechSynthesis.getVoices().map(v => `${v.name} (${v.lang})`));
      };
    });
  },

  async checkHealth() {
    return 'speechSynthesis' in window;
  },

  synthesize(config, { text, voice, speed, pitch, volume }) {
    return new Promise((resolve, reject) => {
      if (!('speechSynthesis' in window)) {
        return reject(new Error('浏览器不支持 SpeechSynthesis'));
      }

      const utterance = new SpeechSynthesisUtterance(text);

      // 解析音色
      if (voice) {
        const voiceName = voice.split(' (')[0];
        const voices = speechSynthesis.getVoices();
        const found = voices.find(v => v.name === voiceName);
        if (found) utterance.voice = found;
      }

      utterance.rate = speed || 1.0;
      utterance.pitch = pitch !== undefined ? (pitch / 20) + 1 : 1;
      utterance.volume = (volume || 80) / 100;

      utterance.onend = () => {
        resolve(null); // 不返回音频数据
      };

      utterance.onerror = (e) => {
        reject(new Error(`浏览器 TTS 错误: ${e.error}`));
      };

      speechSynthesis.speak(utterance);
    });
  },
};