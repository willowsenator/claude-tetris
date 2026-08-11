'use strict';

/* Pure board rules, free of DOM and of game state, so they can be unit tested
   (tests.html) as well as used by game.js. Browser globals only — no modules.

   Several helpers take two grids: the board itself and `marks`, a grid of the
   same shape holding 1 where a cell carries a power-up mark. They are always
   mutated together — a mark must never outlive the block under it. */

const LINE_SCORES = [0, 100, 300, 500, 800];
const LIGHTNING_COLUMN_SCORE = 50;

function createBoard(rows, cols) {
  return Array.from({ length: rows }, () => new Array(cols).fill(0));
}

function rotateCW(shape) {
  const rows = shape.length, cols = shape[0].length;
  const result = Array.from({ length: cols }, () => new Array(rows).fill(0));
  for (let r = 0; r < rows; r++)
    for (let c = 0; c < cols; c++)
      result[c][rows - 1 - r] = shape[r][c];
  return result;
}

function collides(board, shape, ox, oy) {
  const rows = board.length;
  const cols = board[0].length;
  for (let r = 0; r < shape.length; r++) {
    for (let c = 0; c < shape[r].length; c++) {
      if (!shape[r][c]) continue;
      const nx = ox + c;
      const ny = oy + r;
      if (nx < 0 || nx >= cols || ny >= rows) return true;
      if (ny >= 0 && board[ny][nx] !== 0) return true;
    }
  }
  return false;
}

function dropPosition(board, shape, ox, oy) {
  let y = oy;
  while (!collides(board, shape, ox, y + 1)) y++;
  return y;
}

/* Removes row r in place and pushes a blank row on top, like a natural line clear. */
function clearRowAt(board, r) {
  board.splice(r, 1);
  board.unshift(new Array(board[0].length).fill(0));
}

/* Empties column c in place. Nothing falls: a column clear leaves no gap to close. */
function clearColumnAt(board, c) {
  for (const row of board) row[c] = 0;
}

/* Clears every full row, mirroring each clear on `marks`. Returns how many rows
   went and how many marks they carried away, which is what the game banks as
   power-up charges. Walks bottom-up and re-checks the row that shifts into place. */
function clearFullRows(board, marks) {
  let cleared = 0;
  let charges = 0;
  for (let r = board.length - 1; r >= 0; r--) {
    if (board[r].every(v => v !== 0)) {
      charges += marks[r].filter(v => v).length;
      clearRowAt(board, r);
      clearRowAt(marks, r);
      cleared++;
      r++;
    }
  }
  return { cleared, charges };
}

/* Picks one filled cell of a piece shape to carry a power-up mark, or null if none. */
function pickPowerCell(shape, rng = Math.random) {
  const cells = [];
  for (let r = 0; r < shape.length; r++)
    for (let c = 0; c < shape[r].length; c++)
      if (shape[r][c]) cells.push({ r, c });
  if (!cells.length) return null;
  return cells[Math.floor(rng() * cells.length)];
}

/* Same index mapping as rotateCW, for the mark riding along with the shape.
   `rows` is the row count of the shape BEFORE the rotation. */
function rotatePowerCell(pos, rows) {
  return { r: pos.c, c: rows - 1 - pos.r };
}

/* Chooses what lightning strikes. Only rows and columns that still hold blocks
   are candidates, so a charge is never spent on empty space. An empty board has
   no candidates at all, and the strike falls on an arbitrary column. */
function pickLightningTarget(board, rng = Math.random) {
  const nonEmptyRows = [];
  for (let r = 0; r < board.length; r++)
    if (board[r].some(v => v !== 0)) nonEmptyRows.push(r);

  const nonEmptyCols = [];
  for (let c = 0; c < board[0].length; c++)
    if (board.some(row => row[c] !== 0)) nonEmptyCols.push(c);

  const wantsRow = rng() < 0.5;
  if (wantsRow && nonEmptyRows.length) {
    return { kind: 'row', index: nonEmptyRows[Math.floor(rng() * nonEmptyRows.length)] };
  }
  if (nonEmptyCols.length) {
    return { kind: 'column', index: nonEmptyCols[Math.floor(rng() * nonEmptyCols.length)] };
  }
  return { kind: 'column', index: Math.floor(rng() * board[0].length) };
}

/* Applies a target to one board-shaped grid. */
function clearTarget(board, target) {
  if (target.kind === 'row') clearRowAt(board, target.index);
  else clearColumnAt(board, target.index);
}

const POWERUPS = {
  lightning: {
    apply(board, marks, rng = Math.random) {
      const target = pickLightningTarget(board, rng);
      clearTarget(board, target);
      clearTarget(marks, target);
      return target;
    },
  },
};

/* What a lightning strike is worth. A row is cleared like a line clear and
   counts as one; a column is not a line, so it scores less and counts as none. */
function lightningReward(target, level) {
  return target.kind === 'row'
    ? { points: LINE_SCORES[1] * level, lines: 1 }
    : { points: LIGHTNING_COLUMN_SCORE * level, lines: 0 };
}

/* Whether the animation loop should schedule another frame. A game that has ended,
   is paused, or has the pause menu open must not advance. The loop has to ask before
   rescheduling because a frame can end the game from inside itself, and at that point
   it is too late to cancel: the frame it would cancel is the one already running.
   `menuOpen` is optional so a caller that knows nothing about the menu still works. */
function shouldScheduleFrame({ gameOver, paused, menuOpen }) {
  return !gameOver && !paused && !menuOpen;
}

/* Keeps a chosen starting level inside 1..max. The value can come from localStorage
   or from a form control, so it may be a string, a fraction or nothing at all;
   anything that is not a usable number falls back to level 1. */
function clampStartLevel(n, max) {
  const level = Math.floor(Number(n));
  if (!Number.isFinite(level)) return 1;
  return Math.min(Math.max(level, 1), max);
}

/* Milliseconds a piece waits before falling one row at the given level. Kept here
   rather than inside the level bump so a game can also *start* above level 1 with
   the right speed. */
function levelDropInterval(level) {
  return Math.max(100, 1000 - (level - 1) * 90);
}

/* ---- Leaderboard ----------------------------------------------------------
   Pure list rules for the local top-N table. The storage I/O itself lives in
   game.js; everything decidable from a list of entries lives here. An entry is
   { name, score, bestCombo, maxLines }. */

const LEADERBOARD_MAX = 5;
const LEADERBOARD_DEFAULT_NAME = 'Anonymous';

function emptyLeaderboard() {
  return [];
}

/* Purely positional: a score gets in while there is a free slot, or when it
   beats the lowest entry outright. A tie loses, so an existing record is never
   displaced by an equal one. */
function qualifiesForLeaderboard(entries, score, max = LEADERBOARD_MAX) {
  if (entries.length < max) return true;
  return score > entries[entries.length - 1].score;
}

/* Places an entry by score, highest first, and trims back to `max`. Ties keep
   the older entry ahead. Returns the new list plus the index the entry landed
   on so the caller can highlight that row — -1 when the trim dropped it. */
function insertLeaderboardEntry(entries, entry, max = LEADERBOARD_MAX) {
  let index = entries.findIndex(e => entry.score > e.score);
  if (index === -1) index = entries.length;
  const next = [...entries.slice(0, index), entry, ...entries.slice(index)].slice(0, max);
  return { entries: next, index: index < max ? index : -1 };
}

function normalizeStat(value) {
  const n = Math.floor(Number(value));
  return Number.isFinite(n) && n > 0 ? n : 0;
}

/* Rebuilds a trustworthy list out of whatever came back from storage. Anything
   unusable is dropped rather than repaired — a corrupt value must not reach the
   rendering code — while a merely incomplete entry gets defaults. */
function normalizeLeaderboard(raw, max = LEADERBOARD_MAX) {
  if (!Array.isArray(raw)) return emptyLeaderboard();
  return raw
    .filter(e => e && typeof e === 'object' && typeof e.score === 'number' && Number.isFinite(e.score))
    .map(e => ({
      name: typeof e.name === 'string' && e.name.trim() ? e.name.trim() : LEADERBOARD_DEFAULT_NAME,
      score: normalizeStat(e.score),
      bestCombo: normalizeStat(e.bestCombo),
      maxLines: normalizeStat(e.maxLines),
    }))
    .sort((a, b) => b.score - a.score)
    .slice(0, max);
}

/* The combo counter: consecutive locks that each cleared at least one line. */
function nextCombo(currentCombo, clearedThisLock) {
  return clearedThisLock > 0 ? currentCombo + 1 : 0;
}

/* Visual skins. Data only — engine.js must stay DOM-free, so a skin says WHAT to
   paint and the canvas code in game.js decides HOW. `colors` is indexed by the
   piece type exactly like the board cells are, which is why slot 0 stays null:
   drawBlock no-ops on a falsy colour and the draw loops pass raw cell values.
   `blockStyle` selects the drawing branch, `glow` is a shadow blur radius in
   pixels and `radius` a corner radius; both are 0 when the style ignores them.
   Everything else a skin changes (board background, grid line, mark colour) is a
   CSS custom property, so canvas code never hard-codes a themed colour. */
const SKINS = [
  {
    id: 'retro',
    label: 'Retro',
    blockStyle: 'flat',
    glow: 0,
    radius: 0,
    colors: [null, '#4dd0e1', '#ffd54f', '#ba68c8', '#81c784', '#e57373', '#7986cb', '#ffb74d'],
  },
  {
    id: 'neon',
    label: 'Neon',
    blockStyle: 'glow',
    glow: 12,
    radius: 0,
    colors: [null, '#00e5ff', '#ffee00', '#e040fb', '#00ff88', '#ff1f5a', '#3d7bff', '#ff8a00'],
  },
  {
    id: 'pastel',
    label: 'Pastel',
    blockStyle: 'rounded',
    glow: 0,
    radius: 7,
    colors: [null, '#a8dde0', '#ffe6a7', '#d9bdf0', '#bfe3c3', '#f6b8bd', '#bcc4ef', '#ffd3ab'],
  },
  {
    id: 'pixel',
    label: 'Pixel art',
    blockStyle: 'pixel',
    glow: 0,
    radius: 0,
    colors: [null, '#3fa7d6', '#f0c419', '#8e44ad', '#4f9d4f', '#c0392b', '#3a5bbf', '#e07b1f'],
  },
];

const DEFAULT_SKIN_ID = 'retro';

/* Anything can reach this: a stale localStorage value, a hand-edited one, or
   nothing at all. Every unknown input resolves to the default skin rather than
   throwing, so a bad stored id can never stop the game from rendering. */
function resolveSkin(id) {
  return SKINS.find(entry => entry.id === id) || SKINS.find(entry => entry.id === DEFAULT_SKIN_ID);
}

/* The colour a piece type paints in this skin. Mirrors drawBlock's contract:
   an empty cell (0) and any index outside the piece range come back falsy. */
function skinColor(skin, colorIndex) {
  return skin.colors[colorIndex] ?? null;
}
