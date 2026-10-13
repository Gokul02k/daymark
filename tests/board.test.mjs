import assert from 'node:assert/strict';
import test from 'node:test';
import {
  addList,
  addTask,
  deleteList,
  deleteTask,
  emptyBoard,
  groupOpenTasks,
  mergeBoards,
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

test('two devices keep a new task and a deletion', () => {
  const start = addTask(emptyBoard(), { title: 'Shared' });
  const phone = addTask(start, { title: 'From phone' });
  const removed = deleteTask(start, start.tasks[0].id);
  const merged = mergeBoards(phone, removed.board);
  assert.equal(merged.tasks.some((task) => task.title === 'From phone'), true);
  assert.equal(merged.tasks.some((task) => task.title === 'Shared'), false);
});
