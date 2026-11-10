import asyncio
from datetime import time, timedelta

import pytest

from app.core.timeutils import combine_local, local_today

pytestmark = pytest.mark.integration


def next_workday_slot(h: int, duration_min: int = 60):
    d = local_today() + timedelta(days=1)
    while d.weekday() in (4, 5):  # seeded rooms are closed Fri/Sat
        d += timedelta(days=1)
    s = combine_local(d, time(h))
    return s.isoformat(), (s + timedelta(minutes=duration_min)).isoformat()


async def first_room(client, headers):
    r = await client.get("/rooms", headers=headers)
    return r.json()[0]


async def test_create_and_overlap_rejected(client, admin_headers):
    room = await first_room(client, admin_headers)
    start, end = next_workday_slot(10)
    body = {"room_id": room["id"], "title": "Weekly sync", "meeting_type": "internal",
            "start_at": start, "end_at": end, "attendee_count": 4}
    r = await client.post("/bookings", json=body, headers=admin_headers)
    assert r.status_code == 201, r.text

    r = await client.post("/bookings", json=body | {"title": "Clash"}, headers=admin_headers)
    assert r.status_code == 409
    assert r.json()["error"]["code"] == "booking_conflict"


async def test_back_to_back_allowed_and_cancel_frees_slot(client, admin_headers):
    room = await first_room(client, admin_headers)
    s1, e1 = next_workday_slot(11)
    base = {"room_id": room["id"], "meeting_type": "internal", "attendee_count": 2}
    a = await client.post("/bookings", json=base | {"title": "A", "start_at": s1, "end_at": e1}, headers=admin_headers)
    s2, e2 = next_workday_slot(12)
    b = await client.post("/bookings", json=base | {"title": "B", "start_at": s2, "end_at": e2}, headers=admin_headers)
    assert a.status_code == b.status_code == 201

    await client.post(f"/bookings/{a.json()['id']}/cancel", json={}, headers=admin_headers)
    again = await client.post("/bookings", json=base | {"title": "A2", "start_at": s1, "end_at": e1},
                              headers=admin_headers)
    assert again.status_code == 201


async def test_concurrent_requests_cannot_double_book(client, admin_headers):
    room = await first_room(client, admin_headers)
    start, end = next_workday_slot(14)
    body = {"room_id": room["id"], "title": "Race", "meeting_type": "internal",
            "start_at": start, "end_at": end, "attendee_count": 2}
    results = await asyncio.gather(*(client.post("/bookings", json=body, headers=admin_headers)
                                     for _ in range(5)))
    codes = sorted(r.status_code for r in results)
    assert codes.count(201) == 1
    assert all(c == 409 for c in codes if c != 201)


async def test_capacity_validation(client, admin_headers):
    room = await first_room(client, admin_headers)
    start, end = next_workday_slot(15)
    body = {"room_id": room["id"], "title": "Big", "meeting_type": "training", "start_at": start,
            "end_at": end, "attendee_count": room["capacity"] + 1}
    r = await client.post("/bookings", json=body, headers=admin_headers)
    assert r.status_code == 422
    r = await client.post("/bookings", json=body | {"override_capacity": True}, headers=admin_headers)
    assert r.status_code == 201  # super admin holds bookings.override_capacity


async def test_audit_log_written(client, admin_headers):
    room = await first_room(client, admin_headers)
    start, end = next_workday_slot(9)
    await client.post("/bookings", json={"room_id": room["id"], "title": "Audited", "meeting_type": "other",
                                         "start_at": start, "end_at": end, "attendee_count": 1},
                      headers=admin_headers)
    r = await client.get("/audit-logs", params={"action": "booking."}, headers=admin_headers)
    assert r.json()["total"] >= 1


async def test_unauthenticated_and_display_isolation(client, admin_headers):
    assert (await client.get("/rooms")).status_code == 401
    rooms = (await client.get("/rooms", headers=admin_headers)).json()
    reg = await client.post("/display/devices/register",
                            json={"device_name": "TV 1", "room_id": rooms[0]["id"]}, headers=admin_headers)
    assert reg.status_code == 201
    token = reg.json()["device_token"]
    sess = await client.post("/display/session", json={}, headers={"Authorization": f"Device {token}"})
    assert sess.status_code == 200
    disp = {"Authorization": f"Bearer {sess.json()['access_token']}"}
    assert (await client.get(f"/display/{rooms[0]['display_slug']}/schedule", headers=disp)).status_code == 200
    assert (await client.get(f"/display/{rooms[1]['display_slug']}/schedule", headers=disp)).status_code == 403
    # display tokens can't reach admin APIs
    assert (await client.get("/rooms", headers=disp)).status_code == 401

    # rotation revokes the old credential and live display sessions
    dev_id = reg.json()["device"]["id"]
    await client.post(f"/display/devices/{dev_id}/rotate-token", headers=admin_headers)
    assert (await client.post("/display/session", json={},
                              headers={"Authorization": f"Device {token}"})).status_code == 401
    assert (await client.get(f"/display/{rooms[0]['display_slug']}/schedule", headers=disp)).status_code == 401


async def test_quick_book_and_qr_source(client, admin_headers):
    rooms = (await client.get("/rooms", headers=admin_headers)).json()
    slug = rooms[0]["display_slug"]
    r = await client.get(f"/rooms/by-slug/{slug}/quick-book", headers=admin_headers)
    assert r.status_code == 200, r.text
    info = r.json()
    assert info["room"]["display_slug"] == slug
    assert (await client.get("/rooms/by-slug/nope/quick-book", headers=admin_headers)).status_code == 404

    start, end = next_workday_slot(16)
    body = {"room_id": rooms[0]["id"], "title": "Walk-up", "meeting_type": "internal",
            "start_at": start, "end_at": end, "attendee_count": 1, "source": "qr"}
    b = await client.post("/bookings", json=body, headers=admin_headers)
    assert b.status_code == 201 and b.json()["source"] == "qr"
    # same overlap protection as any other booking
    assert (await client.post("/bookings", json=body, headers=admin_headers)).status_code == 409
