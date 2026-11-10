# API Contract (v1)

This is the contract between `backend/` (FastAPI) and `frontend/` (Next.js). If you change it, update both sides.

- Base path: `/api/v1`. Nginx serves `/api/*` and `/ws/*` from the backend and everything else from the frontend, all on one origin.
- JSON uses snake_case. Datetimes are ISO‑8601 with an offset, stored and returned in UTC. Clients render them in `Asia/Riyadh`. Clients send datetimes with an explicit offset (e.g. `2026-11-10T09:00:00+03:00`).
- Paginated lists return `{ "items": [...], "total": n, "page": 1, "page_size": 25 }`. Query params: `page`, `page_size` (max 200).
- Every error has this shape: `{ "error": { "code": "string", "message": "string", "details": {} | null } }`.
  Common codes: `unauthorized` (401), `forbidden` (403), `not_found` (404), `validation_error` (422, `details.fields: [{loc, msg}]`), `booking_conflict` (409), `rate_limited` (429).

## Auth (users)

- `POST /auth/login` `{email, password}` → `TokenResponse`. Also sets the httpOnly cookie `mrm_refresh` (path `/api/v1/auth`).
- `POST /auth/refresh` (uses the cookie) → `TokenResponse`. The refresh token is rotated each time.
- `POST /auth/logout` → 204. Revokes the refresh session and clears the cookie.
- `GET /auth/me` → `Me`
- `POST /auth/change-password` `{current_password, new_password}` → 204

`TokenResponse = { access_token, token_type: "bearer", expires_in, user: Me }`
Send the access token as `Authorization: Bearer <token>`. Keep it in memory only. On a 401, call `/auth/refresh` once and retry.

`Me = UserOut & { permissions: string[] }`

### Permission codes
`users.read, users.lookup, users.manage, roles.manage, departments.read, departments.manage, rooms.read, rooms.manage, bookings.create, bookings.read_all, bookings.manage_all, bookings.manage_department, bookings.manage_own, bookings.override_capacity, displays.manage, announcements.manage, analytics.view, analytics.view_department, audit.view, settings.manage`

Roles: `super_admin` (all), `it_admin`, `receptionist`, `department_manager`, `employee`.

## Users / Roles

`UserOut = { id, full_name, email, department_id, department: {id,name,code}|null, is_active, roles: string[], created_at, updated_at }`

- `GET /users?q&department_id&is_active&role&page&page_size` (users.read) → page of `UserOut`
- `GET /users/lookup?q&limit=20` (users.lookup or users.read) → `[{id, full_name, email, department_id}]` (active users only)
- `POST /users` (users.manage) `{full_name, email, password, department_id?, roles: string[], is_active?}` → `UserOut`
- `GET /users/{id}` → `UserOut`
- `PATCH /users/{id}` (users.manage) `{full_name?, email?, password?, department_id?, roles?, is_active?}` → `UserOut`. Changing `roles` requires `roles.manage`, and only a super_admin can grant `super_admin`.
- `DELETE /users/{id}` (users.manage) → `{ user: UserOut, future_bookings_count }` (this deactivates the user and does not delete them)
- `GET /roles` → `[{id, name, description, permissions: string[]}]`
- `GET /permissions` → `[{id, code, description}]`
- `PUT /roles/{id}/permissions` (roles.manage) `{permissions: string[]}` → role

## Departments

`Department = { id, name, code, description, manager_id, manager: {id, full_name}|null, is_active, member_count, created_at, updated_at }`

- `GET /departments?include_inactive=false` (departments.read) → `Department[]`
- `POST /departments` (departments.manage) `{name, code, description?, manager_id?}`
- `PATCH /departments/{id}` `{name?, code?, description?, manager_id?, is_active?}`
- `DELETE /departments/{id}` → deactivates and returns `Department`

## Rooms

`Room = { id, name, code, display_slug, location, floor, capacity, description, equipment: string[], operating_hours: OperatingHours|null, is_active, maintenance_mode, maintenance_message, display_url, created_at, updated_at }`
`OperatingHours = { mon|tue|wed|thu|fri|sat|sun: {open:"HH:MM", close:"HH:MM"} | null }`. A `null` day means the room is closed that day. A `null` operating_hours object means the room is open 24/7.

- `GET /rooms?include_inactive=false` (rooms.read) → `Room[]`
- `POST /rooms` (rooms.manage) `{name, code, display_slug, location?, floor?, capacity, description?, equipment?, operating_hours?}`
- `GET /rooms/{id}` → `Room`
- `PATCH /rooms/{id}` (rooms.manage) partial, including `is_active`, `maintenance_mode`, `maintenance_message` → `Room & { affected_future_bookings: number }`
- `GET /rooms/by-slug/{slug}/quick-book` (rooms.read) → `QuickBookInfo`. This feeds the QR walk-up page (see below).
- `GET /rooms/availability` (rooms.read) → `Availability[]` for every active room
- `GET /rooms/{id}/availability` → `Availability`
- `GET /rooms/{id}/bookings?from&to` → `Booking[]`
- `GET /rooms/{id}/display-settings` (displays.manage) → `DisplaySettings`
- `PUT /rooms/{id}/display-settings` (displays.manage) partial `DisplaySettings` → `DisplaySettings`

`Availability = { room_id, room_name, room_code, capacity, location, status: "available"|"upcoming"|"occupied"|"maintenance"|"unavailable", current_booking: BookingBrief|null, next_booking: BookingBrief|null, next_available_at, free_until, server_time }`
`BookingBrief = { id, title, organizer_name, department_name, start_at, end_at }`. For users who can't see the booking, `title` reads `"Reserved"` and the names are null.

Status is computed from the current time and the bookings. It is never stored. The rules are:
- **maintenance** if the room is in maintenance mode.
- **unavailable** if the room is inactive or outside its operating hours.
- **occupied** if a booking is running now.
- **upcoming** if the next booking starts within the `availability.upcoming_threshold_minutes` setting (default 15).
- **available** otherwise.

## Bookings

`meeting_type`: `internal|external|management|interview|training|project|other`
`status` (stored): `confirmed|in_progress|completed|cancelled`. `effective_status` adds time awareness on read.

`Booking = { id, room_id, room: {id,name,code}, organizer_id, organizer: {id, full_name, email}, department_id, department: {id,name,code}, series_id, is_series_exception, title, description, meeting_type, start_at, end_at, attendee_count, status, effective_status, source: "dashboard"|"qr", notes, created_by_id, created_at, updated_at, cancelled_at, cancellation_reason, can_manage, redacted }`

Redacted bookings come back with `title: "Reserved"`, and `description`, `notes` and `organizer.email` set to null.

- `GET /bookings?room_id&department_id&organizer_id&status&from&to&q&mine&page&page_size` → page of `Booking`
- `POST /bookings` (bookings.create) `{room_id, title, meeting_type, start_at, end_at, attendee_count, organizer_id?, department_id?, description?, notes?, override_capacity?, source?: "dashboard"|"qr"}` → 201 `Booking`
- `GET /bookings/{id}` → `Booking`
- `PATCH /bookings/{id}` partial of the create fields → `Booking`. Editing one occurrence of a series sets `is_series_exception`.
- `POST /bookings/{id}/cancel` `{reason?}` → `Booking`
- `GET /bookings/calendar?from&to&room_id&department_id&include_cancelled=false` → `{ items: Booking[] }`
- `GET /bookings/conflicts?room_id&start_at&end_at&exclude_booking_id` → `{ has_conflict, conflicts: [{id, title, start_at, end_at}] }`
- `POST /bookings/recurring` `{...create fields, recurrence: {frequency: "daily"|"weekly"|"monthly", interval: 1, weekdays?: number[] /*0=Mon..6=Sun, weekly only*/, end_date: "YYYY-MM-DD"}, skip_conflicts: false}` → 201 `{ series: Series, created: Booking[], skipped: [{start_at, end_at, reason}] }`
  If any occurrence conflicts and `skip_conflicts` is false, nothing is created and the call returns 409 `booking_conflict` with `details.conflicts: [{start_at, end_at, reason, conflicting_booking_id}]`. `reason` is `conflict`, or a validation code for that date (e.g. `outside_operating_hours`, `start_in_past`, `too_far_in_advance`), and `conflicting_booking_id` may be null. A series can have at most 366 occurrences.
- `GET /bookings/series/{id}` → `{ series: Series, occurrences: Booking[] }`
- `PATCH /bookings/series/{id}` `{title?, description?, meeting_type?, attendee_count?, notes?, room_id?, start_time?: "HH:MM", end_time?: "HH:MM"}` → applies to future, non‑cancelled occurrences and returns `{series, occurrences}`. The whole change is atomic, and any conflict returns 409.
- `POST /bookings/series/{id}/cancel` `{reason?}` → cancels future occurrences and returns `{series, cancelled_count}`

`Series = { id, organizer_id, recurrence_rule, series_start_date, series_end_date, created_at, updated_at }`

A conflict looks like this: 409 `{error:{code:"booking_conflict", message, details:{conflicts:[{id, title, start_at, end_at}]}}}`. Titles in conflicts are redacted when the caller isn't allowed to see them.

## QR walk-up booking

When `show_qr_code` is on, the TV shows a QR code for `DisplaySchedule.qr_target_url`. That is the room's `qr_code_url` if one is set, otherwise `APP_URL/book/{display_slug}`. The URL carries no secret.
- The frontend page `/book/{slug}` requires a normal user login. It sends the user to `/login?next=/book/{slug}` and back again afterwards.
- It reads `GET /rooms/by-slug/{slug}/quick-book` and books through the normal `POST /bookings` with `source: "qr"`, so all validation and the overlap constraint still apply.

`QuickBookInfo = { server_time, room: Room, availability: Availability, can_book, reason: "no_permission"|"inactive"|"maintenance"|"closed"|null, min_duration_minutes, max_duration_minutes, now_options: [{minutes, start_at, end_at}], free_slots: [{start_at, end_at}], todays_bookings: Booking[] }`
- `now_options` holds one-tap durations (15, 30, 45, 60, 90 and 120 min, plus "until the next meeting") that start at the current minute and fit before the next meeting or closing time. It is empty while the room is occupied.
- `free_slots` holds today's remaining gaps within operating hours, with gaps shorter than the minimum duration removed. They are suggestions only; the server re-validates on `POST /bookings`.

## Displays (admin)

`Device = { id, device_name, room_id, room: {id,name,code,display_slug}, status: "online"|"offline"|"unknown"|"disabled", is_active, last_heartbeat_at, last_connected_at, browser_info, firmware_info, display_url, created_at, updated_at }`

- `GET /display/devices` (displays.manage) → `Device[]`
- `POST /display/devices/register` (displays.manage) `{device_name, room_id}` → 201 `{ device, device_token, pairing_url }`. The token is shown only once. `pairing_url` = `APP_URL/display/{slug}#token=<device_token>`.
- `PATCH /display/devices/{id}` `{device_name?, room_id?, is_active?}` → `Device`
- `POST /display/devices/{id}/rotate-token` → `{ device, device_token, pairing_url }`. The old token stops working immediately.
- `POST /display/devices/{id}/refresh` → 202. Tells the connected TV to reload.

## Displays (TV client)

- `GET /display/{slug}` (public) → `{ room_name, display_slug, company_name }`
- `POST /display/session`, header `Authorization: Device <device_token>`, body `{browser_info?, firmware_info?}` → `{ access_token, expires_in, room_slug, device_id }`. This is a short-lived display JWT (15 min). The TV refreshes it about every 10 minutes using the stored device token.
- `GET /display/{slug}/schedule`, header `Authorization: Bearer <display token>` → `DisplaySchedule`. Returns 403 if the device is assigned to a different room.
- `GET /display/{slug}/settings` → `DisplaySettings`
- `POST /display/devices/heartbeat` (display token) `{browser_info?}` → 204

`DisplaySchedule = { server_time, timezone, upcoming_threshold_minutes, qr_target_url, room: {name, code, location, capacity, maintenance_mode, maintenance_message}, status: {state, current: DisplayBooking|null, next: DisplayBooking|null, next_available_at, free_until}, upcoming: DisplayBooking[], announcements: [{id, title, message, priority}], settings: DisplaySettings, company: {name, logo_url} }`
`upcoming` holds today's remaining meetings, excluding the one in progress (that one is in `status.current`). Its length is capped at `settings.upcoming_meetings_limit`.
`DisplayBooking = { id, title, organizer_name|null, department_name|null, start_at, end_at, status }`. Organizer and department names are null when the settings hide them. Descriptions and notes are never sent.

`DisplaySettings = { room_id, display_mode: "full_schedule"|"current_meeting"|"availability"|"announcement"|"maintenance", theme: "light"|"dark", primary_color, secondary_color, background_color, logo_url, show_clock, show_date, show_organizer, show_department, show_announcements, show_qr_code, qr_code_url, upcoming_meetings_limit, refresh_interval_seconds, idle_behavior: "show_availability"|"show_announcement"|"dim", language: "en"|"ar", announcement_text, updated_at }`

## WebSockets

- `/ws/display/{slug}`. The client's first message must be `{"type":"auth","token":"<display access token>"}`, sent within 10 seconds. The server answers `{"type":"auth.ok","server_time"}` or closes with `4401` (bad, expired or revoked token) or `4403` (wrong room).
- `/ws/dashboard`. Same handshake, using the user's access token.
- Server → client: `{"type": "<event>", "room_id", "data": {...}, "ts"}`. Events: `booking.created|updated|cancelled|started|ended`, `room.status_changed`, `display.settings_updated`, `display.announcement_updated`, `display.refresh` (the TV should reload the page), `display.device_status` (dashboard only).
- Client → server: send `{"type":"ping"}` every 30s and the server replies `{"type":"pong","server_time"}`. For TVs, the ping also records a heartbeat.
- When a TV receives a booking, room or announcement event it refetches the schedule. A settings event triggers a settings refetch, and `display.refresh` reloads the page. After reconnecting, the TV always refetches.

## Announcements

`Announcement = { id, title, message, priority: "low"|"normal"|"high"|"critical", start_at, end_at, is_active, room_ids: string[] /*empty = all rooms*/, state: "scheduled"|"active"|"expired"|"inactive", created_by: {id, full_name}|null, created_at, updated_at }`

- `GET /announcements?state` (announcements.manage) → `Announcement[]`
- `POST /announcements`, `PATCH /announcements/{id}`, `DELETE /announcements/{id}` (204)

## Analytics & Reports

Period params are `from` and `to` as `YYYY-MM-DD` in Riyadh local dates (inclusive). The default is the last 30 days. Every response includes `period: {from, to}`. Users with only `analytics.view_department` get results scoped to their own department.

- `GET /analytics/overview` (rooms.read) → `{ total_rooms, available_rooms, occupied_rooms, upcoming_meetings, todays_bookings, cancelled_today, booked_hours_today, utilization_today_pct, rooms: Availability[], todays_schedule: Booking[], recent_activity: AuditLog[] }`. `recent_activity` is empty unless the caller has audit.view.
- `GET /analytics/utilization` → `{ period, rooms: [{room_id, room_name, booking_count, booked_hours, available_hours, utilization_pct}], most_used_room_id }`. Available hours are calculated from each room's operating hours.
- `GET /analytics/departments` → `{ period, departments: [{department_id, name, booking_count, booked_hours, share_pct}] }`
- `GET /analytics/cancellations` → `{ period, total_bookings, cancelled, cancellation_rate_pct, by_room: [{room_id, room_name, cancelled}], by_department: [{department_id, name, cancelled}] }`
- `GET /analytics/peak-hours` → `{ period, hours: [{hour, booking_count, booked_hours}], weekdays: [{weekday /*0=Mon*/, booking_count}] }`
- `GET /reports/{report}?from&to&format=csv|xlsx` (analytics.view or analytics.view_department) → file download. `report` is one of `bookings|room-utilization|department-utilization|organizer-activity|cancellations`.

## Audit logs

`AuditLog = { id, actor_user_id, actor_user: {id, full_name}|null, actor_device_id, action, entity_type, entity_id, old_values, new_values, ip_address, created_at }`

- `GET /audit-logs?action&entity_type&entity_id&actor_user_id&from&to&page&page_size` (audit.view) → page of `AuditLog`

## System settings

- `GET /settings` (settings.manage) → `{ [key]: value }`
- `PATCH /settings` (settings.manage) `{ [key]: value }` → full map

Keys and defaults:
- `company.name` = "Company"
- `company.logo_url` = null
- `booking.min_duration_minutes` = 15
- `booking.max_duration_minutes` = 480
- `booking.advance_days` = 90
- `availability.upcoming_threshold_minutes` = 15

## Health

- `GET /health` → `{status:"ok"}`
- `GET /health/ready` → `{status:"ok", database:"ok"}`, or 503 if the database can't be reached
