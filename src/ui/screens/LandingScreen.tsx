interface Props {
  onStart: () => void;
  onKeyboardMode: () => void;
  onSettings: () => void;
}

export function LandingScreen({ onStart, onKeyboardMode, onSettings }: Props) {
  return (
    <main className="screen landing">
      <h1>Gesture Guitar</h1>
      <p className="tagline">Air guitar in your browser. Hands → chords. Motion → strums. Voice → recording.</p>
      <ul className="privacy-notes">
        <li>Camera is used only to track your hands.</li>
        <li>Microphone records your singing.</li>
        <li>All processing happens locally on your device.</li>
      </ul>
      <div className="actions">
        <button className="primary" onClick={onStart} data-testid="start-button">
          Start
        </button>
        <button onClick={onKeyboardMode} data-testid="keyboard-mode-button">
          Demo / Keyboard Mode
        </button>
        <button onClick={onSettings}>Settings</button>
      </div>
    </main>
  );
}
