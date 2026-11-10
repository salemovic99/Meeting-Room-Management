import uuid

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import DisplaySettings, MeetingRoom


class RoomRepository:
    def __init__(self, session: AsyncSession):
        self.s = session

    async def get(self, room_id: uuid.UUID) -> MeetingRoom | None:
        return await self.s.get(MeetingRoom, room_id)

    async def by_slug(self, slug: str) -> MeetingRoom | None:
        return (await self.s.execute(
            select(MeetingRoom).where(MeetingRoom.display_slug == slug))).scalar_one_or_none()

    async def list(self, include_inactive: bool = False) -> list[MeetingRoom]:
        stmt = select(MeetingRoom).order_by(MeetingRoom.name)
        if not include_inactive:
            stmt = stmt.where(MeetingRoom.is_active.is_(True))
        return list((await self.s.execute(stmt)).scalars())

    async def code_or_slug_taken(self, code: str | None, slug: str | None,
                                 exclude_id: uuid.UUID | None = None) -> str | None:
        for field, value in (("code", code), ("display_slug", slug)):
            if value is None:
                continue
            stmt = select(MeetingRoom.id).where(getattr(MeetingRoom, field) == value)
            if exclude_id:
                stmt = stmt.where(MeetingRoom.id != exclude_id)
            if (await self.s.execute(stmt)).first():
                return field
        return None

    async def display_settings(self, room_id: uuid.UUID) -> DisplaySettings:
        ds = (await self.s.execute(
            select(DisplaySettings).where(DisplaySettings.room_id == room_id))).scalar_one_or_none()
        if ds is None:  # self-heal rooms created before settings existed
            ds = DisplaySettings(room_id=room_id)
            self.s.add(ds)
            await self.s.flush()
        return ds
