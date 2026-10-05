import type { PerformanceController } from "../app/performanceController";

const POSES = ["食指", "食指＋中指", "食指＋中指＋无名指", "四指伸直，拇指收起", "五指张开", "竖起拇指"];

export function GestureHelp({ controller, handedness }: {
  controller: PerformanceController; handedness: "right" | "left";
}) {
  return <details className="keyboard-hints" open>
    <summary>手势怎么弹</summary>
    <p>{handedness === "right" ? "左手选和弦，右手扫弦" : "右手选和弦，左手扫弦"}。手心朝镜头，双手保持在画面里。</p>
    <table><tbody>{POSES.map((pose, index) => <tr key={pose}>
      <td>{pose}</td><td>{controller.resolveSlot(`slot-${index + 1}`) ?? "未分配"}</td>
    </tr>)}</tbody></table>
    <p>和弦手保持约 0.2 秒；扫弦手上下穿过绿色区域，握拳可闷音。识别不稳时，改善正面光照并重新校准。</p>
  </details>;
}
