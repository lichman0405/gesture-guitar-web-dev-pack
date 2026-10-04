# Development Log

Maintained by the Supervisor per docs/AUTONOMOUS_DEV_PROTOCOL.md §9.

## Phase 0 — Bootstrap (in progress)

Decisions:
- Package manager: npm (Windows-default, zero extra install).
- Scaffold: hand-written Vite 6 + React 19 + TypeScript 5.7 (strict) instead of interactive `npm create`.
- Tests: Vitest 3 (unit, node env; jsdom for UI), Playwright (Chromium, fake media devices) for E2E.
- Lint: ESLint 9 flat config + typescript-eslint recommended + react-hooks.
- MediaPipe: `@mediapipe/tasks-vision` npm package; WASM runtime copied to `public/vendor/mediapipe-wasm` on postinstall; hand landmarker model downloaded once to `public/models/` via `npm run fetch:model` — no CDN dependency at runtime.
- Git: `git init -b main`, local-only, no remote (verified `git remote` is empty).
