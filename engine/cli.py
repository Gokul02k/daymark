"""Engine CLI.

    python -m engine.cli status
    python -m engine.cli serve
    python -m engine.cli lists
    python -m engine.cli list-add Today
    python -m engine.cli tasks --list Today
    python -m engine.cli add --list Today "Buy milk"
    python -m engine.cli check <id>
    python -m engine.cli uncheck <id>
"""
from __future__ import annotations

import argparse
import logging
import sys

from . import __version__
from .api import DEFAULT_HOST, DEFAULT_PORT, serve
from .core.tasks import TaskError
from .data.store import TaskStore


def _store() -> TaskStore:
    return TaskStore()


def cmd_status(_args: argparse.Namespace) -> int:
    store = _store()
    counts = store.counts()
    print(f"daymark engine {__version__}")
    print(f"db     {store.path}")
    print(f"lists  {counts['lists']}")
    print(f"open   {counts['open']}")
    print(f"done   {counts['done']}")
    return 0


def cmd_serve(args: argparse.Namespace) -> int:
    logging.basicConfig(level=logging.INFO, format="%(message)s")
    serve(args.host, args.port)
    return 0


def cmd_lists(_args: argparse.Namespace) -> int:
    for item in _store().lists():
        print(f"{item['id'][:8]}  {item['open_count']:3} open  {item['name']}")
    return 0


def cmd_list_add(args: argparse.Namespace) -> int:
    item = _store().create_list(args.name)
    print(f"{item['id'][:8]}  {item['name']}")
    return 0


def cmd_tasks(args: argparse.Namespace) -> int:
    store = _store()
    list_id = store.find_list(args.list)["id"] if args.list else None
    rows = store.tasks(list_id=list_id, status=args.status)
    if not rows:
        print("(none)")
        return 0
    for task in rows:
        mark = "x" if task["done"] else " "
        due = f"  due {task['due_at'][:10]}" if task["due_at"] else ""
        print(f"[{mark}] {task['id'][:8]}  {task['title']}{due}")
    return 0


def cmd_add(args: argparse.Namespace) -> int:
    store = _store()
    list_id = store.find_list(args.list)["id"]
    task = store.create_task(
        list_id=list_id,
        title=args.title,
        notes=args.notes or "",
        priority=args.priority,
        due_at=args.due,
    )
    print(f"{task['id'][:8]}  {task['title']}")
    return 0


def cmd_check(args: argparse.Namespace) -> int:
    task = _store().resolve_task(args.id)
    updated = _store().set_done(task["id"], True)
    print(f"[x] {updated['id'][:8]}  {updated['title']}")
    return 0


def cmd_uncheck(args: argparse.Namespace) -> int:
    task = _store().resolve_task(args.id)
    updated = _store().set_done(task["id"], False)
    print(f"[ ] {updated['id'][:8]}  {updated['title']}")
    return 0


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(prog="engine.cli")
    sub = parser.add_subparsers(dest="cmd", required=True)

    sub.add_parser("status").set_defaults(func=cmd_status)

    serve_p = sub.add_parser("serve")
    serve_p.add_argument("--host", default=DEFAULT_HOST)
    serve_p.add_argument("--port", type=int, default=DEFAULT_PORT)
    serve_p.set_defaults(func=cmd_serve)

    sub.add_parser("lists").set_defaults(func=cmd_lists)

    add_list = sub.add_parser("list-add")
    add_list.add_argument("name")
    add_list.set_defaults(func=cmd_list_add)

    tasks_p = sub.add_parser("tasks")
    tasks_p.add_argument("--list")
    tasks_p.add_argument("--status", default="open", choices=("open", "done", "all"))
    tasks_p.set_defaults(func=cmd_tasks)

    add_p = sub.add_parser("add")
    add_p.add_argument("--list", default="Inbox")
    add_p.add_argument("title")
    add_p.add_argument("--notes", default="")
    add_p.add_argument("--priority", default="none")
    add_p.add_argument("--due")
    add_p.set_defaults(func=cmd_add)

    check_p = sub.add_parser("check")
    check_p.add_argument("id")
    check_p.set_defaults(func=cmd_check)

    uncheck_p = sub.add_parser("uncheck")
    uncheck_p.add_argument("id")
    uncheck_p.set_defaults(func=cmd_uncheck)

    args = parser.parse_args(argv)
    try:
        return args.func(args)
    except TaskError as e:
        print(f"error: {e}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
