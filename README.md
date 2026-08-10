# Tetris

An implementation of the classic **Tetris** in vanilla JavaScript, using HTML5 Canvas and CSS. No external dependencies, no frameworks, no build process: just open it and play.

![Tech](https://img.shields.io/badge/HTML5-Canvas-orange)
![Tech](https://img.shields.io/badge/CSS3-blueviolet)
![Tech](https://img.shields.io/badge/JavaScript-Vanilla-yellow)

---

## Table of contents

- [Tetris](#tetris)
  - [Table of contents](#table-of-contents)
  - [What the project does](#what-the-project-does)
  - [How to run the game](#how-to-run-the-game)
    - [Option 1: open the file directly](#option-1-open-the-file-directly)
    - [Option 2: local server (recommended)](#option-2-local-server-recommended)
  - [Controls](#controls)
  - [Lightning power-up](#lightning-power-up)
  - [Tests](#tests)
  - [How it works](#how-it-works)
    - [1. `index.html`](#1-indexhtml)
    - [2. `style.css`](#2-stylecss)
    - [3. `engine.js`](#3-enginejs)
    - [4. `game.js`](#4-gamejs)
    - [Game flow](#game-flow)
  - [Technologies](#technologies)
  - [Project structure](#project-structure)
  - [Customization](#customization)
  - [License](#license)

---

## What the project does

It is a playable version of classic Tetris with all the mechanics you would expect:

- A **10 × 20** cell board.
- The **7 standard pieces** (I, O, T, S, Z, J, L) with distinct colors.
- **Rotation** with basic _wall kicks_ (small shifts so a piece can rotate while flush against a wall).
- **Soft drop** (accelerated descent) and **hard drop** (instant drop).
- **Ghost piece**: shows where the current piece will land.
- **Preview** of the next piece.
- **Classic Tetris scoring** (100 / 300 / 500 / 800 multiplied by level).
- **Levels** that go up every 10 lines and speed up the fall.
- **Pause** and **Game Over** with a restart option.
- A **Lightning power-up** that wipes a whole row or column.
- Four **visual skins** — Retro, Neon, Pastel and Pixel art — switchable from the side panel and remembered between sessions.

---

## How to run the game

There is nothing to install or compile. You have two options:

### Option 1: open the file directly

```bash
open index.html        # macOS
xdg-open index.html    # Linux
start index.html       # Windows
```

### Option 2: local server (recommended)

Any static server works. A few examples:

```bash
# With Python 3
python3 -m http.server 8000

# With Node.js (npx)
npx serve .

# With PHP
php -S localhost:8000
```

Then open `http://localhost:8000` in your browser.

---

## Controls

| Key       | Action                        |
| --------- | ----------------------------- |
| `←` / `→` | Move the piece horizontally   |
| `↑` or `X`| Rotate the piece clockwise    |
| `↓`       | Soft drop (fall faster)       |
| `Space`   | Hard drop (instant drop)      |
| `P`       | Pause / resume                |
| `Z`       | Use a Lightning charge        |

---

## Lightning power-up

Every so often a spawning piece carries a **marked cell** — a dark dot drawn on one of its
blocks, visible in the `NEXT` preview as well. Clear the board row that block ends up in and you
bank one Lightning charge; the `LIGHTNING` counter in the side panel shows how many you hold.

Pressing `Z` spends one charge and strikes at random:

- a **row** — chosen among the rows that still hold blocks, cleared exactly like a line clear
  (counts as one line, scores `100 × level`);
- a **column** — cleared in place, leaving whatever floated above it where it was
  (scores `50 × level`, does not count as a line).

The strike itself lives in the `POWERUPS` table in `engine.js`, isolated from the game state. A
second power-up would still need work in `game.js` — the charge counter, the `Z` binding and the
scoring branch are all specific to Lightning today.

---

## Tests

The pure board logic in `engine.js` is covered by a dependency-free suite that runs two ways.

As a page, opened like the game:

```bash
xdg-open tests.html
```

The page lists every test and a `N passed, M failed` summary (also logged to the console).

Or headlessly, with no runner and no dependency:

```bash
node -e "$(cat engine.js; cat tests.js)"
```

This prints the same summary, names each failure, and **exits 0 when everything passes and 1 when
anything fails** — so a script, a CI job or an agent can act on the result. `tests.js` picks its
reporting form at runtime: it writes into the page when a `document` exists, and sets the exit code
when one does not.

---

## How it works

The game is made up of four files that work together:

### 1. `index.html`

Defines the visual structure:

- A **300 × 600** pixel `<canvas id="board">` where the board is rendered.
- A side panel with `SCORE`, `LINES`, `LEVEL`, `LIGHTNING`, the next-piece preview, the skin selector and the control list.
- An overlay for the **PAUSED** and **GAME OVER** states.

### 2. `style.css`

Provides the look and feel: a light and a dark theme built from CSS custom properties, monospaced typography for the counters and _backdrop blur_ on the overlays. The three colours the canvas paints with — `--skin-board-bg`, `--skin-grid-line` and `--skin-power` (the Lightning mark) — are declared per skin as well as per theme, so a skin and the light/dark toggle compose instead of fighting.

### 3. `engine.js`

Holds the pure helpers that need no DOM and no game state, so the same code runs in the game and
in `tests.html`: board building and rotation (`createBoard`, `rotateCW`), collision and the
landing row a piece drops to (`collides`, `dropPosition`), clearing
(`clearRowAt`, `clearColumnAt`, `clearFullRows`, `clearTarget`), the power-up rules
(`pickPowerCell`, `rotatePowerCell`, `pickLightningTarget`, `lightningReward`, the `POWERUPS`
table), the loop-continuation rule (`shouldScheduleFrame`) and the scoring constants. The dividing
line: anything decidable from a board and a level lives here, under test; `game.js` keeps what
needs mutable state or the DOM.

Every function that needs randomness takes an `rng` parameter defaulting to `Math.random`, which
is what makes the tests deterministic.

### 4. `game.js`

Contains all the game logic. Broadly:

- **Board model**: a `ROWS × COLS` matrix where each cell holds `0` (empty) or a color index (1–7) identifying the piece.
- **Pieces**: defined as square matrices. Rotation is computed as a transpose + row reverse (`rotateCW`).
- **Collision detection** (`collide`): checks that no cell of the piece leaves the board or overlaps already-locked blocks.
- **Wall kicks** (`tryRotate`): if the rotation collides, it tries shifting the piece ±1 and ±2 columns before discarding the turn.
- **Game loop** (`loop`): based on `requestAnimationFrame`, it accumulates elapsed time and drops the piece one row once `dropInterval` is exceeded. It asks `shouldScheduleFrame` before booking the next frame, so the frame that ends the game is the last one. Pausing is handled earlier, by `togglePause()` cancelling the pending frame; the predicate states the whole "may the game advance" rule in one place so future flags have somewhere to go.
- **Line clearing** (`clearLines`): delegates to `clearFullRows` in `engine.js`, which walks the board from the bottom up removing every full row and inserting an empty one at the top, and reports how many Lightning marks the cleared rows carried.
- **Scoring**: uses the classic table `[0, 100, 300, 500, 800]` multiplied by the current level; hard drop adds 2 points per cell travelled and soft drop 1 point per row.
- **Level and speed**: the level goes up every 10 lines; drop speed is computed as `max(100, 1000 − (level − 1) × 90)` milliseconds.
- **Ghost piece** (`dropPosition` / `ghostY`): the tested engine helper projects the final position of the current piece downwards; `ghostY` binds it to game state, and the result is drawn with `globalAlpha = 0.2`.
- **Power-up tracking**: a `powerBoard` matrix mirrors `board` and marks which landed cells carry a Lightning mark, since a board cell value already doubles as its color index. Both grids are passed together to the `engine.js` helpers that clear them, so they are always mutated in lockstep.

### Game flow

```
init()
  ├─ createBoard(ROWS, COLS)        → empty matrix (board and powerBoard)
  ├─ next = randomPiece()
  ├─ spawn()                        → moves next into current and generates a new next
  └─ requestAnimationFrame(loop)
        ↓
   loop(timestamp)
     ├─ accumulates dt
     ├─ if dt ≥ dropInterval → drops the piece or calls lockPiece()
     ├─ draw()  (grid + board + ghost + current piece)
     └─ requestAnimationFrame(loop)   only if shouldScheduleFrame(...)

   keydown → move / rotate / soft-drop / hard-drop / lightning / pause
```

When a newly generated piece already collides on appearing (`spawn`), `endGame()` is triggered and
the **Game Over** overlay is shown. The end can be reached from inside a frame, which cannot cancel
itself — so the loop checks `shouldScheduleFrame` after drawing and simply does not book another
frame. `endGame()` draws once itself, because a hard or soft drop ends the game outside the loop
and nothing else would render the piece that just locked. Either way the final stack is left frozen
under the overlay, without the piece that failed to spawn.

---

## Technologies

- **HTML5** — markup and two `<canvas>` elements (board and preview).
- **CSS3** — _flexbox_, color variables, `backdrop-filter` and `box-shadow`.
- **Vanilla JavaScript (ES6+)** — `const`/`let`, _arrow functions_, _spread operator_, `Array.from`, _template literals_…
- **Canvas 2D API** — for all game rendering.
- **`requestAnimationFrame`** — for the game loop, synced with the browser.

**No dependencies.** There is no `package.json`, no bundler, no transpiler.

---

## Project structure

```
03-tetris/
├── index.html      # DOM structure and canvases
├── style.css       # Game styles (light / dark themes)
├── engine.js       # Pure board helpers and the POWERUPS table
├── game.js         # All the Tetris logic
├── tests.html      # Test page for engine.js (the suite also runs under node)
├── tests.js        # Tests and the tiny runner
└── README.md
```

---

## Customization

Some parameters that are easy to tweak:

| Constant                  | File        | Meaning                                    | Default               |
| ------------------------- | ----------- | ------------------------------------------ | --------------------- |
| `COLS`                    | `game.js`   | Board columns                              | `10`                  |
| `ROWS`                    | `game.js`   | Board rows                                 | `20`                  |
| `BLOCK`                   | `game.js`   | Size in pixels of each cell                | `30`                  |
| `SKINS`                   | `engine.js` | Visual skins and their piece palettes      | 4 skins               |
| `dropInterval`            | `game.js`   | Initial drop speed in ms                   | `1000`                |
| `POWER_CHANCE`            | `game.js`   | Odds that a piece carries a Lightning mark | `0.15`                |
| `LINE_SCORES`             | `engine.js` | Points for 1, 2, 3 or 4 cleared lines      | `[0,100,300,500,800]` |
| `LIGHTNING_COLUMN_SCORE`  | `engine.js` | Points for a Lightning column strike       | `50`                  |

> If you change `COLS`, `ROWS` or `BLOCK`, remember to also adjust the `width` and `height` of `<canvas id="board">` in `index.html` so they match (`COLS × BLOCK` by `ROWS × BLOCK`).

---

## License

Free to use for educational and practice purposes.
