import { useSyncExternalStore } from "react";
import type { AppStore } from "../app/state/appStore";

/** React binding for AppStore snapshots. */
export function useAppStore<T extends object>(store: AppStore<T>): T {
  return useSyncExternalStore(
    (cb) => store.subscribe(cb),
    () => store.getSnapshot(),
    () => store.getSnapshot(),
  );
}
