"""Integration tests run against a real PostgreSQL (the exclusion constraint is the thing under test).

    TEST_DATABASE_URL=postgresql+asyncpg://mrm:mrm@localhost:5432/mrm_test pytest tests/integration

The database is migrated with Alembic and every table is truncated between tests.
WARNING: point TEST_DATABASE_URL at a disposable database — it is wiped.
"""
import os
import subprocess
import sys
from pathlib import Path

import pytest

TEST_DB = os.environ.get("TEST_DATABASE_URL")
if not TEST_DB:
    pytest.skip("TEST_DATABASE_URL not set", allow_module_level=True)

os.environ["DATABASE_URL"] = TEST_DB
os.environ["RUN_WORKERS"] = "false"
os.environ["COOKIE_SECURE"] = "false"
os.environ["SEED_ADMIN_EMAIL"] = "admin@test.local"
os.environ["SEED_ADMIN_PASSWORD"] = "admin-password-123"

import httpx  # noqa: E402
from sqlalchemy import text  # noqa: E402

BACKEND = Path(__file__).resolve().parents[2]


@pytest.fixture(scope="session", autouse=True)
def migrated():
    subprocess.run([sys.executable, "-m", "alembic", "upgrade", "head"], cwd=BACKEND, check=True,
                   env={**os.environ, "DATABASE_URL": TEST_DB})


@pytest.fixture(autouse=True)
async def clean_db(migrated):
    from app.core.database import engine
    from app.scripts.seed import seed
    async with engine.begin() as conn:
        tables = (await conn.execute(text(
            "SELECT tablename FROM pg_tables WHERE schemaname='public' AND tablename <> 'alembic_version'"
        ))).scalars().all()
        # TRUNCATE does not fire the row-level append-only trigger on audit_logs.
        await conn.execute(text(f"TRUNCATE {', '.join(tables)} CASCADE"))
    await seed(with_rooms=True)
    yield


@pytest.fixture
async def client():
    from app.main import app
    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://test/api/v1") as c:
        yield c


@pytest.fixture
async def admin_headers(client):
    r = await client.post("/auth/login", json={"email": "admin@test.local", "password": "admin-password-123"})
    assert r.status_code == 200, r.text
    return {"Authorization": f"Bearer {r.json()['access_token']}"}
