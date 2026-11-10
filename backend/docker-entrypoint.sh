#!/bin/sh
set -e
# Apply migrations and the idempotent seed before serving.
alembic upgrade head
python -m app.scripts.seed
exec "$@"
