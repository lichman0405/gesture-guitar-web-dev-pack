import { MAJOR_KEYS, CHORD_VOCABULARY } from "../../music/theory";
import { normalizeChordSymbol } from "../../music/theory";
import { useState } from "react";
import { SLOT_IDS, DEFAULT_SLOT_GESTURES, GESTURE_LABELS } from "../../gesture/gestureTypes";
import { INSTRUMENT_PRESETS } from "../../music/engine/InstrumentPreset";
import { STRUM_PATTERNS } from "../../guided/patterns";
import type { AppSettings } from "../../storage/settingsStore";
import type { Handedness, PlayMode, TimeSignature } from "../../performance/eventTypes";

interface Props {
  settings: AppSettings;
  onChange: (patch: Partial<AppSettings>) => void;
  onContinue: () => void;
  onBack: () => void;
  onKeyboardMode?: () => void;
}

const MODES: { id: PlayMode; label: string }[] = [
  { id: "free", label: "自由演奏" },
  { id: "guided", label: "节奏引导" },
  { id: "song", label: "歌曲练习" },
];

const TIME_SIGNATURES: TimeSignature[] = ["4/4", "3/4", "6/8"];

export function SetupScreen({ settings, onChange, onContinue, onBack, onKeyboardMode }: Props) {
  const [progressionDraft, setProgressionDraft] = useState(settings.songProgression.join(" "));
  const invalidSong = settings.mode === "song" && (settings.songProgression.length === 0 ||
    settings.songProgression.some((chord) => {
      try { normalizeChordSymbol(chord); return false; } catch { return true; }
    }));
  return (
    <main className="screen setup">
      <h2>演奏设置</h2>

      <section className="field">
        <label htmlFor="handedness">惯用手</label>
        <select
          id="handedness"
          value={settings.handedness}
          onChange={(e) => onChange({ handedness: e.target.value as Handedness })}
        >
          <option value="right">右手扫弦（左手选和弦）</option>
          <option value="left">左手扫弦（右手选和弦）</option>
        </select>
      </section>

      <section className="field">
        <label htmlFor="mode">演奏模式</label>
        <select
          id="mode"
          value={settings.mode}
          onChange={(e) => onChange({ mode: e.target.value as PlayMode })}
        >
          {MODES.map((m) => (
            <option key={m.id} value={m.id}>
              {m.label}
            </option>
          ))}
        </select>
      </section>

      {(settings.mode === "guided" || settings.mode === "song") && (
        <section className="field">
          <label htmlFor="pattern">扫弦节奏</label>
          <select
            id="pattern"
            value={settings.guidedPatternId}
            onChange={(e) => onChange({ guidedPatternId: e.target.value })}
          >
            {STRUM_PATTERNS.filter((p) => p.timeSignatures.includes(settings.timeSignature)).map(
              (p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ),
            )}
          </select>
        </section>
      )}

      {settings.mode === "song" && (
        <section className="field">
          <label htmlFor="progression">和弦进行（每小节一个和弦）</label>
          <input
            id="progression"
            type="text"
            value={progressionDraft}
            onChange={(e) => {
              setProgressionDraft(e.target.value);
              onChange({
                songProgression: e.target.value
                  .split(/[\s,]+/)
                  .map((c) => c.trim())
                  .filter((c) => c.length > 0),
              });
            }}
            placeholder="例如：C G Am F"
          />
          {invalidSong && (
            <p className="field-warning" role="alert">
              请至少输入一个有效的大和弦或小和弦，例如 C G Am F。
            </p>
          )}
        </section>
      )}

      <section className="field">
        <label htmlFor="chord-mapping">和弦映射</label>
        <select
          id="chord-mapping"
          value={settings.chordMappingMode}
          onChange={(e) => onChange({ chordMappingMode: e.target.value as "scale" | "custom" })}
        >
          <option value="scale">按调性分配（每个调性 10 个和弦）</option>
          <option value="custom">自定义和弦</option>
        </select>
      </section>

      {settings.chordMappingMode === "scale" ? (
        <section className="field">
          <label htmlFor="key">调性</label>
          <select
            id="key"
            value={settings.key ?? "C"}
            onChange={(e) => onChange({ key: e.target.value })}
          >
            {MAJOR_KEYS.map((k) => (
              <option key={k} value={k}>
                {k} 大调
              </option>
            ))}
          </select>
        </section>
      ) : (
        <fieldset className="field custom-mapping">
          <legend>自定义手势和弦</legend>
          {SLOT_IDS.map((slotId, index) => {
            return (
              <label key={slotId}>
                手势 {index + 1} · {GESTURE_LABELS[DEFAULT_SLOT_GESTURES[slotId]]}
                <select
                  value={settings.customMapping[slotId] ?? ""}
                  onChange={(e) =>
                    onChange({
                      customMapping: { ...settings.customMapping, [slotId]: e.target.value },
                    })
                  }
                >
                  <option value="">— 未分配 —</option>
                  {CHORD_VOCABULARY.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
              </label>
            );
          })}
        </fieldset>
      )}

      <section className="field">
        <label htmlFor="bpm">速度（每分钟拍数）：{settings.bpm}</label>
        <input
          id="bpm"
          type="range"
          min={40}
          max={240}
          value={settings.bpm}
          onChange={(e) => onChange({ bpm: Number(e.target.value) })}
        />
      </section>

      <section className="field">
        <label htmlFor="meter">拍号</label>
        <select
          id="meter"
          value={settings.timeSignature}
          onChange={(e) => onChange({ timeSignature: e.target.value as TimeSignature })}
        >
          {TIME_SIGNATURES.map((ts) => (
            <option key={ts} value={ts}>
              {ts}
            </option>
          ))}
        </select>
      </section>

      <section className="field inline">
        <label htmlFor="metronome">
          <input
            id="metronome"
            type="checkbox"
            checked={settings.metronomeOn}
            onChange={(e) => onChange({ metronomeOn: e.target.checked })}
          />
          开启节拍器声音
        </label>
        <label htmlFor="count-in">
          预备拍小节数
          <input
            id="count-in"
            type="number"
            min={0}
            max={4}
            value={settings.countInBars}
            onChange={(e) => onChange({ countInBars: Number(e.target.value) })}
          />
        </label>
      </section>

      <section className="field">
        <label htmlFor="sensitivity">扫弦灵敏度： {settings.sensitivity.toFixed(2)}</label>
        <input id="sensitivity" type="range" min={0.25} max={3} step={0.25}
          value={settings.sensitivity} onChange={(e) => onChange({ sensitivity: Number(e.target.value) })} />
        <small>轻扫漏触发时调高；静止时误触发则调低。</small>
      </section>

      <section className="field">
        <label htmlFor="preset">吉他音色</label>
        <select
          id="preset"
          value={settings.instrumentPreset}
          onChange={(e) => onChange({ instrumentPreset: e.target.value })}
        >
          {Object.values(INSTRUMENT_PRESETS).map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
      </section>

      <div className="actions">
        {onKeyboardMode && <button disabled={invalidSong} onClick={onKeyboardMode}>使用键盘演奏</button>}
        <button onClick={onBack}>返回</button>
        <button disabled={invalidSong} className="primary" onClick={onContinue} data-testid="continue-button">
          继续
        </button>
      </div>
    </main>
  );
}
