'use strict';

/* Zero-dependency test runner. Open tests.html in a browser. */

const results = [];

function test(name, fn) {
  try {
    fn();
    results.push({ name, ok: true });
  } catch (e) {
    results.push({ name, ok: false, message: e.message });
  }
}

function assertEqual(actual, expected, msg) {
  const a = JSON.stringify(actual);
  const b = JSON.stringify(expected);
  if (a !== b) throw new Error(`${msg ? msg + ': ' : ''}expected ${b}, got ${a}`);
}

/* Returns an rng stub yielding the given values in order, then repeating the last one. */
function stubRng(values) {
  let i = 0;
  return () => values[Math.min(i++, values.length - 1)];
}

/* ---- createBoard ---- */

test('createBoard builds an empty matrix of the requested size', () => {
  assertEqual(createBoard(2, 3), [[0, 0, 0], [0, 0, 0]]);
});

test('createBoard gives each row its own array', () => {
  const board = createBoard(2, 2);
  board[0][0] = 1;
  assertEqual(board[1], [0, 0]);
});

/* ---- rotateCW ---- */

test('rotateCW turns a shape a quarter turn clockwise', () => {
  assertEqual(rotateCW([
    [1, 2],
    [3, 4],
  ]), [
    [3, 1],
    [4, 2],
  ]);
});

test('rotateCW transposes non-square shapes', () => {
  const rotated = rotateCW([
    [1, 1, 1, 1],
    [0, 0, 0, 0],
  ]);
  assertEqual(rotated.length, 4);
  assertEqual(rotated[0], [0, 1]);
});

/* ---- collides ---- */

test('collides returns false when every filled shape cell fits', () => {
  const board = createBoard(3, 4);
  assertEqual(collides(board, [[1, 1], [1, 0]], 1, 1), false);
});

test('collides detects a filled shape cell left of the board', () => {
  const board = createBoard(3, 4);
  assertEqual(collides(board, [[1]], -1, 0), true);
});

test('collides detects a filled shape cell at the right edge', () => {
  const board = createBoard(3, 4);
  assertEqual(collides(board, [[1]], 4, 0), true);
});

test('collides accepts a filled shape cell in the last column', () => {
  const board = createBoard(3, 4);
  assertEqual(collides(board, [[1]], 3, 0), false);
});

test('collides detects a filled shape cell at the floor', () => {
  const board = createBoard(3, 4);
  assertEqual(collides(board, [[1]], 0, 3), true);
});

test('collides accepts a filled shape cell in the bottom row', () => {
  const board = createBoard(3, 4);
  assertEqual(collides(board, [[1]], 0, 2), false);
});

test('collides detects a non-zero board cell', () => {
  const board = createBoard(3, 4);
  board[1][2] = 7;
  assertEqual(collides(board, [[1]], 2, 1), true);
});

test('collides allows filled shape cells above the board', () => {
  const board = createBoard(3, 4);
  assertEqual(collides(board, [[1], [1]], 2, -1), false);
});

test('collides ignores zero shape cells outside the board', () => {
  const board = createBoard(3, 4);
  assertEqual(collides(board, [[0, 1, 0]], -1, 0), false);
});

/* ---- dropPosition ---- */

test('dropPosition lands a shape on the bottom row of an empty board', () => {
  const board = createBoard(4, 3);
  assertEqual(dropPosition(board, [[1]], 1, 0), 3);
});

test('dropPosition leaves a shape that is already resting on the floor in place', () => {
  const board = createBoard(4, 3);
  assertEqual(dropPosition(board, [[1]], 1, 3), 3);
});

test('dropPosition lands a shape directly on top of occupied cells', () => {
  const board = createBoard(5, 3);
  board[4][1] = 7;
  board[3][1] = 7;
  assertEqual(dropPosition(board, [[1]], 1, 0), 2);
});

/* The other landing cases use a single-column shape, where every column of the
   piece meets the stack at the same height. A piece spanning columns of unequal
   height is where a landing rule goes wrong: it has to stop at the highest
   obstruction underneath it rather than sinking into the shallower column. */
test('dropPosition rests a wide shape on its highest obstruction', () => {
  const board = createBoard(5, 3);
  board[4][0] = 7;
  assertEqual(dropPosition(board, [[1, 1]], 0, 0), 3);
});

test('dropPosition handles a starting row above the board', () => {
  const board = createBoard(4, 3);
  assertEqual(dropPosition(board, [[1], [1]], 1, -1), 2);
});

test('dropPosition does not mutate the board or shape', () => {
  const board = createBoard(4, 3);
  board[3][1] = 7;
  const shape = [[1, 1]];
  const boardBefore = board.map(row => [...row]);
  const shapeBefore = shape.map(row => [...row]);
  dropPosition(board, shape, 0, 0);
  assertEqual(board, boardBefore, 'board');
  assertEqual(shape, shapeBefore, 'shape');
});

/* ---- clearRowAt ---- */

test('clearRowAt removes the row and shifts everything above down', () => {
  const board = [
    [1, 0],
    [2, 2],
    [3, 3],
  ];
  clearRowAt(board, 2);
  assertEqual(board, [
    [0, 0],
    [1, 0],
    [2, 2],
  ]);
});

test('clearRowAt keeps the board height constant', () => {
  const board = [[1, 1], [1, 1]];
  clearRowAt(board, 0);
  assertEqual(board.length, 2);
});

test('clearRowAt leaves rows below the cleared row untouched', () => {
  const board = [
    [1, 1],
    [2, 2],
    [3, 3],
  ];
  clearRowAt(board, 1);
  assertEqual(board[2], [3, 3]);
});

/* ---- clearColumnAt ---- */

test('clearColumnAt empties every cell of the column', () => {
  const board = [
    [1, 2, 3],
    [4, 5, 6],
  ];
  clearColumnAt(board, 1);
  assertEqual(board, [
    [1, 0, 3],
    [4, 0, 6],
  ]);
});

test('clearColumnAt does not shift anything vertically', () => {
  const board = [
    [0, 1],
    [2, 3],
  ];
  clearColumnAt(board, 0);
  assertEqual(board, [
    [0, 1],
    [0, 3],
  ]);
});

/* ---- pickPowerCell ---- */

test('pickPowerCell returns a filled cell of the shape', () => {
  const shape = [
    [0, 3, 0],
    [3, 3, 3],
    [0, 0, 0],
  ];
  const pos = pickPowerCell(shape, stubRng([0]));
  assertEqual(pos, { r: 0, c: 1 });
});

test('pickPowerCell picks the last filled cell for an rng near 1', () => {
  const shape = [
    [0, 3, 0],
    [3, 3, 3],
    [0, 0, 0],
  ];
  const pos = pickPowerCell(shape, stubRng([0.99]));
  assertEqual(pos, { r: 1, c: 2 });
});

test('pickPowerCell returns null for an empty shape', () => {
  assertEqual(pickPowerCell([[0, 0], [0, 0]], stubRng([0])), null);
});

/* ---- rotatePowerCell ---- */

test('rotatePowerCell follows the same mapping as rotateCW', () => {
  const shape = [
    [0, 3, 0],
    [3, 3, 3],
    [0, 0, 0],
  ];
  const pos = { r: 0, c: 1 };
  const rotated = rotateCW(shape);
  const moved = rotatePowerCell(pos, shape.length);
  assertEqual(rotated[moved.r][moved.c], shape[pos.r][pos.c]);
  assertEqual(moved, { r: 1, c: 2 });
});

test('rotatePowerCell returns the mark to its origin after four turns', () => {
  const shape = [
    [0, 3, 0],
    [3, 3, 3],
    [0, 0, 0],
  ];
  let pos = { r: 0, c: 1 };
  for (let i = 0; i < 4; i++) pos = rotatePowerCell(pos, shape.length);
  assertEqual(pos, { r: 0, c: 1 });
});

test('rotatePowerCell handles non-square shapes', () => {
  const shape = [
    [1, 1, 1, 1],
    [0, 0, 0, 0],
  ];
  const pos = { r: 0, c: 3 };
  const rotated = rotateCW(shape);
  const moved = rotatePowerCell(pos, shape.length);
  assertEqual(rotated[moved.r][moved.c], 1);
});

/* ---- pickLightningTarget ---- */

test('pickLightningTarget picks a row among the non-empty ones', () => {
  const board = [
    [0, 0],
    [0, 0],
    [1, 0],
  ];
  const target = pickLightningTarget(board, stubRng([0.1, 0]));
  assertEqual(target, { kind: 'row', index: 2 });
});

test('pickLightningTarget picks a column when the coin flip says so', () => {
  const board = [
    [1, 0, 1],
    [1, 0, 1],
  ];
  const target = pickLightningTarget(board, stubRng([0.9, 0.99]));
  assertEqual(target, { kind: 'column', index: 2 });
});

test('pickLightningTarget never strikes an empty column', () => {
  const board = [
    [0, 1, 0],
    [0, 1, 0],
  ];
  const target = pickLightningTarget(board, stubRng([0.9, 0]));
  assertEqual(target, { kind: 'column', index: 1 });
});

test('pickLightningTarget picks the last candidate row for an rng near 1', () => {
  const board = [
    [1, 0],
    [0, 0],
    [0, 1],
  ];
  const target = pickLightningTarget(board, stubRng([0.1, 0.99]));
  assertEqual(target, { kind: 'row', index: 2 });
});

test('pickLightningTarget falls back to a column on an empty board', () => {
  const board = [
    [0, 0],
    [0, 0],
  ];
  const target = pickLightningTarget(board, stubRng([0, 0]));
  assertEqual(target.kind, 'column');
});

/* ---- clearTarget ---- */

test('clearTarget clears a row target', () => {
  const board = [[1, 1], [2, 2]];
  clearTarget(board, { kind: 'row', index: 1 });
  assertEqual(board, [[0, 0], [1, 1]]);
});

test('clearTarget clears a column target', () => {
  const board = [[1, 1], [2, 2]];
  clearTarget(board, { kind: 'column', index: 1 });
  assertEqual(board, [[1, 0], [2, 0]]);
});

/* ---- clearFullRows ---- */

test('clearFullRows clears a full row and reports it', () => {
  const board = [
    [1, 0],
    [2, 3],
  ];
  const marks = createBoard(2, 2);
  const result = clearFullRows(board, marks);
  assertEqual(result, { cleared: 1, charges: 0 });
  assertEqual(board, [[0, 0], [1, 0]]);
});

test('clearFullRows leaves a board with no full row alone', () => {
  const board = [
    [1, 0],
    [0, 2],
  ];
  const result = clearFullRows(board, createBoard(2, 2));
  assertEqual(result, { cleared: 0, charges: 0 });
  assertEqual(board, [[1, 0], [0, 2]]);
});

test('clearFullRows banks every mark carried by a cleared row', () => {
  const board = [
    [0, 0],
    [1, 2],
  ];
  const marks = [
    [0, 0],
    [1, 1],
  ];
  const result = clearFullRows(board, marks);
  assertEqual(result, { cleared: 1, charges: 2 });
  assertEqual(marks, [[0, 0], [0, 0]]);
});

test('clearFullRows handles several full rows at once', () => {
  const board = [
    [1, 0],
    [1, 1],
    [2, 2],
  ];
  const marks = [
    [0, 0],
    [1, 0],
    [0, 1],
  ];
  const result = clearFullRows(board, marks);
  assertEqual(result, { cleared: 2, charges: 2 });
  assertEqual(board, [[0, 0], [0, 0], [1, 0]]);
});

test('clearFullRows keeps surviving marks aligned with their blocks', () => {
  const board = [
    [0, 5],
    [1, 1],
  ];
  const marks = [
    [0, 1],
    [0, 0],
  ];
  clearFullRows(board, marks);
  // The 5 fell from row 0 to row 1, and its mark fell with it.
  assertEqual(board, [[0, 0], [0, 5]]);
  assertEqual(marks, [[0, 0], [0, 1]]);
});

/* ---- POWERUPS.lightning ---- */

test('lightning clears the row it targets on both grids', () => {
  const board = [
    [0, 0],
    [1, 2],
  ];
  const marks = [
    [0, 0],
    [1, 0],
  ];
  const target = POWERUPS.lightning.apply(board, marks, stubRng([0, 0]));
  assertEqual(target, { kind: 'row', index: 1 });
  assertEqual(board, [[0, 0], [0, 0]]);
  assertEqual(marks, [[0, 0], [0, 0]]);
});

test('lightning clears the column it targets on both grids', () => {
  const board = [
    [1, 2],
    [3, 4],
  ];
  const marks = [
    [1, 0],
    [1, 1],
  ];
  const target = POWERUPS.lightning.apply(board, marks, stubRng([0.9, 0]));
  assertEqual(target, { kind: 'column', index: 0 });
  assertEqual(board, [[0, 2], [0, 4]]);
  assertEqual(marks, [[0, 0], [0, 1]]);
});

/* ---- lightningReward ---- */

test('a row strike scores a single line clear and counts as a line', () => {
  assertEqual(lightningReward({ kind: 'row', index: 0 }, 1), { points: LINE_SCORES[1], lines: 1 });
});

test('a column strike scores less and counts as no line', () => {
  assertEqual(lightningReward({ kind: 'column', index: 0 }, 1),
    { points: LIGHTNING_COLUMN_SCORE, lines: 0 });
});

test('lightning rewards scale with the level', () => {
  assertEqual(lightningReward({ kind: 'row', index: 0 }, 3).points, LINE_SCORES[1] * 3);
  assertEqual(lightningReward({ kind: 'column', index: 0 }, 3).points, LIGHTNING_COLUMN_SCORE * 3);
});

/* ---- shouldScheduleFrame ---- */

test('a running game keeps the loop going', () => {
  assertEqual(shouldScheduleFrame({ gameOver: false, paused: false }), true);
});

test('a finished game stops the loop', () => {
  assertEqual(shouldScheduleFrame({ gameOver: true, paused: false }), false);
});

test('a paused game stops the loop', () => {
  assertEqual(shouldScheduleFrame({ gameOver: false, paused: true }), false);
});

test('a game that is both finished and paused stops the loop', () => {
  assertEqual(shouldScheduleFrame({ gameOver: true, paused: true }), false);
});

test('an open pause menu stops the loop', () => {
  assertEqual(shouldScheduleFrame({ gameOver: false, paused: false, menuOpen: true }), false);
});

test('a closed pause menu keeps the loop going', () => {
  assertEqual(shouldScheduleFrame({ gameOver: false, paused: false, menuOpen: false }), true);
});

/* ---- canOpenPauseMenu ---- */

test('a running game can open the pause menu', () => {
  assertEqual(canOpenPauseMenu({ started: true, gameOver: false, menuOpen: false }), true);
});

test('the pause menu cannot open before the first game starts', () => {
  assertEqual(canOpenPauseMenu({ started: false, gameOver: false, menuOpen: false }), false);
});

test('a finished game cannot open the pause menu', () => {
  assertEqual(canOpenPauseMenu({ started: true, gameOver: true, menuOpen: false }), false);
});

test('an already open pause menu does not open again', () => {
  assertEqual(canOpenPauseMenu({ started: true, gameOver: false, menuOpen: true }), false);
});

/* ---- emptyLeaderboard ---- */

test('an empty leaderboard has no entries', () => {
  assertEqual(emptyLeaderboard(), []);
});

test('each empty leaderboard is a fresh array', () => {
  const a = emptyLeaderboard();
  a.push({ name: 'A', score: 1, bestCombo: 0, maxLines: 0 });
  assertEqual(emptyLeaderboard(), []);
});

/* ---- qualifiesForLeaderboard ---- */

function lbEntry(name, score) {
  return { name, score, bestCombo: 0, maxLines: 0 };
}

test('any score qualifies for an empty leaderboard', () => {
  assertEqual(qualifiesForLeaderboard([], 10, 5), true);
});

test('a score of zero still qualifies while there is a free slot', () => {
  assertEqual(qualifiesForLeaderboard([], 0, 5), true);
});

test('a score qualifies while the leaderboard is not full', () => {
  assertEqual(qualifiesForLeaderboard([lbEntry('A', 900)], 1, 5), true);
});

test('a score above the lowest entry qualifies on a full leaderboard', () => {
  const full = [500, 400, 300, 200, 100].map((s, i) => lbEntry(`P${i}`, s));
  assertEqual(qualifiesForLeaderboard(full, 150, 5), true);
});

test('a score below every entry does not qualify on a full leaderboard', () => {
  const full = [500, 400, 300, 200, 100].map((s, i) => lbEntry(`P${i}`, s));
  assertEqual(qualifiesForLeaderboard(full, 50, 5), false);
});

test('a score tied with the lowest entry does not displace it', () => {
  const full = [500, 400, 300, 200, 100].map((s, i) => lbEntry(`P${i}`, s));
  assertEqual(qualifiesForLeaderboard(full, 100, 5), false);
});

test('a score of zero does not qualify on a full leaderboard', () => {
  const full = [500, 400, 300, 200, 100].map((s, i) => lbEntry(`P${i}`, s));
  assertEqual(qualifiesForLeaderboard(full, 0, 5), false);
});

/* ---- insertLeaderboardEntry ---- */

test('inserting into an empty leaderboard puts the entry first', () => {
  const result = insertLeaderboardEntry([], lbEntry('A', 100), 5);
  assertEqual(result.index, 0);
  assertEqual(result.entries, [lbEntry('A', 100)]);
});

test('a new entry lands in score order', () => {
  const entries = [lbEntry('A', 300), lbEntry('B', 100)];
  const result = insertLeaderboardEntry(entries, lbEntry('C', 200), 5);
  assertEqual(result.index, 1);
  assertEqual(result.entries.map(e => e.name), ['A', 'C', 'B']);
});

test('a tie keeps the older entry ahead of the newcomer', () => {
  const entries = [lbEntry('A', 200), lbEntry('B', 100)];
  const result = insertLeaderboardEntry(entries, lbEntry('C', 200), 5);
  assertEqual(result.index, 1);
  assertEqual(result.entries.map(e => e.name), ['A', 'C', 'B']);
});

test('inserting never grows the leaderboard past its maximum', () => {
  const full = [500, 400, 300, 200, 100].map((s, i) => lbEntry(`P${i}`, s));
  const result = insertLeaderboardEntry(full, lbEntry('New', 450), 5);
  assertEqual(result.entries.length, 5);
  assertEqual(result.index, 1);
  assertEqual(result.entries.map(e => e.score), [500, 450, 400, 300, 200]);
});

test('an entry pushed off the end reports no row to highlight', () => {
  const full = [500, 400, 300, 200, 100].map((s, i) => lbEntry(`P${i}`, s));
  const result = insertLeaderboardEntry(full, lbEntry('New', 10), 5);
  assertEqual(result.index, -1);
  assertEqual(result.entries.map(e => e.score), [500, 400, 300, 200, 100]);
});

test('inserting leaves the original list untouched', () => {
  const entries = [lbEntry('A', 100)];
  insertLeaderboardEntry(entries, lbEntry('B', 200), 5);
  assertEqual(entries.map(e => e.name), ['A']);
});

test('an inserted entry keeps its combo and line statistics', () => {
  const entry = { name: 'A', score: 100, bestCombo: 3, maxLines: 4 };
  assertEqual(insertLeaderboardEntry([], entry, 5).entries[0], entry);
});

/* ---- normalizeStat ---- */

/* Reached only through normalizeLeaderboard, which is why these cases were never
   pinned: the entries that carry them are dropped by its filter before the stat
   is read. The contract is still its own — every unusable value becomes 0, and a
   usable one is floored — so it is tested where it can actually be seen. */

test('normalizeStat keeps a positive whole number', () => {
  assertEqual(normalizeStat(7), 7);
});

test('normalizeStat floors a fractional value', () => {
  assertEqual(normalizeStat(4.9), 4);
});

test('normalizeStat reads a numeric string', () => {
  assertEqual(normalizeStat('12'), 12);
});

test('normalizeStat turns a negative value into zero', () => {
  assertEqual(normalizeStat(-3), 0);
});

test('normalizeStat turns zero into zero', () => {
  assertEqual(normalizeStat(0), 0);
});

test('normalizeStat turns a non-numeric value into zero', () => {
  assertEqual(normalizeStat('nope'), 0);
});

test('normalizeStat turns a missing value into zero', () => {
  assertEqual(normalizeStat(undefined), 0);
});

test('normalizeStat turns an infinite value into zero', () => {
  assertEqual(normalizeStat(Infinity), 0);
});

/* ---- normalizeLeaderboard ---- */

test('a missing stored leaderboard normalizes to an empty list', () => {
  assertEqual(normalizeLeaderboard(null, 5), []);
});

test('a stored value that is not an array normalizes to an empty list', () => {
  assertEqual(normalizeLeaderboard('garbage', 5), []);
  assertEqual(normalizeLeaderboard({ score: 10 }, 5), []);
  assertEqual(normalizeLeaderboard(42, 5), []);
});

test('entries that are not objects are dropped', () => {
  assertEqual(normalizeLeaderboard(['x', null, 7], 5), []);
});

test('an entry with a non-numeric score is dropped', () => {
  const raw = [{ name: 'A', score: 'lots' }, { name: 'B', score: 10 }];
  assertEqual(normalizeLeaderboard(raw, 5).map(e => e.name), ['B']);
});

test('a stored leaderboard comes back sorted by score', () => {
  const raw = [{ name: 'A', score: 10 }, { name: 'B', score: 30 }, { name: 'C', score: 20 }];
  assertEqual(normalizeLeaderboard(raw, 5).map(e => e.name), ['B', 'C', 'A']);
});

test('a stored leaderboard is truncated to the maximum', () => {
  const raw = [10, 20, 30, 40, 50, 60].map(s => ({ name: 's' + s, score: s }));
  assertEqual(normalizeLeaderboard(raw, 5).map(e => e.score), [60, 50, 40, 30, 20]);
});

test('missing fields are filled with safe defaults', () => {
  assertEqual(normalizeLeaderboard([{ score: 10 }], 5),
    [{ name: 'Anonymous', score: 10, bestCombo: 0, maxLines: 0 }]);
});

test('out-of-range statistics are coerced to whole non-negative numbers', () => {
  const raw = [{ name: 'A', score: 10.7, bestCombo: -3, maxLines: 2.9 }];
  assertEqual(normalizeLeaderboard(raw, 5),
    [{ name: 'A', score: 10, bestCombo: 0, maxLines: 2 }]);
});

test('a non-string name is replaced rather than kept', () => {
  assertEqual(normalizeLeaderboard([{ name: { evil: true }, score: 5 }], 5)[0].name, 'Anonymous');
});

/* ---- nextCombo ---- */

test('a lock that clears lines extends the combo', () => {
  assertEqual(nextCombo(0, 1), 1);
  assertEqual(nextCombo(2, 4), 3);
});

test('a lock that clears nothing breaks the combo', () => {
  assertEqual(nextCombo(5, 0), 0);
});

/* ---- skins ---- */

test('every skin declares an id, a label and a block style', () => {
  assertEqual(SKINS.every(s => typeof s.id === 'string' && s.id), true);
  assertEqual(SKINS.every(s => typeof s.label === 'string' && s.label), true);
  assertEqual(SKINS.every(s => typeof s.blockStyle === 'string' && s.blockStyle), true);
});

test('skin ids are unique', () => {
  assertEqual(new Set(SKINS.map(s => s.id)).size, SKINS.length);
});

test('the four advertised skins are present', () => {
  assertEqual(SKINS.map(s => s.id), ['retro', 'neon', 'pastel', 'pixel']);
});

test('every skin defines a colour for all seven piece indices', () => {
  SKINS.forEach(skin => {
    for (let i = 1; i <= 7; i++)
      assertEqual(typeof skinColor(skin, i), 'string', `${skin.id} index ${i}`);
  });
});

test('every skin leaves index 0 falsy so drawBlock no-ops on empty cells', () => {
  SKINS.forEach(skin => assertEqual(!skinColor(skin, 0), true, skin.id));
});

test('skinColor is falsy for an index outside the piece range', () => {
  assertEqual(!skinColor(resolveSkin('retro'), 8), true);
});

test('the retro skin keeps the original palette', () => {
  assertEqual(resolveSkin('retro').colors, [
    null, '#4dd0e1', '#ffd54f', '#ba68c8', '#81c784', '#e57373', '#7986cb', '#ffb74d',
  ]);
});

test('resolveSkin returns the skin matching an id', () => {
  assertEqual(resolveSkin('neon').id, 'neon');
});

test('resolveSkin falls back to retro for an unknown id', () => {
  assertEqual(resolveSkin('bogus').id, 'retro');
});

test('resolveSkin falls back to retro for a missing id', () => {
  assertEqual(resolveSkin().id, 'retro');
});

test('resolveSkin falls back to retro for null', () => {
  assertEqual(resolveSkin(null).id, 'retro');
});

test('resolveSkin falls back to retro for a non-string id', () => {
  assertEqual(resolveSkin(3).id, 'retro');
  assertEqual(resolveSkin({ id: 'neon' }).id, 'retro');
});

/* ---- clampStartLevel ---- */

test('clampStartLevel keeps a level that is already in range', () => {
  assertEqual(clampStartLevel(7, 15), 7);
});

test('clampStartLevel lifts anything below one up to one', () => {
  assertEqual(clampStartLevel(0, 15), 1);
  assertEqual(clampStartLevel(-4, 15), 1);
});

test('clampStartLevel caps anything above the maximum at the maximum', () => {
  assertEqual(clampStartLevel(99, 15), 15);
});

test('clampStartLevel accepts the two ends of the range unchanged', () => {
  assertEqual(clampStartLevel(1, 15), 1);
  assertEqual(clampStartLevel(15, 15), 15);
});

test('clampStartLevel floors a fractional level', () => {
  assertEqual(clampStartLevel(3.9, 15), 3);
});

test('clampStartLevel falls back to one for a value that is not a number', () => {
  assertEqual(clampStartLevel('abc', 15), 1);
  assertEqual(clampStartLevel(null, 15), 1);
  assertEqual(clampStartLevel(undefined, 15), 1);
});

test('clampStartLevel reads a numeric string, which is what storage returns', () => {
  assertEqual(clampStartLevel('5', 15), 5);
});

/* ---- levelDropInterval ---- */

test('level one drops at one second per row', () => {
  assertEqual(levelDropInterval(1), 1000);
});

test('each level shaves ninety milliseconds off the drop interval', () => {
  assertEqual(levelDropInterval(2), 910);
  assertEqual(levelDropInterval(5), 640);
});

test('the drop interval never falls below one hundred milliseconds', () => {
  assertEqual(levelDropInterval(11), 100);
  assertEqual(levelDropInterval(50), 100);
});

/* ---- report ---- */

const passed = results.filter(r => r.ok).length;
const failed = results.length - passed;
const summary = `${passed} passed, ${failed} failed`;

console.log(summary);
results.filter(r => !r.ok).forEach(r => console.log(`FAIL ${r.name} — ${r.message}`));

/* The suite reports two ways. In the browser the page is the report, so results
   are written into it. Run headlessly there is no page, and the only thing a
   caller can act on is the exit code — leaving it unset made a green run and a
   failing one indistinguishable, which is why nothing automated could use this
   suite. `process` is checked separately from `document` because neither implies
   the other. */
if (typeof document !== 'undefined') {
  const summaryEl = document.getElementById('summary');
  summaryEl.textContent = summary;
  summaryEl.style.color = failed ? 'var(--overlay-title)' : 'var(--value)';

  const list = document.getElementById('results');
  results.forEach(r => {
    const li = document.createElement('li');
    li.className = r.ok ? 'test-pass' : 'test-fail';
    li.textContent = `${r.ok ? '✓' : '✗'} ${r.name}${r.ok ? '' : ' — ' + r.message}`;
    list.appendChild(li);
  });
} else if (typeof process !== 'undefined') {
  process.exitCode = failed ? 1 : 0;
}
