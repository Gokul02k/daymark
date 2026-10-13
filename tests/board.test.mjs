import assert from 'node:assert/strict';
import test from 'node:test';
import {
  addList,
  addTask,
  deleteList,
  deleteTask,
  dueChoice,
  emptyBoard,
  groupOpenTasks,
  mergeBoards,
  remindersDue,
  resolveDue,
  shiftDay,
  reorderTasks,
  restoreList,
  restoreTasks,
  updateTask,
} from '../app/lib/board.js';

test('edit, due date, and overdue grouping', () => {
  let board = addTask(emptyBoard(), { title: 'Buy milk', dueAt: '2020-01-01' });
  const id = board.tasks[0].id;
  board = updateTask(board, id, { title: 'Buy oat milk', remind: true });
  assert.equal(board.tasks[0].title, 'Buy oat milk');
  assert.equal(board.tasks[0].remind, true);
  const groups = groupOpenTasks(board, 'inbox', '2026-10-13');
  assert.equal(groups.overdue.length, 1);
  assert.equal(groups.today.length, 0);
});

test('lists stay separate and inbox cannot be removed', () => {
  let board = addList(emptyBoard(), 'Work');
  const work = board.lists.find((list) => list.name === 'Work');
  board = addTask(board, { listId: work.id, title: 'Ship it' });
  board = addTask(board, { title: 'Home' });
  assert.equal(groupOpenTasks(board, work.id, '2026-10-13').none.length, 1);
  assert.equal(groupOpenTasks(board, 'inbox', '2026-10-13').none.length, 1);
  const blocked = deleteList(board, 'inbox');
  assert.equal(blocked.removed, null);
  const removed = deleteList(board, work.id);
  assert.equal(removed.board.tasks.some((task) => task.title === 'Ship it'), false);
  const restored = restoreList(removed.board, removed.removed);
  assert.equal(restored.tasks.some((task) => task.title === 'Ship it'), true);
});

test('delete can be undone, including a step', () => {
  let board = addTask(emptyBoard(), { title: 'Write' });
  const parent = board.tasks[0].id;
  board = addTask(board, { title: 'Outline', parentId: parent });
  const removed = deleteTask(board, parent);
  assert.equal(removed.board.tasks.length, 0);
  assert.equal(removed.removed.length, 2);
  const restored = restoreTasks(removed.board, removed.removed);
  assert.equal(restored.tasks.length, 2);
});

test('reorder keeps the dragged order', () => {
  let board = addTask(emptyBoard(), { title: 'First' });
  board = addTask(board, { title: 'Second' });
  const [first, second] = ['First', 'Second'].map((title) => board.tasks.find((task) => task.title === title).id);
  board = reorderTasks(board, [first, second]);
  const none = groupOpenTasks(board, 'inbox', '2026-10-13').none;
  assert.deepEqual(none.map((task) => task.title), ['First', 'Second']);
});

test('due choices resolve to a day, or to no date limit', () => {
  const today = '2026-10-31';
  assert.equal(shiftDay(today, 1), '2026-11-01');
  assert.equal(resolveDue({ kind: 'none', date: '2026-12-01' }, today), null);
  assert.equal(resolveDue({ kind: 'today', date: '' }, today), today);
  assert.equal(resolveDue({ kind: 'tomorrow', date: '' }, today), '2026-11-01');
  assert.equal(resolveDue({ kind: 'pick', date: '' }, today), null);
  assert.equal(resolveDue({ kind: 'pick', date: '2026-12-01' }, today), '2026-12-01');
  assert.equal(dueChoice(null, today).kind, 'none');
  assert.equal(dueChoice('2026-11-01', today).kind, 'tomorrow');
  assert.deepEqual(dueChoice('2026-12-01', today), { kind: 'pick', date: '2026-12-01' });
});

test('a reminder fires from 9 AM on its day, once', () => {
  let board = addTask(emptyBoard(), { title: 'Pay rent', dueAt: '2026-10-13', remind: true });
  board = addTask(board, { title: 'No reminder', dueAt: '2026-10-13' });
  assert.equal(remindersDue(board, '2026-10-13', 8).length, 0);
  assert.deepEqual(remindersDue(board, '2026-10-13', 9).map((task) => task.title), ['Pay rent']);
  assert.equal(remindersDue(board, '2026-10-14', 0).length, 1);
  board = updateTask(board, board.tasks[0].id, { remindedOn: '2026-10-13' });
  assert.equal(remindersDue(board, '2026-10-13', 10).length, 0);
});

test('higher priority sits first, and only known levels are kept', () => {
  let board = addTask(emptyBoard(), { title: 'Low', priority: 'low' });
  board = addTask(board, { title: 'High', priority: 'high' });
  board = addTask(board, { title: 'Plain' });
  board = addTask(board, { title: 'Odd', priority: 'urgent' });
  const order = () => groupOpenTasks(board, 'inbox', '2026-10-13').none.map((task) => task.title);
  assert.deepEqual(order(), ['High', 'Low', 'Odd', 'Plain']);
  const plain = board.tasks.find((task) => task.title === 'Plain');
  board = updateTask(board, plain.id, { priority: 'medium' });
  assert.deepEqual(order(), ['High', 'Plain', 'Low', 'Odd']);
  board = addTask(board, { title: 'Step', parentId: plain.id, priority: 'high' });
  assert.equal(board.tasks.find((task) => task.title === 'Step').priority, 'none');
});

test('two devices keep a new task and a deletion', () => {
  const start = addTask(emptyBoard(), { title: 'Shared' });
  const phone = addTask(start, { title: 'From phone' });
  const removed = deleteTask(start, start.tasks[0].id);
  const merged = mergeBoards(phone, removed.board);
  assert.equal(merged.tasks.some((task) => task.title === 'From phone'), true);
  assert.equal(merged.tasks.some((task) => task.title === 'Shared'), false);
});
