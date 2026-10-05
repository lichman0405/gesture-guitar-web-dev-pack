# Gesture Guitar · 手势吉他

在 Chrome / Edge 里用摄像头识别手势弹吉他，也能直接用键盘演奏。
音色使用程序化 Karplus–Strong 合成。摄像头、麦克风、录音与导出都在本机处理，无需账号或后端。

## Windows 启动

安装 Node.js 后，双击仓库根目录的 **Start-Guitar.cmd**。
脚本会准备缺失依赖、应用 MediaPipe WASM 补丁、检查手部模型，然后打开浏览器。
保持终端窗口打开，用 Ctrl+C 停止服务。若 5173 已占用，Vite 会选择空闲端口，请使用自动打开的地址。

也可以在仓库目录运行：

```powershell
npm ci
npm run dev
```

打开终端显示的地址，通常是 http://localhost:5173。使用本地地址以满足摄像头和麦克风的安全上下文要求。

## 摄像头演奏

1. 点击 Start，选择惯用手、模式、调性、节拍和音色，点击 Continue。
2. 允许摄像头，手心朝镜头，双手保持在画面里，静止约 2.5 秒完成校准。尽量使用均匀的正面光照。
3. 默认右手模式：**左手选和弦，右手上下扫弦**；左手模式则相反。预览是镜像，左右手指的是你自己的身体。
4. 和弦手势保持约 0.2 秒；扫弦手的拇指和食指可像捏拨片一样轻捏，手腕在绿色区域附近连续上下摆动，无须每次停住，也无须大幅挥动。完全握拳可闷音；捏拨片姿势不会闷音。
5. 扫弦漏触发可提高「扫弦灵敏度」；静止时误触发可降低。改变坐姿、距离或光照后点击 Recalibrate。

默认 C 大调：

| 和弦手姿势 | 和弦 | 键盘 |
|---|---|---|
| 食指 | C | 1 |
| 食指＋中指 | Dm | 2 |
| 食指＋中指＋无名指 | Em | 3 |
| 四指伸直、拇指收起 | F | 4 |
| 五指张开 | G | 5 |
| 竖起拇指 | Am | 6 |
| 小指 | D | 7 |
| 食指＋小指（摇滚） | E | 8 |
| 拇指＋食指（L） | Cm | 9 |
| 拇指＋小指（电话） | A# / Bb | 0 |

演奏页「手势怎么弹」显示当前调性或自定义映射的实际和弦。
每个调性有 10 个固定手势和弦；Custom Chord Set 可把 10 种姿势分别指定为任意 24 个大小和弦之一。
Normal 显示预览与帮助，Performance 显示大号和弦，Debug 还显示两只手五指的伸展程度和扫弦速度、位移、门槛。黄色圆圈是扫弦追踪点。
更新前的旧校准不会复用，请刷新页面并重新校准一次，扫弦手放在准备弹的位置。

## 键盘演奏

首页点击 Demo / Keyboard Mode；需要自定义设置时，Settings → Play with keyboard。

- 1–9 / 0 选 10 个和弦；C、D、E、F、G、A、B 直接选和弦，Shift＋字母选小和弦。
- ↓ / ↑ 扫弦；Shift＋方向键重扫，Ctrl＋方向键轻扫。
- Space 切换闷音；R 开始/停止录音；P 切换节拍暂停；Esc 停止录音。

## 录音与导出

点击 Record 并允许麦克风。看到 **Microphone recording** 后再开始唱；授权期间也可以弹吉他。
人声不会从扬声器实时回放，避免啸叫。拒绝麦克风仍可录制吉他。

点击 Stop 后等待本地渲染，在结果页播放混音，下载 Vocal / Guitar / Mix WAV 和 Performance JSON。
麦克风授权延迟会计入混音对齐，录音开始前已选好的和弦也会进入导出。
录音或导出期间禁止重新校准；导出完成后可以 Re-record，Exit session 会释放设备。

## 验证与开发

```powershell
npm run typecheck
npm run lint
npx vitest run
npm run build
npx playwright install chromium
npm run test:e2e
npm run test:soak
```

test:soak 运行完整 10 分钟，不缩短时间。
在 Windows 受限环境中，可以把测试浏览器安装到工作区：

```powershell
$env:PLAYWRIGHT_BROWSERS_PATH = "$PWD/.cache/ms-playwright"
npx playwright install chromium
```

生产构建流程检查：`$env:GGW_PREVIEW='1'; npx playwright test e2e/usability.spec.ts`。
本地 Git 仅提交，禁止 remote、push、GitHub 仓库或 PR。
完整记录见 DEVELOPMENT_LOG.md，验收标准见 docs/ACCEPTANCE_TESTS.md。
自动测试的摄像头图像和麦克风信号由 Chromium 提供；真实人手、真实光照下的准确率仍需要真人体验验证。
