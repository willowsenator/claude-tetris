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
  - [How it works](#how-it-works)
    - [1. `index.html`](#1-indexhtml)
    - [2. `style.css`](#2-stylecss)
    - [3. `game.js`](#3-gamejs)
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

---

## How it works

The game is made up of three files that work together:

### 1. `index.html`

Defines the visual structure:

- A **300 × 600** pixel `<canvas id="board">` where the board is rendered.
- A side panel with `SCORE`, `LINES`, `LEVEL`, the next-piece preview and the control list.
- An overlay for the **PAUSED** and **GAME OVER** states.

### 2. `style.css`

Provides the look and feel with a _dark / retro arcade_ aesthetic: dark background, monospaced typography for the counters and _backdrop blur_ on the overlays.

### 3. `game.js`

Contains all the game logic. Broadly:

- **Board model**: a `ROWS × COLS` matrix where each cell holds `0` (empty) or a color index (1–7) identifying the piece.
- **Pieces**: defined as square matrices. Rotation is computed as a transpose + row reverse (`rotateCW`).
- **Collision detection** (`collide`): checks that no cell of the piece leaves the board or overlaps already-locked blocks.
- **Wall kicks** (`tryRotate`): if the rotation collides, it tries shifting the piece ±1 and ±2 columns before discarding the turn.
- **Game loop** (`loop`): based on `requestAnimationFrame`, it accumulates elapsed time and drops the piece one row once `dropInterval` is exceeded.
- **Line clearing** (`clearLines`): walks the board from the bottom up; every full row is removed and an empty one is inserted at the top.
- **Scoring**: uses the classic table `[0, 100, 300, 500, 800]` multiplied by the current level; hard drop adds 2 points per cell travelled and soft drop 1 point per row.
- **Level and speed**: the level goes up every 10 lines; drop speed is computed as `max(100, 1000 − (level − 1) × 90)` milliseconds.
- **Ghost piece** (`ghostY`): projects the final position of the current piece downwards and draws it with `globalAlpha = 0.2`.

### Game flow

```
init()
  ├─ createBoard()                  → empty matrix
  ├─ next = randomPiece()
  ├─ spawn()                        → moves next into current and generates a new next
  └─ requestAnimationFrame(loop)
        ↓
   loop(timestamp)
     ├─ accumulates dt
     ├─ if dt ≥ dropInterval → drops the piece or calls lockPiece()
     ├─ draw()  (grid + board + ghost + current piece)
     └─ requestAnimationFrame(loop)

   keydown → move / rotate / soft-drop / hard-drop / pause
```

When a newly generated piece already collides on appearing (`spawn`), `endGame()` is triggered and the **Game Over** overlay is shown.

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
├── style.css       # Game styles (dark theme)
├── game.js         # All the Tetris logic (~300 lines)
└── README.md
```

---

## Customization

Some parameters that are easy to tweak in `game.js`:

| Constant       | Meaning                             | Default               |
| -------------- | ----------------------------------- | --------------------- |
| `COLS`         | Board columns                       | `10`                  |
| `ROWS`         | Board rows                          | `20`                  |
| `BLOCK`        | Size in pixels of each cell         | `30`                  |
| `COLORS`       | Color palette per piece type        | 7 colors              |
| `LINE_SCORES`  | Points for 1, 2, 3 or 4 cleared lines | `[0,100,300,500,800]` |
| `dropInterval` | Initial drop speed in ms            | `1000`                |

> If you change `COLS`, `ROWS` or `BLOCK`, remember to also adjust the `width` and `height` of `<canvas id="board">` in `index.html` so they match (`COLS × BLOCK` by `ROWS × BLOCK`).

---

## License

Free to use for educational and practice purposes.
