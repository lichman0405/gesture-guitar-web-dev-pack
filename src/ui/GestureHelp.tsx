import type { PerformanceController } from "../app/performanceController";
import { SLOT_IDS, DEFAULT_SLOT_GESTURES, GESTURE_LABELS } from "../gesture/gestureTypes";

export function GestureHelp({ controller, handedness }: {
  controller: PerformanceController; handedness: "right" | "left";
}) {
  return <details className="keyboard-hints" open>
    <summary>手势怎么弹</summary>
    <p>{handedness === "right" ? "左手选和弦，右手扫弦" : "右手选和弦，左手扫弦"}。手心朝镜头，双手保持在画面里。</p>
    <table><tbody>{SLOT_IDS.map((slot) => <tr key={slot}>
      <td>{GESTURE_LABELS[DEFAULT_SLOT_GESTURES[slot]]}</td><td>{controller.resolveSlot(slot) ?? "未分配"}</td>
    </tr>)}</tbody></table>
    <p>食指姿势：拇指可自然搭在收起的手指上。L 姿势：拇指向手掌外侧张开。摇滚姿势：食指、小指伸出，中指、无名指弯曲即可，拇指可自然放置。</p>
    <p>和弦手保持约 0.2 秒；其余手指自然收起。扫弦手的拇指和食指可以轻捏，像拿拨片一样；手腕在绿色区域附近连续上下摆动，每次换向都可以出声，无须停顿或大幅挥手。完全握拳可闷音，捏拨片姿势不会闷音。校准时把扫弦手放在准备弹的位置。</p>
  </details>;
}
