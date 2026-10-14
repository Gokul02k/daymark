import assert from 'node:assert/strict';
import test from 'node:test';
import {
  activityDays,
  activityWeek,
  addEntry,
  addList,
  addTask,
  dayActivity,
  deleteEntry,
  restoreEntries,
  deleteList,
  dayInZone,
  defaultRemindAt,
  deleteTask,
  dueChoice,
  emptyBoard,
  groupOpenTasks,
  mergeBoards,
  normalizeBoard,
  reminderInstant,
  reminderKey,
  reminderMessage,
  remindersDue,
  remindersForDay,
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

test('a reminder fires at its time where it was set, once, and again after a new time', () => {
  let board = addTask(emptyBoard(), {
    title: 'Pay rent',
    dueAt: '2026-10-13',
    remind: true,
    remindAt: '18:30',
    remindTz: 'Asia/Kolkata',
  });
  board = addTask(board, { title: 'No reminder', dueAt: '2026-10-13' });
  const [task] = board.tasks;
  assert.equal(reminderInstant(task), Date.parse('2026-10-13T13:00:00Z'));
  assert.equal(remindersDue(board, Date.parse('2026-10-13T12:59:00Z')).length, 0);
  assert.deepEqual(remindersDue(board, Date.parse('2026-10-13T13:00:00Z')).map((item) => item.title), ['Pay rent']);

  board = updateTask(board, task.id, { remindedOn: reminderKey(task) });
  assert.equal(remindersDue(board, Date.parse('2026-10-14T00:00:00Z')).length, 0);

  board = updateTask(board, task.id, { remindAt: '20:00' });
  assert.equal(remindersDue(board, Date.parse('2026-10-13T14:29:00Z')).length, 0);
  assert.equal(remindersDue(board, Date.parse('2026-10-13T14:30:00Z')).length, 1);
});

test('a reminder without a zone uses the one it is checked in', () => {
  const board = addTask(emptyBoard(), { title: 'Call', dueAt: '2026-03-08', remind: true, remindAt: '09:00' });
  assert.equal(reminderInstant(board.tasks[0], 'America/New_York'), Date.parse('2026-03-08T13:00:00Z'));
  assert.equal(reminderInstant(board.tasks[0], 'Asia/Kolkata'), Date.parse('2026-03-08T03:30:00Z'));
});

test('the morning job collects the whole day, and old sends stay sent', () => {
  let board = addTask(emptyBoard(), { title: 'Later today', dueAt: '2026-10-13', remind: true, remindAt: '21:00' });
  board = addTask(board, { title: 'Tomorrow', dueAt: '2026-10-14', remind: true });
  assert.deepEqual(remindersForDay(board, '2026-10-13').map((task) => task.title), ['Later today']);

  const old = normalizeBoard({
    tasks: [{ id: 'a', title: 'Old', dueAt: '2026-10-13', remind: true, remindedOn: '2026-10-13' }],
  });
  assert.equal(old.tasks[0].remindedOn, '2026-10-13 09:00');
  assert.equal(remindersForDay(old, '2026-10-13').length, 0);
});

test('the suggested time is 9 AM, or the next hour once 9 AM has passed today', () => {
  const afternoon = new Date(2026, 9, 13, 16, 5);
  assert.equal(defaultRemindAt('2026-10-13', afternoon), '17:00');
  assert.equal(defaultRemindAt('2026-10-14', afternoon), '09:00');
  assert.equal(defaultRemindAt('2026-10-13', new Date(2026, 9, 13, 8, 0)), '09:00');
  assert.equal(defaultRemindAt(null, afternoon), '09:00');
});

test('the daily job reads the day where each phone is', () => {
  const night = new Date('2026-10-13T20:00:00Z');
  assert.equal(dayInZone('Asia/Kolkata', night), '2026-10-14');
  assert.equal(dayInZone('America/New_York', night), '2026-10-13');
  assert.equal(dayInZone('Not/AZone', night).length, 10);
});

test('one reminder names the task; several lead with the most important', () => {
  let board = addTask(emptyBoard(), { title: 'Pay rent', dueAt: '2026-10-12', remind: true });
  assert.equal(reminderMessage(board.tasks, '2026-10-13').body, 'Pay rent is overdue');
  board = addTask(board, { title: 'Call bank', dueAt: '2026-10-13', remind: true, priority: 'high' });
  board = addTask(board, { title: 'Water plants', dueAt: '2026-10-13', remind: true });
  board = addTask(board, { title: 'Book tickets', dueAt: '2026-10-13', remind: true });
  assert.equal(
    reminderMessage(board.tasks, '2026-10-13').body,
    '4 tasks due: Call bank, Pay rent, Water plants, and 1 more',
  );
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

const utcDay = (iso) => iso.slice(0, 10);

function at(board, id, fields) {
  return { ...board, tasks: board.tasks.map((task) => (task.id === id ? { ...task, ...fields } : task)) };
}

test('a day shows what was logged, added, and finished, and whether it was on time', () => {
  let board = addEntry(emptyBoard(), 'Gym 1 hour', '2026-10-12T02:00:00Z');
  board = addTask(board, { title: 'Pay rent', dueAt: '2026-10-10' });
  board = addTask(board, { title: 'Book tickets', dueAt: '2026-10-12' });
  const [rent, tickets] = board.tasks;
  board = at(board, rent.id, { createdAt: '2026-10-09T05:00:00Z', done: true, completedAt: '2026-10-12T09:00:00Z' });
  board = at(board, tickets.id, { createdAt: '2026-10-12T01:00:00Z', done: true, completedAt: '2026-10-12T10:00:00Z' });

  const day = dayActivity(board, '2026-10-12', utcDay);
  assert.deepEqual(
    day.map((item) => [item.kind, item.text, item.late]),
    [
      ['added', 'Book tickets', undefined],
      ['logged', 'Gym 1 hour', undefined],
      ['done', 'Pay rent', 2],
      ['done', 'Book tickets', 0],
    ],
  );
  assert.deepEqual(activityDays(board, utcDay), ['2026-10-12', '2026-10-09']);

  const week = activityWeek(board, '2026-10-13', 7, utcDay);
  assert.equal(week.length, 7);
  assert.equal(week[0].day, '2026-10-07');
  assert.deepEqual(week[5], { day: '2026-10-12', onTime: 1, late: 1, logged: 1 });
  assert.deepEqual(week[6], { day: '2026-10-13', onTime: 0, late: 0, logged: 0 });
});

test('a logged activity syncs, can be deleted, and comes back with undo', () => {
  const start = addEntry(emptyBoard(), 'Read 20 pages', '2026-10-12T15:00:00Z');
  const phone = addEntry(start, 'Walk', '2026-10-12T16:00:00Z');
  const { board: laptop, removed } = deleteEntry(start, start.entries[0].id);
  const merged = mergeBoards(phone, laptop);
  assert.deepEqual(merged.entries.map((entry) => entry.text), ['Walk']);
  const restored = restoreEntries(laptop, removed);
  assert.deepEqual(restored.entries.map((entry) => entry.text), ['Read 20 pages']);
  assert.equal(addEntry(start, '   '), start);
});

test('two devices keep a new task and a deletion', () => {
  const start = addTask(emptyBoard(), { title: 'Shared' });
  const phone = addTask(start, { title: 'From phone' });
  const removed = deleteTask(start, start.tasks[0].id);
  const merged = mergeBoards(phone, removed.board);
  assert.equal(merged.tasks.some((task) => task.title === 'From phone'), true);
  assert.equal(merged.tasks.some((task) => task.title === 'Shared'), false);
});
