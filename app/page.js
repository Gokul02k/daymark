'use client';

import { useEffect, useState } from 'react';
import { addTask, deleteTask, loadState, savePersisted, setDone } from './lib/storage';

export default function HomePage() {
  const [state, setState] = useState(null);
  const [title, setTitle] = useState('');
  const [installEvent, setInstallEvent] = useState(null);
  const [showIosHint, setShowIosHint] = useState(false);

  useEffect(() => {
    setState(loadState());

    const onPrompt = (event) => {
      event.preventDefault();
      setInstallEvent(event);
    };
    window.addEventListener('beforeinstallprompt', onPrompt);

    const ios = /iphone|ipad|ipod/i.test(navigator.userAgent);
    const standalone =
      window.matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
    setShowIosHint(ios && !standalone);

    return () => window.removeEventListener('beforeinstallprompt', onPrompt);
  }, []);

  function commit(next) {
    setState(next);
    savePersisted(next);
  }

  function onAdd(event) {
    event.preventDefault();
    if (!state) return;
    const next = addTask(state, title);
    if (next === state) return;
    commit(next);
    setTitle('');
  }

  async function onInstall() {
    if (!installEvent) return;
    installEvent.prompt();
    await installEvent.userChoice;
    setInstallEvent(null);
  }

  const open = state?.tasks.filter((task) => !task.done) ?? [];
  const done = state?.tasks.filter((task) => task.done) ?? [];

  return (
    <main>
      <header className="top">
        <div>
          <h1>Daymark</h1>
          <p className="lede">{open.length === 0 ? 'Nothing open' : `${open.length} open`}</p>
        </div>
        {installEvent ? (
          <button type="button" className="install" onClick={onInstall}>
            Install
          </button>
        ) : null}
      </header>

      <form className="add" onSubmit={onAdd}>
        <input
          value={title}
          onChange={(event) => setTitle(event.target.value)}
          placeholder="Add a task"
          aria-label="Task"
          enterKeyHint="done"
          maxLength={200}
        />
        <button type="submit">Add</button>
      </form>

      <ul className="tasks">
        {open.map((task) => (
          <TaskRow
            key={task.id}
            task={task}
            onToggle={() => commit(setDone(state, task.id, true))}
            onDelete={() => commit(deleteTask(state, task.id))}
          />
        ))}
      </ul>

      {done.length > 0 ? (
        <section className="done">
          <h2>Done</h2>
          <ul className="tasks">
            {done.map((task) => (
              <TaskRow
                key={task.id}
                task={task}
                done
                onToggle={() => commit(setDone(state, task.id, false))}
                onDelete={() => commit(deleteTask(state, task.id))}
              />
            ))}
          </ul>
        </section>
      ) : null}

      {showIosHint ? (
        <p className="hint">To install on iPhone, tap Share, then Add to Home Screen.</p>
      ) : null}
    </main>
  );
}

function TaskRow({ task, done, onToggle, onDelete }) {
  return (
    <li className="row">
      <button type="button" className={done ? 'task checked' : 'task'} onClick={onToggle}>
        <span className="box" aria-hidden="true" />
        <span className="title">{task.title}</span>
      </button>
      <button type="button" className="delete" aria-label={`Delete ${task.title}`} onClick={onDelete}>
        Delete
      </button>
    </li>
  );
}
