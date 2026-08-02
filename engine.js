'use strict';

/* Pure board helpers, free of DOM and of game state, so they can be unit tested
   (tests.html) as well as used by game.js. Browser globals only — no modules. */

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

/* Applies a target to any board-shaped grid, so the game can mirror a strike
   onto its parallel power-up grid without repeating the dispatch. */
function clearTarget(board, target) {
  if (target.kind === 'row') clearRowAt(board, target.index);
  else clearColumnAt(board, target.index);
}

const POWERUPS = {
  lightning: {
    apply(board, rng = Math.random) {
      const target = pickLightningTarget(board, rng);
      clearTarget(board, target);
      return target;
    },
  },
};
