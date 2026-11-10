# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Ground rules from the user

- **Do not run, start, or launch the app in this environment.** That means no `docker compose up`, no `uvicorn`, no `npm run dev`/`build`, and no installs. Write code only. Ask before running anything else, including tests and linters.
- The product spec is the PRD the user supplied. The API contract between the two halves is **`docs/API.md`**. Keep backend and frontend in sync with it, and update it whenever an endpoint or payload changes.

## Commands (for when running is allowed)

Backend, from `backend/`:

```sh
pip install -e ".[dev]"
alembic upgrade head                        # needs DATABASE_URL (postgresql+asyncpg://...)
python -m app.scripts.seed                  # idempotent: perms, roles, settings, admin, 2 rooms
uvicorn app.main:app --reload               # single process; see "Realtime" below
pytest tests/unit                           # pure logic, no DB
TEST_DATABASE_URL=postgresql+asyncpg://.../mrm_test pytest tests/integration   # WIPES that DB
pytest tests/unit/test_recurrence.py::test_weekly_selected_weekdays            # single test
ruff check app tests && mypy app
alembic revision -m "msg"                   # then write the migration by hand (see Database)
```

Frontend, from `frontend/`: see the "Frontend" section below.

Full stack: `docker compose up -d --build`. Copy `.env.example` to `.env` first.

## Architecture

The app is a modular monolith. Nginx serves `/api/*` and `/ws/*` from FastAPI (`backend/`) and everything else from Next.js (`frontend/`), all on one origin. PostgreSQL is the only datastore, and there is deliberately no Redis or Kafka.

### Backend layering (`backend/app/`)

- **`api/v1/*`** holds thin routers. Auth comes from `api/deps.py`, where `require(*perms)` passes if the caller has ANY of the listed permissions.
- **`services/*`** holds the business logic. Services take `(session, principal, ip)`, write audit rows and outbox events, then commit.
- **`repositories/*`** holds the queries.
- **`models/*`** holds the SQLAlchemy models.
- Pure, DB-free rules live in `services/schedule_rules.py` (validation, overlap, operating hours, effective status), `services/availability.py` (room status) and `services/recurrence.py`. Put new booking rules there and unit-test them.
- **`permissions/`**:
  - `codes.py` is the permission catalogue plus the default permissions for each role. The seed writes them to the DB, and the DB is authoritative afterwards.
  - `policy.py` holds pure authorization functions over a `Principal`.
  - Code checks permission codes, never role names. The one exception is the super_admin escalation guard.
- **Booking visibility:** callers without detail access still see busy slots. `serializers.booking_out` redacts the title to "Reserved" and nulls the description and notes. Apply the same redaction anywhere bookings are exposed.

### Double-booking protection

The real guard is the PostgreSQL exclusion constraint `bookings_no_overlap`, defined in `alembic/versions/0001_initial.py`. It covers `room_id` plus `tstzrange(start_at, end_at, '[)')` for rows with `status <> 'cancelled'`.
- `BookingService` runs an app-level overlap query first, so users get a friendly 409 that lists the conflicts.
- After that, `_flush_or_conflict` maps SQLSTATE `23P01` to the same 409. This is what handles concurrent requests.
- Never remove the constraint or rely only on app checks.
- Ranges are half-open, so back-to-back meetings are allowed.

### Time

- Everything is stored as UTC `TIMESTAMPTZ`.
- Business rules are evaluated in `settings.timezone` (Asia/Riyadh) through `core/timeutils.py`. That covers operating hours, "today", recurrence and report periods.
- Recurrence expands local wall-clock times, then converts to UTC.
- API datetimes must carry an offset (`AwareDatetime`).
- Room status (available, occupied and so on) is **always computed** from the clock plus bookings and never stored.
- The stored booking `status` moves `confirmed → in_progress → completed` via `workers/lifecycle.py`. Reads use `effective_status`, so the worker's ~20s tick lag doesn't matter.

### Realtime (transactional outbox)

1. A service calls `outbox.enqueue(...)` in the same transaction as the change, then `outbox.commit(session)`. That commits and wakes the dispatcher.
2. `workers/outbox_dispatcher.py` reads committed `outbox_events` rows and fans them out through `websocket/hub.py`. It also polls every 2s as a safety net.
3. Events are never broadcast before the commit.
4. Hub channels are `room:<id>` (TVs), `device:<id>` (one TV) and `dashboard`. Event names are listed in `docs/API.md`.

The hub and the login rate limiter (`core/rate_limit.py`) are **in-process memory**, so the backend must run as **one uvicorn process**. Scaling out would need a shared bus such as PostgreSQL LISTEN/NOTIFY. The background workers start from the FastAPI lifespan in `main.py`, and `RUN_WORKERS=false` disables them for tests.

### Auth

- **Users:**
  - The access JWT has `typ=access` and a `sid`, and lasts 15 minutes. The frontend keeps it in memory.
  - The refresh token is an opaque, httpOnly cookie `mrm_refresh` scoped to `/api/v1/auth`. Its hash sits in `refresh_sessions` and is rotated in place on every refresh.
  - Every request re-checks that the session isn't revoked and the user is active, so deactivation and logout take effect immediately.
  - Passwords are hashed with Argon2id.
- **TV devices:**
  - The long-lived token `<device_id_hex>.<secret>` is stored only as an HMAC (`DEVICE_TOKEN_SECRET`).
  - It is sent once, as `Authorization: Device …`, to `POST /display/session`. That returns a 15-minute display JWT with `typ=display`, `room` and `ver=token_version`.
  - Rotating, disabling or reassigning a device bumps `token_version`, which kills existing JWTs, and closes its sockets.
  - Display JWTs only work on `/display/{slug}/*` for the device's own room, and on `/ws/display/{slug}`.
  - WebSockets authenticate with a first message `{"type":"auth","token":…}`. Secrets never go in query strings.
  - The pairing URL puts the device token in the URL `#fragment`.

### Database & migrations

- Alembic migrations are **hand-written**. `0001` contains raw SQL that autogenerate doesn't model: the `btree_gist` extension, the exclusion constraint, and the append-only trigger on `audit_logs`.
- Models use Python-side defaults (`models/base.py`), not server defaults, so async sessions never need to re-fetch after a flush.
- Relationships that aren't `selectin` are `lazy="raise"` (`User.roles`, `Department.manager`). Load them explicitly with `selectinload`.
- `audit_logs` can't be updated or deleted. Users, rooms and departments are deactivated, never deleted.

### Frontend

Run these from `frontend/`:
- `npm install`. There's no lockfile yet, so the first install creates one. Commit it.
- `npm run dev`. Set `BACKEND_INTERNAL_URL` so Next rewrites `/api/*`. WebSockets are not rewritten, so realtime needs nginx.
- `npm run build`.
- `npm run lint`.
- `npm run typecheck`.

There is no frontend test runner yet.

- **Layout:**
  - `app/(dashboard)/*` is the authenticated UI, with permission-aware nav in the PRD's sidebar order.
  - `app/display/[slug]` is the TV page. It sits outside the dashboard layout and has no admin controls.
  - `features/<domain>/` holds the TanStack Query hooks and components.
  - `lib/types.ts` mirrors `docs/API.md`.
  - `lib/api.ts` is the fetch client. It holds the access token in memory and retries once via `/auth/refresh` on a 401.
  - `features/realtime` connects to `/ws/dashboard` and invalidates queries when events arrive.
- **Time:**
  - Always format through `lib/time.ts`, which uses explicit `Asia/Riyadh` and never browser-local time.
  - FullCalendar runs in UTC and is fed Riyadh wall-clock strings. That is only valid because Riyadh is a fixed UTC+3; revisit it if the timezone ever changes.
- **TV page (`features/display/*`)** must stay compatible with old Samsung Tizen browsers (`browserslist` includes `chrome >= 69`):
  - Avoid newer APIs such as `structuredClone`, `Array.prototype.at` and top-level `await`.
  - Guard access to `localStorage`, fullscreen and wake lock.
  - `compute.ts` recomputes the room state every second from the last schedule plus the server-corrected clock. Server events trigger refetches; they never carry the state themselves.
  - The device token and the last schedule are cached in `localStorage`, so the screen survives a reboot while offline.
- **UI rules:**
  - Status is always shown as icon plus text, never color alone (`components/common/status-badge.tsx`).
  - UI strings go through `t()` in `lib/i18n.tsx` (en and ar, RTL). The Arabic dictionary is only partially filled in.
  - UI permission checks (`<Can>`, `usePermission`) are only hints. The backend enforces everything.

### QR walk-up booking

1. The TV shows a QR code for `qr_target_url`, which defaults to `/book/{slug}`.
2. The phone page is `app/book/[slug]` with `features/qr-booking/*`. It is outside the dashboard layout but uses normal user auth, and the login page honours a same-origin `?next=`.
3. Slot suggestions come from `services/quick_book.py`. That file is pure, unit-tested in `tests/unit/test_quick_book.py`, and served at `GET /rooms/by-slug/{slug}/quick-book`.
4. The booking itself goes through the normal `POST /bookings` with `source="qr"` (column added in migration `0002`), so never add a separate booking path for it.

### Known gaps (not yet built)

- PRD Phase 5 (rest): email notifications and Microsoft 365/Outlook sync. `app/integrations/` documents the intended approach.
- "Unused reservation" statistics (PRD §5.10). These need a check-in or occupancy signal, which isn't in scope.
- Nothing has been executed yet: no install, build, migration or test run. Expect a first round of fixes when it's first run.
