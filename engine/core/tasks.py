"""Checklist rules that do not touch the database.

The store persists whatever these functions accept. Keeping the checks here
means a bad title fails the same way from the CLI, the HTTP API, and tests.
"""
from __future__ import annotations

PRIORITIES = ("none", "low", "medium", "high")
STATUSES = ("open", "done", "all")

TITLE_MAX = 200
NOTES_MAX = 4000


class TaskError(ValueError):
    """A caller sent a list or task the engine will not store."""


def clean_text(value: object, *, field: str, max_len: int, required: bool) -> str:
    if value is None and not required:
        return ""
    if not isinstance(value, str):
        raise TaskError(f"{field} must be a string")
    text = " ".join(value.split())
    if required and not text:
        raise TaskError(f"{field} is required")
    if len(text) > max_len:
        raise TaskError(f"{field} is too long")
    return text


def clean_title(value: object, *, field: str = "title") -> str:
    return clean_text(value, field=field, max_len=TITLE_MAX, required=True)


def clean_notes(value: object) -> str:
    if value is None:
        return ""
    if not isinstance(value, str):
        raise TaskError("notes must be a string")
    text = value.strip()
    if len(text) > NOTES_MAX:
        raise TaskError("notes are too long")
    return text


def clean_priority(value: object) -> str:
    if value is None or value == "":
        return "none"
    if not isinstance(value, str) or value not in PRIORITIES:
        allowed = ", ".join(PRIORITIES)
        raise TaskError(f"priority must be one of: {allowed}")
    return value


def clean_status(value: object) -> str:
    if value is None or value == "":
        return "open"
    if not isinstance(value, str) or value not in STATUSES:
        allowed = ", ".join(STATUSES)
        raise TaskError(f"status must be one of: {allowed}")
    return value


def clean_due_at(value: object) -> str | None:
    """Accept a calendar day or an ISO timestamp. Empty means no due date."""
    if value is None or value == "":
        return None
    if not isinstance(value, str):
        raise TaskError("due_at must be a string")
    text = value.strip()
    if len(text) < 10 or text[4] != "-" or text[7] != "-":
        raise TaskError("due_at must be YYYY-MM-DD")
    year, month, day = text[:10].split("-")
    if not (year.isdigit() and month.isdigit() and day.isdigit()):
        raise TaskError("due_at must be YYYY-MM-DD")
    if not (1 <= int(month) <= 12 and 1 <= int(day) <= 31):
        raise TaskError("due_at must be YYYY-MM-DD")
    return text
