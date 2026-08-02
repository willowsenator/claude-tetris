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

/* ---- POWERUPS.lightning ---- */

test('lightning clears the row it targets', () => {
  const board = [
    [0, 0],
    [1, 2],
  ];
  const target = POWERUPS.lightning.apply(board, stubRng([0, 0]));
  assertEqual(target, { kind: 'row', index: 1 });
  assertEqual(board, [[0, 0], [0, 0]]);
});

test('lightning clears the column it targets', () => {
  const board = [
    [1, 2],
    [3, 4],
  ];
  const target = POWERUPS.lightning.apply(board, stubRng([0.9, 0]));
  assertEqual(target, { kind: 'column', index: 0 });
  assertEqual(board, [[0, 2], [0, 4]]);
});

/* ---- report ---- */

const passed = results.filter(r => r.ok).length;
const failed = results.length - passed;
const summary = `${passed} passed, ${failed} failed`;

console.log(summary);
results.filter(r => !r.ok).forEach(r => console.log(`FAIL ${r.name} — ${r.message}`));

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
