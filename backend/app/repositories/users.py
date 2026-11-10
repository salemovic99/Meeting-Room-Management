import uuid

from sqlalchemy import func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models import Role, User


class UserRepository:
    def __init__(self, session: AsyncSession):
        self.s = session

    async def get(self, user_id: uuid.UUID, *, with_roles: bool = True) -> User | None:
        stmt = select(User).where(User.id == user_id).execution_options(populate_existing=True)
        if with_roles:
            stmt = stmt.options(selectinload(User.roles))
        return (await self.s.execute(stmt)).scalar_one_or_none()

    async def by_email(self, email: str) -> User | None:
        return (await self.s.execute(
            select(User).where(User.email == email.lower()).options(selectinload(User.roles))
        )).scalar_one_or_none()

    async def search(self, *, q: str | None, department_id: uuid.UUID | None, is_active: bool | None,
                     role: str | None, offset: int, limit: int) -> tuple[list[User], int]:
        stmt = select(User)
        if q:
            like = f"%{q.strip()}%"
            stmt = stmt.where(or_(User.full_name.ilike(like), User.email.ilike(like)))
        if department_id:
            stmt = stmt.where(User.department_id == department_id)
        if is_active is not None:
            stmt = stmt.where(User.is_active.is_(is_active))
        if role:
            stmt = stmt.where(User.roles.any(Role.name == role))
        total = (await self.s.execute(select(func.count()).select_from(stmt.subquery()))).scalar_one()
        rows = (await self.s.execute(
            stmt.options(selectinload(User.roles)).order_by(User.full_name).offset(offset).limit(limit)
        )).scalars().all()
        return list(rows), int(total)

    async def lookup(self, q: str | None, limit: int) -> list[User]:
        stmt = select(User).where(User.is_active.is_(True))
        if q:
            like = f"%{q.strip()}%"
            stmt = stmt.where(or_(User.full_name.ilike(like), User.email.ilike(like)))
        return list((await self.s.execute(stmt.order_by(User.full_name).limit(limit))).scalars())

    async def roles_by_name(self, names: list[str]) -> list[Role]:
        if not names:
            return []
        return list((await self.s.execute(select(Role).where(Role.name.in_(names)))).scalars())
