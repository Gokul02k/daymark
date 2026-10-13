"""JSON API for the checklist.

The Next.js app is a view. This process owns lists and tasks. Checking a task
is a write, so unlike the trading engine this API accepts POST. It is bound
to localhost and has no auth: the Next server is the only client, and the
engine never faces the network.
"""
from __future__ import annotations

import json
import logging
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from typing import Any
from urllib.parse import parse_qs, urlparse

from . import __version__
from .core.tasks import TaskError
from .data.store import DEFAULT_DB, TaskStore

log = logging.getLogger(__name__)

DEFAULT_HOST = "127.0.0.1"
DEFAULT_PORT = 8790
MAX_BODY = 64 * 1024


def handler_for(store: TaskStore):
    class Handler(BaseHTTPRequestHandler):
        def do_GET(self) -> None:
            try:
                parsed = urlparse(self.path)
                parts = [p for p in parsed.path.split("/") if p]
                query = parse_qs(parsed.query)
                if parts == ["health"]:
                    counts = store.counts()
                    self._send(200, {"ok": True, "version": __version__, "db": str(store.path), **counts})
                    return
                if parts == ["lists"]:
                    self._send(200, {"lists": store.lists()})
                    return
                if parts == ["tasks"]:
                    list_id = _one(query, "list_id")
                    status = _one(query, "status") or "open"
                    self._send(200, {"tasks": store.tasks(list_id=list_id, status=status)})
                    return
                self._send(404, {"error": "not found"})
            except TaskError as e:
                self._send(400, {"error": str(e)})
            except Exception:
                log.exception("GET failed")
                self._send(500, {"error": "engine error"})

        def do_POST(self) -> None:
            try:
                parts = [p for p in urlparse(self.path).path.split("/") if p]
                body = self._body()
                if parts == ["lists"]:
                    self._send(201, {"list": store.create_list(body.get("name"))})
                    return
                if parts == ["tasks"]:
                    list_id = body.get("list_id")
                    if not isinstance(list_id, str) or not list_id:
                        raise TaskError("list_id is required")
                    task = store.create_task(
                        list_id=list_id,
                        title=body.get("title"),
                        notes=body.get("notes", ""),
                        priority=body.get("priority", "none"),
                        due_at=body.get("due_at"),
                    )
                    self._send(201, {"task": task})
                    return
                if len(parts) == 3 and parts[0] == "tasks" and parts[2] in ("check", "uncheck"):
                    task = store.set_done(parts[1], parts[2] == "check")
                    self._send(200, {"task": task})
                    return
                self._send(404, {"error": "not found"})
            except TaskError as e:
                self._send(400, {"error": str(e)})
            except Exception:
                log.exception("POST failed")
                self._send(500, {"error": "engine error"})

        def _body(self) -> dict[str, Any]:
            length = int(self.headers.get("Content-Length") or 0)
            if length > MAX_BODY:
                raise TaskError("body is too large")
            if length == 0:
                return {}
            raw = self.rfile.read(length)
            try:
                data = json.loads(raw.decode("utf-8"))
            except (UnicodeDecodeError, json.JSONDecodeError) as e:
                raise TaskError("body must be JSON") from e
            if not isinstance(data, dict):
                raise TaskError("body must be a JSON object")
            return data

        def _send(self, status: int, payload: dict[str, Any]) -> None:
            raw = json.dumps(payload).encode("utf-8")
            self.send_response(status)
            self.send_header("Content-Type", "application/json")
            self.send_header("Content-Length", str(len(raw)))
            self.end_headers()
            self.wfile.write(raw)

        def log_message(self, fmt: str, *args: Any) -> None:
            log.info("%s - " + fmt, self.address_string(), *args)

    return Handler


def serve(host: str = DEFAULT_HOST, port: int = DEFAULT_PORT, db_path=DEFAULT_DB) -> None:
    if host not in ("127.0.0.1", "localhost", "::1"):
        log.warning("binding %s exposes the task store on the network", host)
    store = TaskStore(db_path)
    httpd = ThreadingHTTPServer((host, port), handler_for(store))
    log.info("daymark engine on http://%s:%s  db=%s", host, port, store.path)
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        log.info("stopping")
    finally:
        httpd.server_close()


def _one(query: dict[str, list[str]], key: str) -> str | None:
    values = query.get(key)
    if not values:
        return None
    return values[0]
