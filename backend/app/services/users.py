import uuid

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.errors import Conflict, Forbidden, NotFound, ValidationFailed
from app.core.security import hash_password
from app.core.timeutils import now_utc
from app.models import Department, Permission, Role, User
from app.permissions.codes import SUPER_ADMIN
from app.permissions.policy import Principal, can_grant_roles
from app.repositories.bookings import BookingRepository
from app.repositories.users import UserRepository
from app.schemas.users import DepartmentCreate, DepartmentUpdate, UserCreate, UserUpdate
from app.services import audit
from app.services.auth import revoke_all_sessions

USER_FIELDS = ["full_name", "email", "department_id", "is_active"]
DEPT_FIELDS = ["name", "code", "description", "manager_id", "is_active"]


class UserService:
    def __init__(self, session: AsyncSession, principal: Principal, ip: str | None):
        self.s, self.p, self.ip = session, principal, ip
        self.repo = UserRepository(session)

    async def _roles(self, names: list[str]) -> list[Role]:
        names = list(dict.fromkeys(names))
        roles = await self.repo.roles_by_name(names)
        missing = set(names) - {r.name for r in roles}
        if missing:
            raise ValidationFailed(f"Unknown roles: {', '.join(sorted(missing))}", code="unknown_role")
        if not can_grant_roles(self.p, set(names)):
            raise Forbidden("You are not allowed to assign these roles")
        return roles

    async def _check_department(self, dept_id: uuid.UUID | None) -> None:
        if dept_id is not None:
            dept = await self.s.get(Department, dept_id)
            if dept is None or not dept.is_active:
                raise ValidationFailed("Department not found or inactive", code="department_inactive")

    async def _email_free(self, email: str, exclude: uuid.UUID | None = None) -> None:
        stmt = select(User.id).where(User.email == email.lower())
        if exclude:
            stmt = stmt.where(User.id != exclude)
        if (await self.s.execute(stmt)).first():
            raise Conflict("A user with this email already exists", code="email_taken")

    async def create(self, data: UserCreate) -> User:
        await self._email_free(data.email)
        await self._check_department(data.department_id)
        roles = await self._roles(data.roles) if data.roles else []
        user = User(full_name=data.full_name.strip(), email=data.email.lower(),
                    password_hash=hash_password(data.password), department_id=data.department_id,
                    is_active=data.is_active)
        user.roles = roles
        self.s.add(user)
        await self.s.flush()
        audit.record(self.s, action="user.created", entity_type="user", entity_id=user.id,
                     actor_user_id=self.p.user_id, ip_address=self.ip,
                     new_values={**audit.snapshot(user, USER_FIELDS), "roles": [r.name for r in roles]})
        await self.s.commit()
        return await self.repo.get(user.id)  # type: ignore[return-value]

    async def update(self, user_id: uuid.UUID, data: UserUpdate) -> User:
        user = await self.repo.get(user_id)
        if user is None:
            raise NotFound("User not found")
        if SUPER_ADMIN in {r.name for r in user.roles} and not self.p.is_super_admin:
            raise Forbidden("Only a super admin can modify a super admin")
        changes = data.model_dump(exclude_unset=True)
        old = {**audit.snapshot(user, USER_FIELDS), "roles": sorted(r.name for r in user.roles)}

        if "email" in changes and changes["email"]:
            await self._email_free(changes["email"], user.id)
            user.email = changes["email"].lower()
        if "full_name" in changes and changes["full_name"]:
            user.full_name = changes["full_name"].strip()
        if "department_id" in changes:
            await self._check_department(changes["department_id"])
            user.department_id = changes["department_id"]
        if "roles" in changes and changes["roles"] is not None:
            if user.id == self.p.user_id and SUPER_ADMIN in old["roles"] and SUPER_ADMIN not in changes["roles"]:
                raise ValidationFailed("You cannot remove your own super admin role", code="self_demotion")
            user.roles = await self._roles(changes["roles"])
        if changes.get("password"):
            user.password_hash = hash_password(changes["password"])
            await revoke_all_sessions(self.s, user.id)
        if "is_active" in changes and changes["is_active"] is not None:
            if user.id == self.p.user_id and not changes["is_active"]:
                raise ValidationFailed("You cannot deactivate your own account", code="self_deactivation")
            user.is_active = changes["is_active"]
            if not user.is_active:
                await revoke_all_sessions(self.s, user.id)

        new = {**audit.snapshot(user, USER_FIELDS), "roles": sorted(r.name for r in user.roles)}
        o, n = audit.diff(old, new)
        if changes.get("password"):
            n["password"] = "(reset)"
        action = "user.roles_changed" if "roles" in n else "user.updated"
        audit.record(self.s, action=action, entity_type="user", entity_id=user.id,
                     actor_user_id=self.p.user_id, old_values=o, new_values=n, ip_address=self.ip)
        await self.s.commit()
        return await self.repo.get(user.id)  # type: ignore[return-value]

    async def deactivate(self, user_id: uuid.UUID) -> tuple[User, int]:
        user = await self.update(user_id, UserUpdate(is_active=False))
        # Future bookings are intentionally kept; admins decide whether to cancel/reassign them.
        count = await BookingRepository(self.s).count_future(organizer_id=user.id, now=now_utc())
        return user, count


async def set_role_permissions(session: AsyncSession, p: Principal, role_id: uuid.UUID, codes: list[str],
                               ip: str | None) -> Role:
    role = (await session.execute(select(Role).where(Role.id == role_id)
                                  .options(selectinload(Role.permissions)))).scalar_one_or_none()
    if role is None:
        raise NotFound("Role not found")
    if role.name == SUPER_ADMIN:
        raise ValidationFailed("The super admin role always has every permission", code="immutable_role")
    perms = list((await session.execute(select(Permission).where(Permission.code.in_(codes)))).scalars())
    missing = set(codes) - {x.code for x in perms}
    if missing:
        raise ValidationFailed(f"Unknown permissions: {', '.join(sorted(missing))}", code="unknown_permission")
    old = sorted(x.code for x in role.permissions)
    role.permissions = perms
    audit.record(session, action="role.permissions_changed", entity_type="role", entity_id=role.id,
                 actor_user_id=p.user_id, ip_address=ip, old_values={"permissions": old},
                 new_values={"permissions": sorted(codes)})
    await session.commit()
    return role


class DepartmentService:
    def __init__(self, session: AsyncSession, principal: Principal, ip: str | None):
        self.s, self.p, self.ip = session, principal, ip

    async def get(self, dept_id: uuid.UUID) -> Department:
        d = (await self.s.execute(select(Department).where(Department.id == dept_id)
                                  .options(selectinload(Department.manager))
                                  .execution_options(populate_existing=True))).scalar_one_or_none()
        if d is None:
            raise NotFound("Department not found")
        return d

    async def list(self, include_inactive: bool) -> list[tuple[Department, int]]:
        counts = (select(User.department_id, func.count().label("n"))
                  .where(User.is_active.is_(True)).group_by(User.department_id).subquery())
        stmt = (select(Department, func.coalesce(counts.c.n, 0))
                .outerjoin(counts, counts.c.department_id == Department.id)
                .options(selectinload(Department.manager)).order_by(Department.name))
        if not include_inactive:
            stmt = stmt.where(Department.is_active.is_(True))
        return [(d, int(n)) for d, n in (await self.s.execute(stmt)).all()]

    async def member_count(self, dept_id: uuid.UUID) -> int:
        return int((await self.s.execute(select(func.count()).select_from(User).where(
            User.department_id == dept_id, User.is_active.is_(True)))).scalar_one())

    async def _code_free(self, code: str, exclude: uuid.UUID | None = None) -> None:
        stmt = select(Department.id).where(Department.code == code)
        if exclude:
            stmt = stmt.where(Department.id != exclude)
        if (await self.s.execute(stmt)).first():
            raise Conflict("Department code already exists", code="code_taken")

    async def _check_manager(self, manager_id: uuid.UUID | None) -> None:
        if manager_id is not None:
            m = await self.s.get(User, manager_id)
            if m is None or not m.is_active:
                raise ValidationFailed("Manager must be an active user", code="manager_inactive")

    async def create(self, data: DepartmentCreate) -> Department:
        await self._code_free(data.code)
        await self._check_manager(data.manager_id)
        d = Department(name=data.name.strip(), code=data.code, description=data.description,
                       manager_id=data.manager_id)
        self.s.add(d)
        await self.s.flush()
        audit.record(self.s, action="department.created", entity_type="department", entity_id=d.id,
                     actor_user_id=self.p.user_id, ip_address=self.ip,
                     new_values=audit.snapshot(d, DEPT_FIELDS))
        await self.s.commit()
        return await self.get(d.id)

    async def update(self, dept_id: uuid.UUID, data: DepartmentUpdate) -> Department:
        d = await self.get(dept_id)
        old = audit.snapshot(d, DEPT_FIELDS)
        changes = data.model_dump(exclude_unset=True)
        if changes.get("code"):
            await self._code_free(changes["code"], d.id)
        if "manager_id" in changes:
            await self._check_manager(changes["manager_id"])
        for k, v in changes.items():
            if v is not None or k in ("description", "manager_id"):
                setattr(d, k, v)
        o, n = audit.diff(old, audit.snapshot(d, DEPT_FIELDS))
        audit.record(self.s, action="department.updated", entity_type="department", entity_id=d.id,
                     actor_user_id=self.p.user_id, old_values=o, new_values=n, ip_address=self.ip)
        await self.s.commit()
        return await self.get(d.id)
