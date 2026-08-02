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
