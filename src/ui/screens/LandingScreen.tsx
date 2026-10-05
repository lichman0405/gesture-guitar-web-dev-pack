interface Props {
  onStart: () => void;
  onKeyboardMode: () => void;
  onSettings: () => void;
}

export function LandingScreen({ onStart, onKeyboardMode, onSettings }: Props) {
  return (
    <main className="screen landing">
      <h1>手势吉他</h1>
      <p className="tagline">在浏览器里弹空气吉他。手势选和弦，挥手扫弦，还能录下你的歌声。</p>
      <ul className="privacy-notes">
        <li>摄像头仅用于识别双手动作。</li>
        <li>麦克风用于录制你的歌声。</li>
        <li>识别、合成与录音导出都在你的设备上完成。</li>
      </ul>
      <div className="actions">
        <button className="primary" onClick={onStart} data-testid="start-button">
          开始演奏
        </button>
        <button onClick={onKeyboardMode} data-testid="keyboard-mode-button">
          键盘演奏
        </button>
        <button onClick={onSettings}>设置</button>
      </div>
    </main>
  );
}
