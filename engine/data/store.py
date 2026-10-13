"""SQLite store for lists and tasks.

One file, `engine/var/tasks.db`. Re-opening it is safe: the schema is created
on startup and the Inbox list exists only when the database has no lists yet.
"""
from __future__ import annotations

import sqlite3
import uuid
from contextlib import contextmanager
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from ..core.tasks import (
    TaskError,
    clean_due_at,
    clean_notes,
    clean_priority,
    clean_status,
    clean_title,
)

DEFAULT_DB = Path(__file__).resolve().parents[1] / "var" / "tasks.db"

_SCHEMA = """
CREATE TABLE IF NOT EXISTS lists (
    id         TEXT    PRIMARY KEY,
    name       TEXT    NOT NULL COLLATE NOCASE UNIQUE,
    created_at TEXT    NOT NULL,
    position   INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS tasks (
    id           TEXT    PRIMARY KEY,
    list_id      TEXT    NOT NULL REFERENCES lists(id),
    title        TEXT    NOT NULL,
    notes        TEXT    NOT NULL DEFAULT '',
    done         INTEGER NOT NULL DEFAULT 0,
    priority     TEXT    NOT NULL DEFAULT 'none',
    due_at       TEXT,
    created_at   TEXT    NOT NULL,
    updated_at   TEXT    NOT NULL,
    completed_at TEXT,
    position     INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_tasks_list ON tasks (list_id, done, position);
"""


def _now() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


def _id() -> str:
    return uuid.uuid4().hex


class TaskStore:
    def __init__(self, path: Path | str = DEFAULT_DB) -> None:
        self.path = Path(path)
        self.path.parent.mkdir(parents=True, exist_ok=True)
        with self._conn() as cx:
            cx.executescript(_SCHEMA)
            count = cx.execute("SELECT COUNT(*) FROM lists").fetchone()[0]
            if count == 0:
                cx.execute(
                    "INSERT INTO lists (id, name, created_at, position) VALUES (?, ?, ?, ?)",
                    (_id(), "Inbox", _now(), 0),
                )

    @contextmanager
    def _conn(self):
        cx = sqlite3.connect(self.path, timeout=30)
        cx.row_factory = sqlite3.Row
        cx.execute("PRAGMA foreign_keys=ON")
        cx.execute("PRAGMA journal_mode=WAL")
        try:
            yield cx
            cx.commit()
        except Exception:
            cx.rollback()
            raise
        finally:
            cx.close()

    def lists(self) -> list[dict[str, Any]]:
        with self._conn() as cx:
            rows = cx.execute(
                """
                SELECT l.id, l.name, l.created_at, l.position,
                       SUM(CASE WHEN t.done = 0 THEN 1 ELSE 0 END) AS open_count,
                       SUM(CASE WHEN t.done = 1 THEN 1 ELSE 0 END) AS done_count
                FROM lists l
                LEFT JOIN tasks t ON t.list_id = l.id
                GROUP BY l.id
                ORDER BY l.position, l.created_at
                """
            ).fetchall()
        return [_list_row(r) for r in rows]

    def create_list(self, name: object) -> dict[str, Any]:
        cleaned = clean_title(name, field="name")
        with self._conn() as cx:
            taken = cx.execute(
                "SELECT 1 FROM lists WHERE name = ? COLLATE NOCASE", (cleaned,)
            ).fetchone()
            if taken:
                raise TaskError(f"list already exists: {cleaned}")
            position = cx.execute("SELECT COALESCE(MAX(position), -1) + 1 FROM lists").fetchone()[0]
            row = (_id(), cleaned, _now(), position)
            cx.execute(
                "INSERT INTO lists (id, name, created_at, position) VALUES (?, ?, ?, ?)",
                row,
            )
            stored = cx.execute(
                "SELECT id, name, created_at, position FROM lists WHERE id = ?",
                (row[0],),
            ).fetchone()
        item = _list_row(stored)
        item["open_count"] = 0
        item["done_count"] = 0
        return item

    def get_list(self, list_id: str) -> dict[str, Any] | None:
        with self._conn() as cx:
            row = cx.execute("SELECT id, name FROM lists WHERE id = ?", (list_id,)).fetchone()
        return dict(row) if row else None

    def find_list(self, name_or_id: str) -> dict[str, Any]:
        with self._conn() as cx:
            row = cx.execute(
                "SELECT id, name FROM lists WHERE id = ? OR name = ? COLLATE NOCASE",
                (name_or_id, name_or_id),
            ).fetchone()
        if row is None:
            raise TaskError(f"no such list: {name_or_id}")
        return dict(row)

    def tasks(self, *, list_id: str | None = None, status: str = "open") -> list[dict[str, Any]]:
        status = clean_status(status)
        where = []
        params: list[Any] = []
        if list_id:
            where.append("list_id = ?")
            params.append(list_id)
        if status == "open":
            where.append("done = 0")
        elif status == "done":
            where.append("done = 1")
        clause = f"WHERE {' AND '.join(where)}" if where else ""
        with self._conn() as cx:
            rows = cx.execute(
                f"SELECT * FROM tasks {clause} ORDER BY done, position, created_at",
                params,
            ).fetchall()
        return [_task_row(r) for r in rows]

    def create_task(
        self,
        *,
        list_id: str,
        title: object,
        notes: object = "",
        priority: object = "none",
        due_at: object = None,
    ) -> dict[str, Any]:
        if not self.get_list(list_id):
            raise TaskError("no such list")
        now = _now()
        task_id = _id()
        title = clean_title(title)
        notes = clean_notes(notes)
        priority = clean_priority(priority)
        due_at = clean_due_at(due_at)
        with self._conn() as cx:
            position = cx.execute(
                "SELECT COALESCE(MAX(position), -1) + 1 FROM tasks WHERE list_id = ?",
                (list_id,),
            ).fetchone()[0]
            cx.execute(
                """
                INSERT INTO tasks (
                    id, list_id, title, notes, done, priority, due_at,
                    created_at, updated_at, completed_at, position
                ) VALUES (?, ?, ?, ?, 0, ?, ?, ?, ?, NULL, ?)
                """,
                (task_id, list_id, title, notes, priority, due_at, now, now, position),
            )
            row = cx.execute("SELECT * FROM tasks WHERE id = ?", (task_id,)).fetchone()
        return _task_row(row)

    def get_task(self, task_id: str) -> dict[str, Any]:
        with self._conn() as cx:
            row = cx.execute("SELECT * FROM tasks WHERE id = ?", (task_id,)).fetchone()
        if row is None:
            raise TaskError("no such task")
        return _task_row(row)

    def resolve_task(self, id_or_prefix: str) -> dict[str, Any]:
        """Exact id, or a unique prefix. The CLI uses this; the HTTP API does not."""
        if not id_or_prefix or not isinstance(id_or_prefix, str):
            raise TaskError("task id is required")
        with self._conn() as cx:
            exact = cx.execute("SELECT * FROM tasks WHERE id = ?", (id_or_prefix,)).fetchone()
            if exact:
                return _task_row(exact)
            hits = cx.execute(
                "SELECT * FROM tasks WHERE id LIKE ?", (id_or_prefix + "%",)
            ).fetchall()
        if len(hits) == 1:
            return _task_row(hits[0])
        if not hits:
            raise TaskError("no such task")
        raise TaskError("task id prefix is ambiguous")

    def set_done(self, task_id: str, done: bool) -> dict[str, Any]:
        now = _now()
        with self._conn() as cx:
            cur = cx.execute(
                """
                UPDATE tasks
                SET done = ?, updated_at = ?, completed_at = ?
                WHERE id = ?
                """,
                (1 if done else 0, now, now if done else None, task_id),
            )
            if cur.rowcount != 1:
                raise TaskError("no such task")
            row = cx.execute("SELECT * FROM tasks WHERE id = ?", (task_id,)).fetchone()
        return _task_row(row)

    def counts(self) -> dict[str, int]:
        with self._conn() as cx:
            lists = cx.execute("SELECT COUNT(*) FROM lists").fetchone()[0]
            open_count = cx.execute("SELECT COUNT(*) FROM tasks WHERE done = 0").fetchone()[0]
            done_count = cx.execute("SELECT COUNT(*) FROM tasks WHERE done = 1").fetchone()[0]
        return {"lists": lists, "open": open_count, "done": done_count}


def _list_row(row: sqlite3.Row) -> dict[str, Any]:
    item = {
        "id": row["id"],
        "name": row["name"],
        "created_at": row["created_at"],
        "position": row["position"],
    }
    if "open_count" in row.keys():
        item["open_count"] = row["open_count"] or 0
        item["done_count"] = row["done_count"] or 0
    return item


def _task_row(row: sqlite3.Row) -> dict[str, Any]:
    return {
        "id": row["id"],
        "list_id": row["list_id"],
        "title": row["title"],
        "notes": row["notes"],
        "done": bool(row["done"]),
        "priority": row["priority"],
        "due_at": row["due_at"],
        "created_at": row["created_at"],
        "updated_at": row["updated_at"],
        "completed_at": row["completed_at"],
        "position": row["position"],
    }
