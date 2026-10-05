import type { PerformanceController } from "../../app/performanceController";
import { useAppStore } from "../hooks";

interface Props {
  controller: PerformanceController;
  /** Back to the perform screen for another take (keeps audio + settings). */
  onReRecord: () => void;
  /** Full exit to landing (disposes the session). */
  onNewSession: () => void;
}

const ARTIFACT_LABELS: Record<string, string> = {
  "vocal-wav": "Vocal (WAV)",
  "guitar-wav": "Guitar (WAV)",
  "mix-wav": "Mix (WAV)",
  "performance-json": "Performance (JSON)",
};

function download(url: string, filename: string): void {
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.rel = "noopener";
  document.body.appendChild(a);
  a.click();
  a.remove();
}

/**
 * Results screen (UX_FLOW §7): playback, per-track exports, lightweight
 * metrics, timeline issues. All artifacts are local object URLs — no upload.
 */
export function ResultsScreen({ controller, onReRecord, onNewSession }: Props) {
  const ui = useAppStore(controller.store);
  const results = ui.results;
  const urls = controller.exportArtifactUrls;

  if (ui.exportState === "exporting") {
    return (
      <main className="screen results-screen">
        <h2>Rendering export…</h2>
        <p>Re-rendering the guitar stem and building WAV files locally.</p>
      </main>
    );
  }

  if (!results) {
    return (
      <main className="screen results-screen">
        <h2>No results</h2>
        <button onClick={onReRecord}>Back</button>
      </main>
    );
  }

  const mixUrl = urls.get("mix-wav");
  const evaluation = results.evaluation;

  return (
    <main className="screen results-screen" data-testid="results-screen">
      <h2>Session results</h2>
      <p className="hint">Session {results.sessionId} — all files are generated locally.</p>

      {mixUrl && (
        <section className="results-playback">
          <h3>Playback</h3>
          <audio controls src={mixUrl} data-testid="mix-playback" />
        </section>
      )}

      <section className="results-exports">
        <h3>Export</h3>
        <div className="row">
          {results.artifacts.map((artifact) => {
            const url = urls.get(artifact.kind);
            return (
              <button
                key={artifact.kind}
                disabled={!url}
                onClick={() => url && download(url, artifact.filename)}
                data-testid={`export-${artifact.kind}`}
              >
                {ARTIFACT_LABELS[artifact.kind] ?? artifact.kind}
              </button>
            );
          })}
        </div>
        {results.failures.length > 0 && (
          <div className="export-failures">
            <h4>Some exports could not be produced</h4>
            <ul>
              {results.failures.map((f) => (
                <li key={f.kind}>
                  <strong>{ARTIFACT_LABELS[f.kind] ?? f.kind}:</strong> {f.message}
                </li>
              ))}
            </ul>
            <p className="hint">The raw session events are still available in performance.json.</p>
          </div>
        )}
      </section>

      {evaluation && (
        <section className="results-metrics" data-testid="evaluation">
          <h3>Timing &amp; accuracy</h3>
          <dl>
            <dt>Strums hit</dt>
            <dd>
              {evaluation.strumHit} / {evaluation.strumExpected}
            </dd>
            <dt>Direction correct</dt>
            <dd>
              {evaluation.directionCorrect} / {evaluation.strumExpected}
            </dd>
            <dt>Avg timing error</dt>
            <dd>{evaluation.avgTimingErrorMs.toFixed(0)} ms</dd>
            <dt>Timing spread</dt>
            <dd>{evaluation.timingSpreadMs.toFixed(0)} ms</dd>
            <dt>Missed strums</dt>
            <dd>{evaluation.missedStrums}</dd>
            <dt>Extra strums</dt>
            <dd>{evaluation.extraStrums}</dd>
            <dt>Chords hit</dt>
            <dd>
              {evaluation.chordHit} / {evaluation.chordExpected}
            </dd>
          </dl>
          {evaluation.barIssues.length > 0 && (
            <details>
              <summary>Bar-level issues ({evaluation.barIssues.length})</summary>
              <ul>
                {evaluation.barIssues.map((issue, i) => (
                  <li key={i}>
                    Bar {issue.bar + 1}: {issue.message}
                  </li>
                ))}
              </ul>
            </details>
          )}
        </section>
      )}

      <div className="row">
        <button className="primary" onClick={onReRecord} data-testid="re-record-button">
          Re-record
        </button>
        <button onClick={onNewSession}>New session</button>
      </div>
    </main>
  );
}
