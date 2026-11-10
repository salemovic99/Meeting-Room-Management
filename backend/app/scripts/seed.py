"""Idempotent bootstrap: permissions, built-in roles, default settings, first super admin, and the
two initial rooms. Safe to run on every container start.

    python -m app.scripts.seed            # uses SEED_ADMIN_EMAIL / SEED_ADMIN_PASSWORD
    python -m app.scripts.seed --no-rooms

Existing role->permission assignments are NOT overwritten (admins may have customised them),
except super_admin, which is always granted every permission.
"""
import argparse
import asyncio
import logging

from sqlalchemy import select
from sqlalchemy.orm import selectinload

from app.core.config import settings
from app.core.database import SessionLocal
from app.core.security import hash_password
from app.models import Department, DisplaySettings, MeetingRoom, Permission, Role, SystemSetting, User
from app.permissions.codes import PERMISSION_DESCRIPTIONS, ROLE_DEFAULTS, SUPER_ADMIN
from app.services.system_settings import DEFAULTS

log = logging.getLogger("seed")

DEFAULT_HOURS = {d: {"open": "07:00", "close": "19:00"} for d in ("sun", "mon", "tue", "wed", "thu")}
DEFAULT_HOURS.update({"fri": None, "sat": None})  # Saudi work week: Sun-Thu

INITIAL_ROOMS = [
    {"name": "Meeting Room 01", "code": "MR-001", "display_slug": "room-01", "capacity": 10},
    {"name": "Meeting Room 02", "code": "MR-002", "display_slug": "room-02", "capacity": 10},
]


async def seed(with_rooms: bool) -> None:
    async with SessionLocal() as s:
        perms = {p.code: p for p in (await s.execute(select(Permission))).scalars()}
        for code, desc in PERMISSION_DESCRIPTIONS.items():
            if code not in perms:
                perms[code] = Permission(code=code, description=desc)
                s.add(perms[code])
        await s.flush()

        roles = {r.name: r for r in (await s.execute(
            select(Role).options(selectinload(Role.permissions)))).scalars()}
        for name, (desc, codes) in ROLE_DEFAULTS.items():
            role = roles.get(name)
            if role is None:
                role = Role(name=name, description=desc)
                role.permissions = [perms[c] for c in codes]
                s.add(role)
                roles[name] = role
            elif name == SUPER_ADMIN:
                role.permissions = list(perms.values())
        await s.flush()

        existing = {k for (k,) in (await s.execute(select(SystemSetting.key))).all()}
        for key, value in DEFAULTS.items():
            if key not in existing:
                s.add(SystemSetting(key=key, value=value))

        general = (await s.execute(select(Department).order_by(Department.created_at).limit(1))).scalar_one_or_none()
        if general is None:
            general = Department(name="General", code="GEN", description="Default department")
            s.add(general)
            await s.flush()

        if settings.seed_admin_email and settings.seed_admin_password:
            email = settings.seed_admin_email.lower()
            if (await s.execute(select(User).where(User.email == email))).scalar_one_or_none() is None:
                admin = User(full_name="System Administrator", email=email,
                             password_hash=hash_password(settings.seed_admin_password),
                             department_id=general.id)
                admin.roles = [roles[SUPER_ADMIN]]
                s.add(admin)
                log.info("created super admin %s", email)

        if with_rooms and (await s.execute(select(MeetingRoom.id).limit(1))).first() is None:
            for spec in INITIAL_ROOMS:
                room = MeetingRoom(**spec, equipment=["TV", "HDMI"], operating_hours=DEFAULT_HOURS)
                s.add(room)
                await s.flush()
                s.add(DisplaySettings(room_id=room.id))
            log.info("created initial rooms")

        await s.commit()
    log.info("seed complete")


def main() -> None:
    logging.basicConfig(level=logging.INFO)
    parser = argparse.ArgumentParser()
    parser.add_argument("--no-rooms", action="store_true")
    args = parser.parse_args()
    asyncio.run(seed(with_rooms=not args.no_rooms))


if __name__ == "__main__":
    main()
