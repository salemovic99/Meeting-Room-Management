import uuid

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.errors import NotFound, ValidationFailed
from app.core.timeutils import now_utc
from app.models import Announcement, MeetingRoom
from app.permissions.policy import Principal
from app.schemas.common import UserRef
from app.schemas.display import AnnouncementCreate, AnnouncementOut, AnnouncementUpdate
from app.services import audit, outbox

FIELDS = ["title", "message", "priority", "start_at", "end_at", "is_active"]


def announcement_state(a: Announcement, now) -> str:
    if not a.is_active:
        return "inactive"
    if now < a.start_at:
        return "scheduled"
    if now >= a.end_at:
        return "expired"
    return "active"


def announcement_out(a: Announcement) -> AnnouncementOut:
    return AnnouncementOut(
        id=a.id, title=a.title, message=a.message, priority=a.priority, start_at=a.start_at, end_at=a.end_at,
        is_active=a.is_active, room_ids=[r.id for r in a.rooms], state=announcement_state(a, now_utc()),  # type: ignore[arg-type]
        created_by=UserRef(id=a.creator.id, full_name=a.creator.full_name) if a.creator else None,
        created_at=a.created_at, updated_at=a.updated_at)


class AnnouncementService:
    def __init__(self, session: AsyncSession, principal: Principal, ip: str | None):
        self.s, self.p, self.ip = session, principal, ip

    async def _get(self, ann_id: uuid.UUID) -> Announcement:
        a = (await self.s.execute(select(Announcement).where(Announcement.id == ann_id)
                                  .execution_options(populate_existing=True))).scalar_one_or_none()
        if a is None:
            raise NotFound("Announcement not found")
        return a

    async def _rooms(self, ids: list[uuid.UUID]) -> list[MeetingRoom]:
        if not ids:
            return []
        rooms = list((await self.s.execute(select(MeetingRoom).where(MeetingRoom.id.in_(ids)))).scalars())
        if len(rooms) != len(set(ids)):
            raise ValidationFailed("One or more rooms do not exist", code="room_not_found")
        return rooms

    def _notify(self, a: Announcement, extra_room_ids: list[uuid.UUID] | None = None) -> None:
        room_ids = [r.id for r in a.rooms] + (extra_room_ids or [])
        outbox.enqueue(self.s, "display.announcement_updated", "announcement", a.id,
                       room_ids=room_ids, all_rooms=not room_ids, data={"announcement_id": str(a.id)})

    async def list(self, state: str | None) -> list[Announcement]:
        items = list((await self.s.execute(select(Announcement).order_by(Announcement.start_at.desc()))).scalars())
        if state:
            now = now_utc()
            items = [a for a in items if announcement_state(a, now) == state]
        return items

    async def create(self, data: AnnouncementCreate) -> Announcement:
        a = Announcement(title=data.title, message=data.message, priority=data.priority,
                         start_at=data.start_at, end_at=data.end_at, is_active=data.is_active,
                         created_by=self.p.user_id)
        a.rooms = await self._rooms(data.room_ids)
        self.s.add(a)
        await self.s.flush()
        audit.record(self.s, action="announcement.created", entity_type="announcement", entity_id=a.id,
                     actor_user_id=self.p.user_id, ip_address=self.ip,
                     new_values={**audit.snapshot(a, FIELDS), "room_ids": data.room_ids})
        self._notify(a)
        await outbox.commit(self.s)
        return await self._get(a.id)

    async def update(self, ann_id: uuid.UUID, data: AnnouncementUpdate) -> Announcement:
        a = await self._get(ann_id)
        old = {**audit.snapshot(a, FIELDS), "room_ids": sorted(str(r.id) for r in a.rooms)}
        old_rooms = [r.id for r in a.rooms]
        changes = data.model_dump(exclude_unset=True)
        for k in FIELDS:
            if changes.get(k) is not None:
                setattr(a, k, changes[k])
        if a.start_at >= a.end_at:
            raise ValidationFailed("start_at must be earlier than end_at", code="invalid_time_range")
        if changes.get("room_ids") is not None:
            a.rooms = await self._rooms(changes["room_ids"])
        new = {**audit.snapshot(a, FIELDS), "room_ids": sorted(str(r.id) for r in a.rooms)}
        o, n = audit.diff(old, new)
        audit.record(self.s, action="announcement.updated", entity_type="announcement", entity_id=a.id,
                     actor_user_id=self.p.user_id, old_values=o, new_values=n, ip_address=self.ip)
        # If it used to target all rooms (old_rooms empty), every display must refresh.
        if not old_rooms:
            outbox.enqueue(self.s, "display.announcement_updated", "announcement", a.id, all_rooms=True,
                           data={"announcement_id": str(a.id)})
        else:
            self._notify(a, old_rooms)
        await outbox.commit(self.s)
        return await self._get(a.id)

    async def delete(self, ann_id: uuid.UUID) -> None:
        a = await self._get(ann_id)
        self._notify(a)
        audit.record(self.s, action="announcement.deleted", entity_type="announcement", entity_id=a.id,
                     actor_user_id=self.p.user_id, ip_address=self.ip, old_values=audit.snapshot(a, FIELDS))
        await self.s.delete(a)
        await outbox.commit(self.s)
