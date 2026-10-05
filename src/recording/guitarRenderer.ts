import type { RecordedSession } from "../performance/session";
import type { GuitarRenderOptions, OfflineAudioContextLike } from "./types";
import type { GuitarAudioContext } from "../music/engine/GuitarEngine";
import { ProceduralGuitarEngine } from "../music/engine/ProceduralGuitarEngine";

export async function renderGuitarTrack(
  session: RecordedSession,
  options: GuitarRenderOptions,
): Promise<{ samples: Float32Array; sampleRate: number }> {
  const sampleRate = options.sampleRate;
  const lastEventT = session.events.length > 0 ? session.events[session.events.length - 1].t : 0;
  const duration = Math.max(0.5, options.durationSeconds ?? (lastEventT + 3.0));
  const frames = Math.ceil(duration * sampleRate);

  type OfflineCtxConstructor = new (
    channels: number,
    length: number,
    sampleRate: number,
  ) => OfflineAudioContextLike;

  const globalCtor = (globalThis as unknown as { OfflineAudioContext?: OfflineCtxConstructor }).OfflineAudioContext;

  let ctx: OfflineAudioContextLike;
  if (options.createOfflineContext) {
    ctx = options.createOfflineContext(1, frames, sampleRate);
  } else if (globalCtor) {
    ctx = new globalCtor(1, frames, sampleRate);
  } else {
    throw new Error("OfflineAudioContext is not available and no createOfflineContext factory was provided");
  }

  const engine = new ProceduralGuitarEngine(ctx as unknown as GuitarAudioContext);
  engine.connect(ctx.destination);
  engine.setPreset(session.settings.instrumentPreset);
  await engine.prepare();

  const sortedEvents = [...session.events].sort((a, b) => a.t - b.t);
  for (const event of sortedEvents) {
    switch (event.type) {
      case "chord":
        engine.setChord(event.chord);
        break;
      case "strum":
        engine.scheduleStrum(event, event.t);
        break;
      case "mute":
        engine.setMuted(event.active, event.t);
        break;
      case "control":
        // ignored
        break;
      default:
        // exhaustive
        break;
    }
  }

  const buffer = await ctx.startRendering();
  const channelData = buffer.getChannelData(0);
  return {
    samples: new Float32Array(channelData),
    sampleRate,
  };
}
