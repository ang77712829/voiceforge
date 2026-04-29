/* ====================================================
   VoiceForge - 音频播放与下载
   ==================================================== */

const AudioManager = {
  player: null,
  currentBlob: null,
  currentFormat: 'mp3',

  init() {
    this.player = document.getElementById('audioPlayer');
  },

  /** 播放音频 blob */
  play(blob, format = 'mp3') {
    const mimeType = format === 'wav' ? 'audio/wav' : 'audio/mpeg';
    const url = URL.createObjectURL(new Blob([blob], { type: mimeType }));
    this.currentBlob = blob;
    this.currentFormat = format;
    this.player.src = url;
    this.player.load();
    this.player.play().catch(e => console.warn('自动播放失败:', e));
    document.getElementById('playerArea').classList.remove('hidden');
    document.getElementById('btnDownload').disabled = false;
  },

  /** 播放 base64 data URL */
  playDataUrl(dataUrl, format = 'mp3') {
    this.player.src = dataUrl;
    this.currentFormat = format;
    try {
      this.player.load();
      this.player.play().catch(() => {});
    } catch (e) {
      console.warn('播放 data URL 失败:', e);
    }
    document.getElementById('playerArea').classList.remove('hidden');
  },

  /** 下载当前音频 */
  download(filename) {
    if (!this.currentBlob && !this.player.src) return;
    const name = filename || `voiceforge-${Date.now()}.${this.currentFormat}`;

    if (this.currentBlob) {
      const url = URL.createObjectURL(this.currentBlob);
      this._triggerDownload(url, name);
      URL.revokeObjectURL(url);
    } else if (this.player.src.startsWith('data:')) {
      this._triggerDownload(this.player.src, name);
    }
  },

  _triggerDownload(url, filename) {
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  },

  /** 将 data URL 转成 Blob */
  dataUrlToBlob(dataUrl) {
    const parts = dataUrl.split(',');
    const mime = parts[0].match(/:(.*?);/)[1];
    const bytes = atob(parts[1]);
    const buf = new Uint8Array(bytes.length);
    for (let i = 0; i < bytes.length; i++) buf[i] = bytes.charCodeAt(i);
    return new Blob([buf], { type: mime });
  },

  /** Blob 转 data URL */
  blobToDataUrl(blob) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  },
};