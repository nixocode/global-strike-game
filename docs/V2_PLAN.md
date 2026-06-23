# GLOBAL STRIKE — V2 Plan

> Status: **in progress** · Target: shippable by end of week · Owner: Nico

V2 is a ground-up rebuild of the V1 single-file prototype (`/index.html`, ~5.2k lines, all
globals, four overlapping explosion systems). The goal is a polished, complete game that is
"twice as good": a real strategic opponent, a genuine nuclear-war **simulation** in Realistic
mode, and an over-the-top **planet-shredding spectacle** in Arcade mode — all running smooth in
the browser on desktop and mobile.

V1 stays at the repo root as a playable reference. V2 lives in `/v2` as a Vite project.

---

## 1. What V2 keeps from V1

- The Three.js globe (NASA Blue Marble, vector borders, graticule, inertia/zoom controls).
- The core loop: pick nation → doctrine → target → launch → survive retaliation → outcome.
- The **best idea in V1**: win *without* destroying the planet. Apocalypse / Pyrrhic / Victory /
  Defeat outcomes are the spine of Realistic mode.
- The UI language: DEFCON, toasts, game log, glassmorphism, dark tactical aesthetic.

## 2. What V2 fixes / adds

| Area | V1 | V2 |
|---|---|---|
| Code | 1 file, loose globals, dead code layers | Vite + ES modules, clean sim/render/ui split |
| AI | random 1–2 shots | strategic Commander: valuation, doctrine, escalation, second strike |
| Strategy | flat multipliers, 1 RNG intercept roll | triad delivery, layered defense, flight times, resources |
| Realism | fictional tiny numbers | real-ish arsenals + fallout, early warning, nuclear winter |
| Modes | one | **Realistic** (sim) + **Arcade** (spectacle) sharing one engine |
| VFX perf | per-effect geometry create/dispose each frame | pooled + `InstancedMesh`, zero per-frame alloc |
| Determinism | `Math.random()` everywhere | seeded RNG → reproducible runs, fair scoring |

---

## 3. Two modes, one engine

Both modes run the **same `Simulation`**. A **mode profile** (`data/modes.js`) flips rules and
tunes constants; nothing about the engine is hard-coded to a mode.

### Realistic mode — "the simulation"
- Real-ish arsenals and a **nuclear triad**: ICBM (fast, fixed silos), SLBM (submarines — hidden,
  survivable second strike), bombers (slow, recallable, interceptable).
- **Great-circle flight times** — Moscow→DC takes longer than a regional strike; timing matters.
- **Layered missile defense** (boost / midcourse / terminal), saturation degrades intercept.
- **Early warning + launch-on-warning**: detect inbound, decide to ride it out or launch back.
- **Fallout** drifts downwind and kills over subsequent turns; **nuclear winter** accrues with
  total yield detonated and degrades every nation's outcome.
- Outcomes: Victory / Pyrrhic / Apocalypse / Defeat, judged on survival *and* planetary health.
- Visuals grounded: mushroom clouds, scorch, fallout shading — **no planet chunks**.

### Arcade mode — "pure spectacle physics"
- Same targeting loop, dialed to absurd: giant yields, instant restock, fast turns.
- **Bits of the planet fly off** — pooled rigid-body earth chunks with low-gravity tumble,
  re-entry trails, screen shake, chromatic punch, exaggerated mushroom clouds.
- **Combo + score multiplier**: chain detonations for escalating score; on-screen score chase.
- Apocalypse isn't a fail state — it's the fireworks finale. Score + style over rules.
- Toggleable via mode profile: `gravity`, `chunkBudget`, `screenShake`, `scoring`, `restock`.

---

## 4. Architecture

Static site, no server. Vite for dev/build + bundled Three.js. Deploy = `vite build` → static
`dist/` (Vercel/Netlify/any static host).

```
v2/
  index.html
  vite.config.js
  package.json
  public/                  # static textures (or CDN fallback)
  src/
    main.js                # bootstrap: mode select → game init → loop
    core/
      GameState.js         # single source of truth (no loose globals)
      EventBus.js          # pub/sub; decouples sim ↔ render ↔ ui
      Loop.js              # fixed-timestep sim + rAF render, decoupled
      rng.js               # seeded deterministic RNG (mulberry32)
      pool.js              # generic object pool helper
    data/
      nations.js           # arsenals, triad, cities, defense
      doctrines.js         # strategic posture modifiers
      modes.js             # REALISTIC vs ARCADE profiles
    sim/                   # PURE logic — must not import THREE
      Simulation.js        # turn engine, order resolution, outcomes
      ballistics.js        # great-circle distance → flight time
      intercept.js         # layered defense resolution
      fallout.js           # drift + delayed casualties (realistic)
      winter.js            # nuclear winter accrual (realistic)
      ai/Commander.js      # strategic opponent
    render/                # ALL THREE lives here
      Globe.js
      Missiles.js
      Explosions.js        # pooled / InstancedMesh detonations + clouds
      Chunks.js            # arcade planet-chunk debris physics
      Camera.js            # zoom/inertia + screen shake
    ui/
      modeSelect.js  setup.js  hud.js  panels.js
      toast.js  defcon.js  gameOver.js  settings.js
    audio/
      audio.js             # web-audio sfx + ambient bed
```

**Rules of the codebase**
1. `sim/` is pure and headless (unit-testable, no DOM/THREE). It emits events; it never draws.
2. `render/` and `ui/` subscribe to events and read `GameState`; they never mutate sim rules.
3. All randomness goes through seeded `rng` — reproducible runs and fair scoring.
4. Every persistent visual object comes from a pool. No `new Geometry()` in the hot loop.

---

## 5. Data model (sketch)

```js
// Nation
{ id, name, flag, color, cities:[{name,lat,lng,pop}],
  arsenal: { icbm, slbm, bomber },        // counts per leg
  defense: { boost, midcourse, terminal },// intercept probabilities per layer
  doctrine }                              // AI posture

// Order (player or AI), resolved by Simulation
{ fromNationId, leg, targetNationId, cityIdx, yieldMt }

// Live state per turn
GameState = { phase, turn, seed, mode, player, nations[],
              inflight[], fallout[], winterIndex, score, combo, log[] }
```

---

## 6. Milestones (ship this week)

- **M0 — Foundation** ✅ plan · scaffold Vite · core (state/bus/loop/rng/pool)
- **M1 — Vertical slice**: globe renders, mode select, pick nation, click city, launch one
  missile, pooled explosion, turn resolves. End-to-end in both modes (arcade chunks stubbed).
- **M2 — Simulation depth**: triad, flight times, layered intercept, strategic AI, outcomes.
- **M3 — Realistic systems**: fallout, early warning, nuclear winter + outcome scoring.
- **M4 — Arcade spectacle**: planet chunks, debris physics, screen shake, combo/score.
- **M5 — Polish & ship**: UI/menus/audio, mobile + perf pass, persistence, deploy config, QA.

Each milestone is independently demoable. We adjust scope between milestones as we play it.

## 7. Open questions to revisit as we build
- Music/ambient bed: original synth vs none? (default: subtle ambient + sfx)
- Persistence depth: just high scores, or unlockables/progression? (default: high scores first)
- Multiplayer/hotseat: out of scope for this week unless we have time.
