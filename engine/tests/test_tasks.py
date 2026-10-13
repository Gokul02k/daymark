from __future__ import annotations

import json
import threading
from http.server import ThreadingHTTPServer
from urllib.request import Request, urlopen

from engine.api import handler_for
from engine.core.tasks import TaskError
from engine.data.store import TaskStore


def test_inbox_and_check(tmp_path):
    store = TaskStore(tmp_path / "tasks.db")
    inbox = store.lists()
    assert len(inbox) == 1
    assert inbox[0]["name"] == "Inbox"

    task = store.create_task(list_id=inbox[0]["id"], title="  Buy   milk ")
    assert task["title"] == "Buy milk"
    assert task["done"] is False

    checked = store.set_done(task["id"], True)
    assert checked["done"] is True
    assert checked["completed_at"]
    assert store.tasks(status="open") == []
    assert len(store.tasks(status="done")) == 1

    reopened = store.set_done(task["id"], False)
    assert reopened["done"] is False
    assert reopened["completed_at"] is None


def test_rejects_bad_task(tmp_path):
    store = TaskStore(tmp_path / "tasks.db")
    list_id = store.lists()[0]["id"]
    try:
        store.create_task(list_id=list_id, title="   ")
    except TaskError as e:
        assert "required" in str(e)
    else:
        raise AssertionError("empty title was stored")

    try:
        store.create_task(list_id=list_id, title="ok", priority="urgent")
    except TaskError as e:
        assert "priority" in str(e)
    else:
        raise AssertionError("bad priority was stored")


def test_duplicate_list_name(tmp_path):
    store = TaskStore(tmp_path / "tasks.db")
    store.create_list("Today")
    try:
        store.create_list("today")
    except TaskError as e:
        assert "already exists" in str(e)
    else:
        raise AssertionError("duplicate list was stored")


def test_http_roundtrip(tmp_path):
    store = TaskStore(tmp_path / "tasks.db")
    server = ThreadingHTTPServer(("127.0.0.1", 0), handler_for(store))
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()
    port = server.server_address[1]
    try:
        health = _json(port, "GET", "/health")
        assert health["ok"] is True
        assert health["open"] == 0

        lists = _json(port, "GET", "/lists")
        list_id = lists["lists"][0]["id"]

        created = _json(port, "POST", "/tasks", {"list_id": list_id, "title": "Write the app"})
        task_id = created["task"]["id"]
        assert created["task"]["done"] is False

        checked = _json(port, "POST", f"/tasks/{task_id}/check", {})
        assert checked["task"]["done"] is True

        open_tasks = _json(port, "GET", "/tasks?status=open")
        assert open_tasks["tasks"] == []
    finally:
        server.shutdown()
        server.server_close()


def _json(port: int, method: str, path: str, body: dict | None = None) -> dict:
    data = None if body is None else json.dumps(body).encode()
    req = Request(
        f"http://127.0.0.1:{port}{path}",
        data=data,
        method=method,
        headers={"Content-Type": "application/json"} if data is not None else {},
    )
    with urlopen(req) as res:
        return json.loads(res.read().decode())
