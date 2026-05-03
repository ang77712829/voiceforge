/* ====================================================
   VoiceForge - 音频播放与下载
   ==================================================== */

const AudioManager = {
  player: null,
  currentBlob: null,
  currentFormat: 'mp3',
  currentUrl: null,

  init() {
    this.player = document.getElementById('audioPlayer');
  },

  /** 合并多个 ArrayBuffer 音频帧为一个 */
  mergeChunks(chunks) {
    const totalLength = chunks.reduce((s, c) => s + c.byteLength, 0);
    const merged = new Uint8Array(totalLength);
    let offset = 0;
    for (const chunk of chunks) {
      merged.set(new Uint8Array(chunk), offset);
      offset += chunk.byteLength;
    }
    return merged.buffer;
  },

  /** 播放音频 blob */
  play(blob, format = 'mp3') {
    const mimeType = format === 'wav' ? 'audio/wav' : 'audio/mpeg';
    // 释放旧的 Object URL，避免内存泄漏
    if (this.currentUrl) {
      URL.revokeObjectURL(this.currentUrl);
      this.currentUrl = null;
    }
    const url = URL.createObjectURL(new Blob([blob], { type: mimeType }));
    this.currentUrl = url;
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

  /**
   * 下载当前音频
   * @param {string} filename  可选文件名
   * @param {string} textHint  可选文本提示（取前 10 字用于文件命名）
   */
  download(filename, textHint) {
    if (!this.currentBlob && !this.player.src) return;
    // 文件命名：文本前 10 字 + 时间戳
    let name = filename;
    if (!name) {
      const prefix = textHint ? textHint.replace(/\s/g, '').slice(0, 10) : 'voiceforge';
      const ts = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
      name = `${prefix}_${ts}.${this.currentFormat}`;
    }

    if (this.currentBlob) {
      const url = URL.createObjectURL(this.currentBlob);
      this._triggerDownload(url, name);
      URL.revokeObjectURL(url);
    } else if (this.player.src.startsWith('data:')) {
      this._triggerDownload(this.player.src, name);
    }
  },

  /** 从 dataUrl 直接下载（用于历史记录） */
  downloadFromDataUrl(dataUrl, filename, format = 'mp3') {
    const name = filename || `voiceforge-${Date.now()}.${format}`;
    const blob = this.dataUrlToBlob(dataUrl);
    const url = URL.createObjectURL(blob);
    this._triggerDownload(url, name);
    URL.revokeObjectURL(url);
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