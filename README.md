# 🎙️ VoiceForge - 多后端 TTS 语音合成前端

一个纯前端的多后端 TTS 语音合成工具，支持 FunSpeech (CosyVoice)、阿里云 TTS、微软 Edge TTS 和浏览器原生 TTS。

## ✨ 特性

- **多后端支持** — 一键切换四种 TTS 引擎
- **实时健康检查** — 后端连接状态指示灯
- **音色丰富** — FunSpeech 7 种音色 + 阿里云 28 种 + Edge/浏览器系统音色
- **参数可调** — 语速、音调、音量自由控制
- **播放与下载** — 合成后在页面内播放，一键下载 MP3/WAV
- **历史记录** — 最近 50 条合成记录，localStorage 持久化存储
- **明暗主题** — 护眼模式自动切换
- **响应式布局** — 桌面端三栏 / 移动端单栏自适应
- **键盘快捷键** — `Ctrl+Enter` 快速合成
- **零依赖** — 纯 HTML/CSS/JS，打开即用

## 🚀 快速开始

直接用浏览器打开 `index.html` 即可使用。

```bash
# 本地开发
cd voiceforge
python3 -m http.server 8080
# 访问 http://localhost:8080
```

## 🔌 后端引擎

### 🎵 FunSpeech (CosyVoice)

基于 NAS 的本地 FunASR+CosyVoice 服务。

- **默认地址**: `http://192.168.1.2:8000`
- **接口**: OpenAI 兼容 TTS API (`/openai/v1/audio/speech`)
- **音色**: 中文男/女、日语男、粤语女、英文男/女、韩语女
- **配置**: 在设置中修改 FunSpeech 基础地址

### ☁️ 阿里云 TTS

使用阿里云智能语音交互服务的流式合成。

- **鉴权方式**: HMAC-SHA1 Token（前端自动生成）
- **连接方式**: WebSocket 流式合成
- **配置项**:
  - AccessKey ID
  - AccessKey Secret
  - AppKey
  - Endpoint（默认 `nls-gateway-cn-shanghai.aliyuncs.com`）
- **获取凭证**: [阿里云智能语音交互控制台](https://nls-portal.console.aliyun.com/)

### 🌐 Edge TTS

使用微软 Edge 浏览器的免费 TTS 服务。

- **无需配置**，开箱即用
- **支持导出音频**（通过 Microsoft Edge Read Aloud API）
- 音色丰富，支持多种语言

### 🔊 浏览器原生

使用浏览器内置 `SpeechSynthesis` API。

- **无需配置**
- 直接在设备上朗读
- ⚠️ 不支持导出音频文件

## 📁 文件结构

```
voiceforge/
├── index.html              # 主页面
├── css/
│   └── style.css           # 样式（暗/亮主题）
├── js/
│   ├── app.js              # 主应用逻辑
│   ├── ui.js               # UI 交互层
│   ├── storage.js          # localStorage 管理
│   ├── audio.js            # 音频播放与下载
│   └── backends/
│       ├── funspeech.js    # FunSpeech (CosyVoice) 后端
│       ├── aliyun.js       # 阿里云 TTS（WebSocket 流式）
│       ├── edge.js         # Edge TTS（微软免费）
│       └── browser.js      # 浏览器原生 TTS
└── README.md
```

## 🛠️ FunSpeech 服务部署

如果需要部署 FunSpeech 后端，参考 [FunASR](https://github.com/modelscope/FunASR) 和 [CosyVoice](https://github.com/FunAudioLLM/CosyVoice) 项目。

本项目的 FunSpeech 后端运行在 NAS 上（`192.168.1.2:8000`），提供以下接口：

| 接口 | 方法 | 说明 |
|------|------|------|
| `/stream/v1/tts/voices` | GET | 获取音色列表 |
| `/stream/v1/tts/health` | GET | 健康检查 |
| `/openai/v1/audio/speech` | POST | OpenAI 兼容 TTS |
| `/stream/v1/tts` | POST | 原生 TTS 接口 |
| `/ws/v1/tts` | WebSocket | WebSocket 流式 TTS |
| `/rest/v1/tts/async` | POST/GET | 异步 TTS 任务 |

## 📝 待办

- [ ] 支持 SSML 标记语言编辑
- [ ] 批量合成
- [ ] 阿里云流式播放（边合成边播放）
- [ ] PWA 离线支持
- [ ] 导出历史为 ZIP

## 📄 License

MIT