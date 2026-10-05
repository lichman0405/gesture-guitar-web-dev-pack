import { MAJOR_KEYS, CHORD_VOCABULARY } from "../../music/theory";
import { INSTRUMENT_PRESETS } from "../../music/engine/InstrumentPreset";
import type { AppSettings } from "../../storage/settingsStore";
import type { Handedness, PlayMode, TimeSignature } from "../../performance/eventTypes";

interface Props {
  settings: AppSettings;
  onChange: (patch: Partial<AppSettings>) => void;
  onContinue: () => void;
  onBack: () => void;
}

const MODES: { id: PlayMode; label: string }[] = [
  { id: "free", label: "Free Play" },
  { id: "guided", label: "Guided Rhythm" },
  { id: "song", label: "Song Mode" },
];

const TIME_SIGNATURES: TimeSignature[] = ["4/4", "3/4", "6/8"];

export function SetupScreen({ settings, onChange, onContinue, onBack }: Props) {
  return (
    <main className="screen setup">
      <h2>Setup</h2>

      <section className="field">
        <label htmlFor="handedness">Handedness</label>
        <select
          id="handedness"
          value={settings.handedness}
          onChange={(e) => onChange({ handedness: e.target.value as Handedness })}
        >
          <option value="right">Right-handed (left hand chords)</option>
          <option value="left">Left-handed (right hand chords)</option>
        </select>
      </section>

      <section className="field">
        <label htmlFor="mode">Play mode</label>
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

      <section className="field">
        <label htmlFor="chord-mapping">Chord mapping</label>
        <select
          id="chord-mapping"
          value={settings.chordMappingMode}
          onChange={(e) => onChange({ chordMappingMode: e.target.value as "scale" | "custom" })}
        >
          <option value="scale">Scale Mode (key-based)</option>
          <option value="custom">Custom Chord Set</option>
        </select>
      </section>

      {settings.chordMappingMode === "scale" ? (
        <section className="field">
          <label htmlFor="key">Key</label>
          <select
            id="key"
            value={settings.key ?? "C"}
            onChange={(e) => onChange({ key: e.target.value })}
          >
            {MAJOR_KEYS.map((k) => (
              <option key={k} value={k}>
                {k} major
              </option>
            ))}
          </select>
        </section>
      ) : (
        <fieldset className="field custom-mapping">
          <legend>Custom slot mapping</legend>
          {[1, 2, 3, 4, 5, 6].map((n) => {
            const slotId = `slot-${n}`;
            return (
              <label key={slotId}>
                Slot {n}
                <select
                  value={settings.customMapping[slotId] ?? ""}
                  onChange={(e) =>
                    onChange({
                      customMapping: { ...settings.customMapping, [slotId]: e.target.value },
                    })
                  }
                >
                  <option value="">— unassigned —</option>
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
        <label htmlFor="bpm">BPM: {settings.bpm}</label>
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
        <label htmlFor="meter">Time signature</label>
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
          Metronome (audible)
        </label>
        <label htmlFor="count-in">
          Count-in bars
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
        <label htmlFor="preset">Instrument</label>
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
        <button onClick={onBack}>Back</button>
        <button className="primary" onClick={onContinue} data-testid="continue-button">
          Continue
        </button>
      </div>
    </main>
  );
}
