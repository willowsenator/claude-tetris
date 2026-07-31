# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

Vanilla-JS Tetris: `index.html` + `style.css` + `game.js`. No `package.json`, no bundler, no transpiler, no dependencies, **no test harness**.

## Running

```bash
xdg-open index.html          # direct file open works (no module imports, no fetch)
python3 -m http.server 8000  # or any static server
```

There is no build, lint, or test command. If a change needs a test (see the TDD rule in the global CLAUDE.md), the harness has to be introduced first — discuss with the user before adding tooling, since "zero dependencies / zero build" is a stated property of the project.

## Architecture

`game.js` is a single IIFE-less script under `'use strict'` operating on module-level mutable globals (`board`, `current`, `next`, `score`, `lines`, `level`, `paused`, `gameOver`, `dropAccum`, `dropInterval`, `animId`). `init()` is both the boot path and the restart path — it resets every global, cancels the pending frame, and re-enters the loop. Anything added to game state must be reset there or it leaks across restarts.

Key invariants that span files:

- **Canvas size is hard-coded in `index.html`, not derived.** `<canvas id="board">` is `300×600`, which must equal `COLS × BLOCK` by `ROWS × BLOCK`. Changing `COLS`/`ROWS`/`BLOCK` in `game.js` requires editing the HTML attributes too.
- **The NEXT preview assumes a 4×4 cell area.** `drawNext()` uses a local `NB = 30` and centres the shape in a 4×4 box; `<canvas id="next-canvas">` is `120×120`. `NB` is deliberately independent of `BLOCK`.
- **DOM ids are the contract.** `game.js` resolves `board`, `next-canvas`, `score`, `lines`, `level`, `overlay`, `overlay-title`, `overlay-score`, `restart-btn` at load time with no null checks — renaming an id in the HTML fails silently at first use.
- **Piece encoding doubles as the colour index.** A piece's cells hold its type number 1–7, indexing into `COLORS`, and that same number is what `merge()` writes into `board`. `0` is empty. Adding a piece means extending `PIECES` and `COLORS` in lockstep and updating the `Math.floor(Math.random() * 7) + 1` in `randomPiece()`.
- **Rotation is recomputed, not indexed.** `rotateCW()` transposes + reverses; there is no rotation-state variable, so SRS-style kick tables can't be bolted on without introducing one. Current kicks are the naive `[0, -1, 1, -2, 2]` column offsets in `tryRotate()`.
- **Pause/resume drives `requestAnimationFrame` directly.** `togglePause()` cancels the frame and, on resume, resets `lastTime` before re-entering `loop()` — without that reset the accumulated `dt` would instantly drop the piece. Any new code path that suspends the loop needs the same treatment.

Flow: `init()` → `spawn()` (promotes `next` to `current`, generates a new `next`, and calls `endGame()` if the fresh piece already collides) → `loop()` accumulates `dt` and either advances `current.y` or calls `lockPiece()` (`merge` → `clearLines` → `spawn`).

`clearLines()` splices full rows and re-increments `r` to re-check the shifted row; scoring is `LINE_SCORES[cleared] * level`, hard drop 2/cell, soft drop 1/row. Level is `floor(lines / 10) + 1` and speed is `max(100, 1000 - (level - 1) * 90)` ms.

## Conventions

- **Everything is English** — UI strings (`"PAUSED"`, `"GAME OVER"`, `"Restart"`, `` `Score: ${...}` ``), the README, identifiers, comments and commit messages. Keep new UI text English.
- ES6+ browser globals only — no imports, no `async`, nothing needing a server.
- `drawBlock()` is the single rendering primitive for both canvases; it takes `(context, x, y, colorIndex, size, alpha)` and no-ops on a falsy `colorIndex`, which is why the draw loops pass raw cell values without guarding.
