#!/usr/bin/env python3
"""Send every synced device to a fresh snapshot. Run once after any database restore."""
from pathlib import Path
import sys

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import models
from services.sync_feed_service import reset_sync_epoch


def main():
    session = models.get_session(models.get_engine())
    try:
        epoch = reset_sync_epoch(session)
        session.commit()
    finally:
        session.close()
    print(f'Sync epoch reset: {epoch}')


if __name__ == '__main__':
    main()
