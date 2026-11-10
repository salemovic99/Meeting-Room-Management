# Meeting Room Management & Digital Signage

This is an internal web app for booking meeting rooms. Each room has a Samsung TV that shows its live schedule.

- **Backend:** FastAPI, SQLAlchemy 2 (async), PostgreSQL 16 and Alembic.
- **Frontend:** Next.js 15, TanStack Query, shadcn/ui and FullCalendar.
- **Deployment:** Docker Compose behind Nginx.

The backend is the single source of truth. TVs are read-only clients that receive changes over WebSockets.

The API contract is in [`docs/API.md`](docs/API.md).

## Deploy

1. Create the config and secrets:
   ```sh
   cp .env.example .env
   ```
   Then set `POSTGRES_PASSWORD`, `JWT_SECRET_KEY`, `DEVICE_TOKEN_SECRET`, `SEED_ADMIN_*` and `APP_URL` in `.env`.
2. Put the TLS certificate and key at `infrastructure/nginx/certs/fullchain.pem` and `privkey.pem`.
3. Adjust the `geo $admin_allowed` network ranges in `infrastructure/nginx/nginx.conf`. They control who can reach the admin UI and API.
4. Start the stack:
   ```sh
   docker compose up -d --build
   ```

When the backend container starts, it runs `alembic upgrade head` and the idempotent seed. The seed creates:
- the permissions and roles
- the default settings
- the first super admin
- a "General" department
- two rooms: `MR-001` (`/display/room-01`) and `MR-002` (`/display/room-02`)

## Setting up a TV

1. In **TV Displays**, register a device for the room. The token is shown only once.
2. Open the **pairing URL** on the TV, for example `https://meetings.company.com/display/room-01#token=…`.
   The page stores the token on the TV and removes it from the address bar. The token sits in the URL fragment, so it is never sent to the server or written to logs.
3. Set the TV's browser to start on that page in full screen.
4. If the Samsung browser misbehaves on your model or firmware, use an Android TV player or a mini PC in kiosk mode instead.

You can rotate the token or disable the device at any time. Its live sessions are cut off immediately.

### QR walk-up booking

To turn it on, open **Meeting Rooms → Display settings** and enable **Show QR code**. The TV then shows a code that opens `/book/<room>` on a phone.
- Employees sign in with their normal account. They can then see who is in the room, book it from now with one tap, pick a free slot later today, or cancel what they just booked.
- QR bookings are tagged `source = qr` in the bookings report.
- Phones must be on the corporate Wi-Fi or VPN, the same rule as the dashboard.
- To send people somewhere else, set a custom QR link instead.

**Approve production only after testing on the actual TV hardware.** Check startup, sleep and wake, network loss, a 24-hour run, and readability at a distance.

## Backups

The `backup` service runs `pg_dump` every day at about 02:00 Riyadh time. Dumps go to `infrastructure/backups/`, are encrypted when `BACKUP_ENCRYPTION_KEY` is set, and are pruned after `BACKUP_RETENTION_DAYS`.

To take a backup now:

```sh
docker compose run --rm backup sh /scripts/backup.sh
```

To run a restore test into a scratch database (do this regularly):

```sh
docker compose run --rm -e PGDATABASE=mrm_restore_test backup sh /scripts/restore.sh /backups/<file>
```

Take a manual backup before every migration on production.

## Development

See [CLAUDE.md](CLAUDE.md) for commands and an architecture overview.
