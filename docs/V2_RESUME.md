# Global Strike V2 — Resume Plan

_Last session: 2026-06-23. Pick up here._

## Where things stand
- **All of V2 is committed and pushed** on branch `v2-rebuild` (`8656323` rebuild + balance fix, `3f2b45c` M5 features). Not yet merged to `main`.
- The full game runs end-to-end in **both modes**. Realistic mode is now **winnable** (proportional escalation ladder fixed the guaranteed-apocalypse bug).
- M5 in progress: high-score persistence, pause/settings overlay, and Vercel deploy config are **done**; production build verified.

## How to start tomorrow
```bash
cd v2
npm install      # if node_modules is gone
npm run dev      # http://localhost:5173
```
First thing: **playtest a realistic game** to confirm the new balance feels right in actual play (headless tests pass, but feel needs a human).

## Next-up work, in priority order

### 1. Merge or keep iterating (decide first)
- Either open a PR `v2-rebuild → main` and merge, or keep building on the branch. The pre-existing unrelated `index.html` (V1) edit is intentionally left unstaged — decide whether to keep, commit, or discard it.

### 2. Playtest-driven balance tuning (realistic mode)
- Confirm small/medium/large exchanges feel distinct. Tunables: `Commander._escalation()` weights, `ratio`/`reserveFrac` in `planRetaliation()`, `winter.js` `SOOT_PER_DET`, mode thresholds in `data/modes.js`.
- Sanity-check arcade still feels over-the-top after the AI changes (it shares the Commander).

### 3. Early warning / launch-on-warning (realistic-only sim feature)
- Surface inbound detection: when the AI launches, show a warning window + projected impacts before they land; let the player commit a retaliatory volley "on warning." Touches `Simulation` (expose inbound to a new pre-impact phase) + HUD. This is the biggest remaining *design* piece.

### 4. Mobile + perf pass
- Touch: pointer events already wired — verify drag/zoom/target-tap on a real phone; check the ⚙ pause button + HUD layout at small widths (CSS already has a 680px breakpoint).
- Perf: bundle is a single **581 KB** chunk (Three.js dominates). Add `build.rollupOptions.output.manualChunks` to split Three.js out for faster first paint. Profile the arcade chunk storm on a mid-tier device.

### 5. Ship polish
- Bloom param confirmation on the real GPU (see prior notes — SwiftShader can't show bloom).
- DEFCON detail panel / event log surfacing (optional UI depth).
- Favicon, page `<title>`, social meta for the deploy.

## Key files (quick map)
- Engine: `v2/src/sim/Simulation.js`, `ai/Commander.js`, `ballistics.js`, `intercept.js`, `fallout.js`, `winter.js`
- Modes/data: `v2/src/data/modes.js`, `doctrines.js`, `nations.js`
- Render: `v2/src/render/*` (Globe, Missiles, Explosions, CrustShell, Cracks, Chunks, Shockwaves, Trail, RegionLabels, Markers)
- UI: `v2/src/ui/*` (modeSelect, setup, hud, gameOver, pauseMenu, toast)
- Persistence/loop/state: `v2/src/core/*` (storage, GameState, Loop, EventBus, rng, pool)
</content>
