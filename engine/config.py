"""Environment loading.

Reads the same `.env.local` the Next.js app uses, so the engine URL and any
later settings live in one place. Real environment variables win over the file.
"""
from __future__ import annotations

import os
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
ENV_FILES = (".env.local", ".env")

_loaded = False


def load_env(force: bool = False) -> dict[str, str]:
    global _loaded
    if _loaded and not force:
        return {}

    applied: dict[str, str] = {}
    for name in ENV_FILES:
        path = ROOT / name
        if not path.exists():
            continue
        for raw in path.read_text().splitlines():
            line = raw.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            key, _, value = line.partition("=")
            key = key.strip()
            value = value.strip().strip('"').strip("'")
            if key and key not in os.environ:
                os.environ[key] = value
                applied[key] = value

    _loaded = True
    return applied
