import asyncio
import contextlib
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware

from app.api.v1 import admin, auth, bookings, display, rooms, users
from app.core.config import settings
from app.core.errors import install_error_handlers
from app.core.logging import configure_logging
from app.websocket import routes as ws_routes
from app.workers.lifecycle import run_lifecycle
from app.workers.outbox_dispatcher import run_dispatcher

configure_logging()


@asynccontextmanager
async def lifespan(_: FastAPI):
    stop = asyncio.Event()
    tasks = []
    if settings.run_workers:
        tasks = [asyncio.create_task(run_dispatcher(stop)), asyncio.create_task(run_lifecycle(stop))]
    yield
    stop.set()
    for t in tasks:
        t.cancel()
        with contextlib.suppress(asyncio.CancelledError):
            await t


app = FastAPI(
    title="Meeting Room Management API",
    version="1.0.0",
    lifespan=lifespan,
    docs_url=None if settings.is_production else "/api/docs",
    redoc_url=None,
    openapi_url=None if settings.is_production else "/api/openapi.json",
)

install_error_handlers(app)

if settings.cors_origins:
    app.add_middleware(CORSMiddleware, allow_origins=settings.cors_origins, allow_credentials=True,
                       allow_methods=["GET", "POST", "PATCH", "PUT", "DELETE"],
                       allow_headers=["Authorization", "Content-Type"])


@app.middleware("http")
async def security_headers(request: Request, call_next):
    response = await call_next(request)
    response.headers.setdefault("X-Content-Type-Options", "nosniff")
    response.headers.setdefault("Referrer-Policy", "no-referrer")
    response.headers.setdefault("Cache-Control", "no-store")
    return response


API = "/api/v1"
for module in (auth, users, rooms, bookings, display, admin):
    app.include_router(module.router, prefix=API)
app.include_router(ws_routes.router)
