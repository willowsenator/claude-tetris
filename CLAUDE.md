# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

Vanilla-JS Tetris: `index.html` + `style.css` + `engine.js` + `game.js`. No `package.json`, no bundler, no transpiler, no dependencies. Tests are a dependency-free browser page (`tests.html` + `tests.js`) covering `engine.js` only.

## Running

```bash
xdg-open index.html          # direct file open works (no module imports, no fetch)
xdg-open tests.html          # test suite; prints "N passed, M failed" on the page and in the console
python3 -m http.server 8000  # or any static server
```

There is no build or lint command. New logic that can be expressed as a pure function belongs in `engine.js` with a test in `tests.js` (TDD rule in the global CLAUDE.md); anything that needs the DOM or mutable game state stays in `game.js` and is verified by hand in the browser. Adding real tooling (a runner, a package manager) still needs discussion with the user — "zero dependencies / zero build" is a stated property of the project.

## Architecture

`engine.js` holds the pure, DOM-free, state-free helpers so the same code runs in the game and in `tests.html`: `createBoard(rows, cols)`, `rotateCW`, `clearRowAt`, `clearColumnAt`, `pickPowerCell`, `rotatePowerCell`, `pickLightningTarget`, `clearTarget`, `clearFullRows`, `lightningReward`, `shouldScheduleFrame`, the `POWERUPS` table and the scoring constants `LINE_SCORES` / `LIGHTNING_COLUMN_SCORE`. It must load **before** `game.js`. The rule is that anything decidable from a board and a level lives here under test; `game.js` keeps only what needs mutable state or the DOM. Several helpers take the board **and** the parallel `marks` grid and mutate both — that pairing is the invariant, not an optional extra. Only the strike is table-driven — `powerCharges` and the `KeyZ` binding are still Lightning-specific, so a second power-up is not a pure data addition. Functions that need randomness take an `rng` parameter defaulting to `Math.random` — that parameter exists purely so tests can inject a stub, and is the only randomness abstraction in the project.

`game.js` is a single IIFE-less script under `'use strict'` operating on module-level mutable globals (`board`, `powerBoard`, `powerCharges`, `current`, `next`, `score`, `lines`, `level`, `paused`, `gameOver`, `dropAccum`, `dropInterval`, `animId`). `init()` is both the boot path and the restart path — it resets every global, cancels the pending frame, and re-enters the loop. Anything added to game state must be reset there or it leaks across restarts.

Key invariants that span files:

- **Canvas size is hard-coded in `index.html`, not derived.** `<canvas id="board">` is `300×600`, which must equal `COLS × BLOCK` by `ROWS × BLOCK`. Changing `COLS`/`ROWS`/`BLOCK` in `game.js` requires editing the HTML attributes too.
- **The NEXT preview assumes a 4×4 cell area.** `drawNext()` uses a local `NB = 30` and centres the shape in a 4×4 box; `<canvas id="next-canvas">` is `120×120`. `NB` is deliberately independent of `BLOCK`.
- **DOM ids are the contract.** `game.js` resolves `board`, `next-canvas`, `score`, `lines`, `level`, `power-count`, `overlay`, `overlay-title`, `overlay-score`, `restart-btn` at load time with no null checks — renaming an id in the HTML fails silently at first use.
- **Piece encoding doubles as the colour index.** A piece's cells hold its type number 1–7, indexing into `COLORS`, and that same number is what `merge()` writes into `board`. `0` is empty. Adding a piece means extending `PIECES` and `COLORS` in lockstep and updating the `Math.floor(Math.random() * 7) + 1` in `randomPiece()`.
- **Rotation is recomputed, not indexed.** `rotateCW()` transposes + reverses; there is no rotation-state variable, so SRS-style kick tables can't be bolted on without introducing one. Current kicks are the naive `[0, -1, 1, -2, 2]` column offsets in `tryRotate()`. Anything that stores shape-relative coordinates must be remapped on rotation — `current.power` does this via `rotatePowerCell()`, which duplicates `rotateCW()`'s index mapping and has to change with it.
- **Power-up marks ride a parallel grid.** A board cell value doubles as its colour index, so which cells carry a Lightning mark is tracked in `powerBoard`, a `ROWS × COLS` grid of `0/1`. Both grids are passed together to `clearFullRows()` and to `POWERUPS.lightning.apply()`, which mutate them in lockstep; letting the two drift leaves marks floating over the wrong blocks, so new code paths must go through those helpers rather than touching `board` alone.
- **Pause/resume drives `requestAnimationFrame` directly.** `togglePause()` cancels the frame and, on resume, resets `lastTime` before re-entering `loop()` — without that reset the accumulated `dt` would instantly drop the piece. Any new code path that suspends the loop needs the same treatment.
- **The loop stops itself; `cancelAnimationFrame` alone cannot.** `loop()` ends with `if (!shouldScheduleFrame({ gameOver, paused })) return;`. A frame can end the game from inside itself (`lockPiece()` → `spawn()` → `endGame()`), and the id `endGame()` cancels is that same running frame, so cancelling is a no-op and the frame would otherwise book a successor. The `cancelAnimationFrame` in `endGame()` still matters for the keypress paths (`hardDrop`/`softDrop`), where the pending frame is real. Any new flag that should halt the loop belongs in `shouldScheduleFrame`, not in a fresh `cancelAnimationFrame` call.

Flow: `init()` → `spawn()` (promotes `next` to `current`, generates a new `next`, and calls `endGame()` if the fresh piece already collides) → `loop()` accumulates `dt`, either advances `current.y` or calls `lockPiece()` (`merge` → `clearLines` → `spawn`), draws, and books the next frame only while `shouldScheduleFrame()` allows it.

`clearFullRows()` (in `engine.js`) does the clearing and re-increments `r` to re-check the shifted row; `clearLines()` is left with scoring, `LINE_SCORES[cleared] * level`. Hard drop is 2/cell, soft drop 1/row. Level and speed are recomputed in one place, `updateLevel()`: `floor(lines / 10) + 1` and `max(100, 1000 - (level - 1) * 90)` ms — `init()` and `usePowerUp()` are the other callers. A strike's worth comes from `lightningReward()`: a row clear scores `LINE_SCORES[1] * level` and counts as a line, a column clear scores `LIGHTNING_COLUMN_SCORE * level` and does not.

## Conventions

- **Everything is English** — UI strings (`"PAUSED"`, `"GAME OVER"`, `"Restart"`, `` `Score: ${...}` ``), the README, identifiers, comments and commit messages. Keep new UI text English.
- ES6+ browser globals only — no imports, no `async`, nothing needing a server.
- `drawBlock()` is the single rendering primitive for both canvases; it takes `(context, x, y, colorIndex, size, alpha)` and no-ops on a falsy `colorIndex`, which is why the draw loops pass raw cell values without guarding. `drawPowerMark()` is its overlay counterpart, drawn in a second pass on top of an already-drawn block.
- Theme colours are CSS variables read once per theme switch in `applyTheme()` (`--grid-line`, `--power`); canvas code never hard-codes a themed colour. A new themed colour needs an entry in both `:root` and `body[data-theme='dark']`.
