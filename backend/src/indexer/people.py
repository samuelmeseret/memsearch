"""
Reads Apple Photos' face recognition data from Photos.sqlite.

Maps person names to photo asset UUIDs, enabling person-based search
(e.g., "@samuel with short hair"). Read-only access — no writes to the database.
"""

import logging
import sqlite3
import time
from dataclasses import dataclass, field
from pathlib import Path

from ..config import settings

logger = logging.getLogger(__name__)

_PERSON_QUERY = """
SELECT p.ZDISPLAYNAME, p.ZPERSONUUID, p.ZFACECOUNT, a.ZUUID
FROM ZDETECTEDFACE df
JOIN ZPERSON p ON df.ZPERSONFORFACE = p.Z_PK
JOIN ZASSET a ON df.ZASSETFORFACE = a.Z_PK
WHERE p.ZDISPLAYNAME IS NOT NULL AND p.ZDISPLAYNAME != ''
"""


@dataclass
class PersonInfo:
    display_name: str
    person_uuid: str
    face_count: int


class PeopleDatabase:
    """Reads person-to-asset mappings from Apple Photos' SQLite database."""

    # Auto-refresh at most once every 60 seconds
    AUTO_REFRESH_TTL = 60

    def __init__(self, photos_library_path: str | None = None):
        lib_path = Path(photos_library_path or settings.photos_library_path).expanduser()
        self._db_path = lib_path / "database" / "Photos.sqlite"
        self._asset_to_persons: dict[str, list[str]] = {}
        self._persons: dict[str, PersonInfo] = {}  # lowercase name -> PersonInfo
        self._available = False
        self._last_refresh: float = 0.0
        self.refresh()

    @property
    def is_available(self) -> bool:
        return self._available

    def refresh_if_stale(self) -> None:
        """Refresh only if TTL has expired."""
        if time.time() - self._last_refresh > self.AUTO_REFRESH_TTL:
            self.refresh()

    def refresh(self) -> None:
        """Reload person data from Photos.sqlite."""
        self._asset_to_persons.clear()
        self._persons.clear()
        self._available = False

        if not self._db_path.exists():
            logger.warning("Photos database not found at %s", self._db_path)
            return

        try:
            uri = f"file:{self._db_path}?mode=ro"
            conn = sqlite3.connect(uri, uri=True)
            conn.execute("PRAGMA query_only = ON")

            rows = conn.execute(_PERSON_QUERY).fetchall()
            conn.close()

            for display_name, person_uuid, face_count, asset_uuid in rows:
                # Build asset -> persons mapping
                if asset_uuid not in self._asset_to_persons:
                    self._asset_to_persons[asset_uuid] = []
                if display_name not in self._asset_to_persons[asset_uuid]:
                    self._asset_to_persons[asset_uuid].append(display_name)

                # Build persons lookup (deduplicate by name)
                key = display_name.lower()
                if key not in self._persons:
                    self._persons[key] = PersonInfo(
                        display_name=display_name,
                        person_uuid=person_uuid,
                        face_count=face_count or 0,
                    )

            self._available = True
            self._last_refresh = time.time()
            logger.info(
                "Loaded %d people across %d assets from Photos.sqlite",
                len(self._persons),
                len(self._asset_to_persons),
            )
        except (sqlite3.Error, OSError) as e:
            logger.warning("Failed to read Photos.sqlite: %s", e)

    def get_persons_for_asset(self, asset_uuid: str) -> list[str]:
        """Return display names of people detected in the given photo asset."""
        return self._asset_to_persons.get(asset_uuid, [])

    def get_all_persons(self) -> list[PersonInfo]:
        """Return all named people, sorted by face count descending."""
        return sorted(self._persons.values(), key=lambda p: p.face_count, reverse=True)

    def get_asset_uuids_for_person(self, name: str) -> set[str]:
        """Return all asset UUIDs containing the named person."""
        result = set()
        name_lower = name.lower()
        for asset_uuid, names in self._asset_to_persons.items():
            if any(n.lower() == name_lower for n in names):
                result.add(asset_uuid)
        return result
