import asyncio
import threading
import time
from collections import defaultdict
from pathlib import Path

from watchdog.observers import Observer
from watchdog.events import FileSystemEventHandler, FileSystemEvent

from ..config import settings


class _DebouncedHandler(FileSystemEventHandler):
    """Collects FS events and debounces them before forwarding to the indexing pipeline."""

    def __init__(self, loop: asyncio.AbstractEventLoop, pending: dict, lock: threading.Lock):
        self._loop = loop
        self._pending = pending
        self._lock = lock

    def _should_handle(self, path: str) -> bool:
        p = Path(path)
        if p.is_dir():
            return False
        # Check exclude patterns
        for part in p.parts:
            for pattern in settings.exclude_patterns:
                if part == pattern or (pattern.startswith(".") and part.startswith(".")):
                    return False
        # Check supported extension
        return settings.get_modality(p.suffix) is not None

    def on_created(self, event: FileSystemEvent) -> None:
        if not event.is_directory and self._should_handle(event.src_path):
            with self._lock:
                self._pending[event.src_path] = time.time()

    def on_modified(self, event: FileSystemEvent) -> None:
        if not event.is_directory and self._should_handle(event.src_path):
            with self._lock:
                self._pending[event.src_path] = time.time()

    def on_moved(self, event: FileSystemEvent) -> None:
        if not event.is_directory:
            with self._lock:
                # Mark old path for deletion, new path for indexing
                if self._should_handle(event.src_path):
                    self._pending[event.src_path] = ("delete", time.time())
                if self._should_handle(event.dest_path):
                    self._pending[event.dest_path] = time.time()

    def on_deleted(self, event: FileSystemEvent) -> None:
        if not event.is_directory:
            with self._lock:
                self._pending[event.src_path] = ("delete", time.time())


class FileWatcher:
    """Watches folders for file changes and triggers re-indexing with debounce."""

    DEBOUNCE_SECONDS = 5.0
    POLL_INTERVAL = 2.0

    def __init__(self, pipeline, store):
        self._pipeline = pipeline
        self._store = store
        self._observer: Observer | None = None
        self._pending: dict = {}
        self._lock = threading.Lock()
        self._loop: asyncio.AbstractEventLoop | None = None
        self._poll_task: asyncio.Task | None = None
        self._running = False

    @property
    def is_running(self) -> bool:
        return self._running

    def start(self, folders: list[str]) -> None:
        if self._running:
            return
        self._loop = asyncio.get_event_loop()
        self._observer = Observer()
        handler = _DebouncedHandler(self._loop, self._pending, self._lock)

        for folder in folders:
            p = Path(folder).expanduser().resolve()
            if p.is_dir():
                self._observer.schedule(handler, str(p), recursive=True)

        self._observer.start()
        self._running = True
        self._poll_task = asyncio.ensure_future(self._process_loop())

    def stop(self) -> None:
        self._running = False
        if self._poll_task:
            self._poll_task.cancel()
            self._poll_task = None
        if self._observer:
            self._observer.stop()
            self._observer.join(timeout=5)
            self._observer = None
        with self._lock:
            self._pending.clear()

    def update_folders(self, folders: list[str]) -> None:
        """Restart with a new folder list."""
        was_running = self._running
        if was_running:
            self.stop()
            self.start(folders)

    async def _process_loop(self) -> None:
        """Periodically flush debounced events."""
        while self._running:
            await asyncio.sleep(self.POLL_INTERVAL)
            await self._flush_pending()

    async def _flush_pending(self) -> None:
        now = time.time()
        ready = {}

        with self._lock:
            still_pending = {}
            for path, val in self._pending.items():
                # Extract timestamp from either a plain float or a ("delete", ts) tuple
                if isinstance(val, tuple):
                    ts = val[1]
                else:
                    ts = val
                if now - ts >= self.DEBOUNCE_SECONDS:
                    ready[path] = val
                else:
                    still_pending[path] = val
            self._pending.clear()
            self._pending.update(still_pending)

        if not ready:
            return

        # Don't auto-index while a manual indexing run is in progress
        if self._pipeline.is_indexing:
            # Put items back
            with self._lock:
                for path, val in ready.items():
                    if path not in self._pending:
                        self._pending[path] = val
            return

        for path, val in ready.items():
            if isinstance(val, tuple) and val[0] == "delete":
                try:
                    self._store.delete(path)
                except Exception as e:
                    print(f"[watcher] Error deleting {path}: {e}")
            else:
                try:
                    await self._pipeline.index_file(Path(path))
                except Exception as e:
                    print(f"[watcher] Error indexing {path}: {e}")
