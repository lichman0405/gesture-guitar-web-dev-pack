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
  "vocal-wav": "下载人声（WAV）",
  "guitar-wav": "下载吉他（WAV）",
  "mix-wav": "下载混音（WAV）",
  "performance-json": "下载演奏记录（JSON）",
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
        <h2>正在生成导出文件…</h2>
        <p>正在本机合成吉他音轨并生成音频文件，请稍候。</p>
      </main>
    );
  }

  if (!results) {
    return (
      <main className="screen results-screen">
        <h2>暂无录音结果</h2>
        <button onClick={onReRecord}>返回演奏</button>
      </main>
    );
  }

  const mixUrl = urls.get("mix-wav");
  const evaluation = results.evaluation;

  return (
    <main className="screen results-screen" data-testid="results-screen">
      <h2>录音结果</h2>
      <p className="hint">录音编号：{results.sessionId}。所有文件均在本机生成。</p>

      {mixUrl && (
        <section className="results-playback">
          <h3>混音试听</h3>
          <audio aria-label="混音试听" controls src={mixUrl} data-testid="mix-playback" />
        </section>
      )}

      <section className="results-exports">
        <h3>下载文件</h3>
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
                {ARTIFACT_LABELS[artifact.kind] ?? "导出文件"}
              </button>
            );
          })}
        </div>
        {results.failures.length > 0 && (
          <div className="export-failures">
            <h4>部分文件未能生成</h4>
            <ul>
              {results.failures.map((f) => (
                <li key={f.kind}>
                  <strong>{ARTIFACT_LABELS[f.kind] ?? "导出文件"}:</strong> {f.message === "No tracks available to mix" ? "没有可用于混音的音轨。" : "生成失败，请先下载其他可用文件，再重新录制后重试。"}
                </li>
              ))}
            </ul>
            <p className="hint">如演奏记录已生成，可以先下载演奏记录（JSON）保存原始事件。</p>
          </div>
        )}
      </section>

      {evaluation && (
        <section className="results-metrics" data-testid="evaluation">
          <h3>节奏与准确度</h3>
          <dl>
            <dt>扫弦命中</dt>
            <dd>
              {evaluation.strumHit} / {evaluation.strumExpected}
            </dd>
            <dt>方向正确</dt>
            <dd>
              {evaluation.directionCorrect} / {evaluation.strumExpected}
            </dd>
            <dt>平均节奏误差</dt>
            <dd>{evaluation.avgTimingErrorMs.toFixed(0)} 毫秒</dd>
            <dt>节奏误差波动</dt>
            <dd>{evaluation.timingSpreadMs.toFixed(0)} 毫秒</dd>
            <dt>漏扫次数</dt>
            <dd>{evaluation.missedStrums}</dd>
            <dt>多扫次数</dt>
            <dd>{evaluation.extraStrums}</dd>
            <dt>和弦命中</dt>
            <dd>
              {evaluation.chordHit} / {evaluation.chordExpected}
            </dd>
          </dl>
          {evaluation.barIssues.length > 0 && (
            <details>
              <summary>各小节问题 ({evaluation.barIssues.length})</summary>
              <ul>
                {evaluation.barIssues.map((issue, i) => (
                  <li key={i}>
                    第 {issue.bar + 1} 小节： {issue.message}
                  </li>
                ))}
              </ul>
            </details>
          )}
        </section>
      )}

      <div className="row">
        <button className="primary" onClick={onReRecord} data-testid="re-record-button">
          再录一次
        </button>
        <button onClick={onNewSession}>结束并返回首页</button>
      </div>
    </main>
  );
}
