"""Host-side status publication tolerating Windows readers that deny rename."""
import json
import os
from pathlib import Path
import time


def publish_json(path, value, attempts=4):
    path = Path(path)
    temporary = path.with_name(path.name + f'.tmp-{os.getpid()}')
    try:
        temporary.write_text(json.dumps(value, ensure_ascii=False, indent=2), 'utf-8')
    except PermissionError:
        return False
    for index in range(attempts):
        try:
            temporary.replace(path)
            return True
        except PermissionError:
            if index + 1 < attempts:
                time.sleep(.02 * (index + 1))
    # Keep recording even if a reader held the status open. Retry next update.
    return False
