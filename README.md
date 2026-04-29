# 🎙️ VoiceForge - 多后端 TTS 语音合成前端

一个纯前端的多后端 TTS 语音合成工具，支持 FunSpeech (CosyVoice)、阿里云 TTS、微软 Edge TTS 和浏览器原生 TTS。

## ✨ 特性

- **多后端支持** — 一键切换四种 TTS 引擎
- **实时健康检查** — 后端连接状态指示灯
- **🔴 流式播放** — FunSpeech & 阿里云支持边合成边播放，实时进度条
- **音色丰富** — FunSpeech 7 种音色 + 阿里云 28 种 + Edge/浏览器系统音色
- **参数可调** — 语速、音调、音量自由控制
- **播放与下载** — 合成后在页面内播放，一键下载 MP3/WAV
- **历史记录** — 最近 50 条合成记录，localStorage 持久化存储
- **明暗主题** — 护眼模式自动切换
- **响应式布局** — 桌面端三栏 / 移动端单栏自适应
- **键盘快捷键** — `Ctrl+Enter` 快速合成
- **零依赖** — 纯 HTML/CSS/JS，打开即用
- **智能导出** — 下载文件名自动包含文本前10字

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
- **流式接口**: WebSocket (`/ws/v1/tts`)，启用「流式播放」后自动使用
- **音色**: 中文男/女、日语男、粤语女、英文男/女、韩语女
- **配置**: 在设置中修改 FunSpeech 基础地址

### ☁️ 阿里云 TTS

使用阿里云智能语音交互服务的流式合成。

- **鉴权方式**: HMAC-SHA1 Token（前端自动生成，浏览器端 Web Crypto API）
- **连接方式**: WebSocket 流式合成，Token 通过 URL 查询参数传递
- **流式播放**: 启用后逐帧接收音频并播放
- **配置项**:
  - AccessKey ID
  - AccessKey Secret
  - AppKey
  - Endpoint（默认 `nls-gateway-cn-shanghai.aliyuncs.com`）
- **获取凭证**: [阿里云智能语音交互控制台](https://nls-portal.console.aliyun.com/)

### 🌐 Edge TTS

使用微软 Edge Read Aloud HTTP API 合成音频。

- **无需配置**，开箱即用
- **优先 HTTP API** 获取音频数据（支持下载）
- **降级方案**: HTTP API 不可用时自动用浏览器 SpeechSynthesis 朗读
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
│   └── style.css           # 样式（暗/亮主题 + 进度条 + 开关）
├── js/
│   ├── app.js              # 主应用逻辑（流式合成调度）
│   ├── ui.js               # UI 交互层（进度条、流式开关）
│   ├── storage.js          # localStorage 管理
│   ├── audio.js            # 音频播放与下载
│   └── backends/
│       ├── funspeech.js    # FunSpeech (CosyVoice) — HTTP + WebSocket 流式
│       ├── aliyun.js       # 阿里云 TTS（WebSocket 流式 + token 鉴权）
│       ├── edge.js         # Edge TTS（HTTP API 优先 + SpeechSynthesis 降级）
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
- [x] 阿里云 WebSocket 流式播放（边合成边播放）
- [x] FunSpeech WebSocket 流式播放
- [ ] PWA 离线支持
- [ ] 导出历史为 ZIP

## 🔧 更新日志

### v1.1.0
- 🔴 修复阿里云 WebSocket Token 未拼接到 URL 的问题
- 🔴 修复 `const format` re-assign bug
- 🔴 修复历史记录下载按钮的 hack 实现
- 🟡 新增流式播放（FunSpeech WebSocket + 阿里云 WebSocket 逐帧推送）
- 🟡 新增合成进度条（帧数 + 字节数）
- 🟡 Edge TTS 重构：HTTP API 优先，SpeechSynthesis 降级
- 🟢 文本字数超限警告着色
- 🟢 下载文件名含文本前10字
- 🟢 后端不支持时禁用格式选择

### v1.0.0
- 初始版本

## 📄 License

MIT