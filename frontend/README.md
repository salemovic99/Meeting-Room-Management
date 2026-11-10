# Frontend — Meeting Room Management

Next.js 15 (App Router) + TypeScript, Tailwind CSS v3, shadcn/ui-style components (hand-written in
`components/ui`), TanStack Query, Zod + react-hook-form, FullCalendar, Recharts, Framer Motion.

The API contract is defined in [`../docs/API.md`](../docs/API.md). Types in `lib/types.ts` mirror it.

## Scripts

| Script | Purpose |
|---|---|
| `npm run dev` | Dev server on :3000 |
| `npm run build` | Production build (`output: "standalone"`) |
| `npm run start` | Serve the production build |
| `npm run lint` | ESLint (`next lint`) |
| `npm run typecheck` | `tsc --noEmit` |

The API is same-origin (`/api/v1`, `/ws/...`) behind nginx. When developing without nginx, set
`BACKEND_INTERNAL_URL` (see `.env.example`) so Next rewrites `/api/*`. WebSockets are not proxied
by Next rewrites, so realtime needs nginx (or the dashboard falls back to periodic refetches).

## Layout

- `app/(dashboard)/*` — authenticated admin/employee UI (sidebar order fixed by PRD §8.2)
- `app/display/[slug]` — TV signage page (device credentials only, no admin controls)
- `app/login` — sign-in
- `features/<domain>/` — API hooks (`api.ts`) and domain components
- `schemas/` — Zod form schemas
- `lib/` — API client (`api.ts`), Riyadh time helpers (`time.ts`), WebSocket client (`ws.ts`), i18n, types

## Conventions

- **Time:** always render via `lib/time.ts` (explicit `Asia/Riyadh`). Never use browser-local time.
  FullCalendar runs in `timeZone="UTC"` fed with Riyadh wall-clock strings (Riyadh is fixed UTC+3).
- **Auth:** access token lives in memory only; refresh token is an httpOnly cookie. `api()` retries
  once after `/auth/refresh` on 401. Permission checks in the UI (`<Can>`, `usePermission`) are hints;
  the backend enforces everything.
- **Status UI:** always icon + text (`components/common/status-badge.tsx`), never color alone.
- **i18n:** wrap UI strings in `t("English text")`; Arabic lives in `lib/i18n.tsx` and falls back to English.

## TV display

- Pairing: open the `pairing_url` from *TV Displays → Register* on the TV. The device token is read
  from `#token=…` (fragment, never sent to the server), stored in localStorage, then stripped from the URL.
- The page exchanges it for a 15-minute display JWT, connects `/ws/display/{slug}`, refetches on every
  (re)connect, polls as a safety net, and recomputes status every second from server-corrected time.
- Target: Samsung Tizen 5.5+ (Chromium 69). Avoid flex `gap`, `inset`, `aspect-ratio`, and newer JS APIs
  in `features/display/*`. Older TVs need an external Android/mini-PC kiosk player. Test on real hardware.
