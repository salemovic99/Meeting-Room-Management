import uuid

from fastapi import APIRouter, Depends, Query
from sqlalchemy import select

from app.api.deps import DB, CurrentUser, require
from app.core.errors import NotFound
from app.models import Permission, Role
from app.permissions.codes import P
from app.repositories.users import UserRepository
from app.schemas.common import Page, PageParams
from app.schemas.users import (
    DepartmentCreate,
    DepartmentOut,
    DepartmentUpdate,
    PermissionOut,
    RoleOut,
    RolePermissionsIn,
    UserCreate,
    UserDeactivated,
    UserLookup,
    UserOut,
    UserUpdate,
)
from app.services.users import DepartmentService, UserService, set_role_permissions

router = APIRouter(tags=["users"])


@router.get("/users", response_model=Page[UserOut])
async def list_users(session: DB, current: CurrentUser = require(P.USERS_READ), page: PageParams = Depends(),
                     q: str | None = None, department_id: uuid.UUID | None = None,
                     is_active: bool | None = None, role: str | None = None):
    items, total = await UserRepository(session).search(q=q, department_id=department_id, is_active=is_active,
                                                        role=role, offset=page.offset, limit=page.page_size)
    return Page(items=[UserOut.model_validate(u) for u in items], total=total, page=page.page,
                page_size=page.page_size)


@router.get("/users/lookup", response_model=list[UserLookup])
async def lookup_users(session: DB, current: CurrentUser = require(P.USERS_LOOKUP, P.USERS_READ),
                       q: str | None = None, limit: int = Query(20, ge=1, le=50)):
    users = await UserRepository(session).lookup(q, limit)
    return [UserLookup.model_validate(u) for u in users]


@router.post("/users", response_model=UserOut, status_code=201)
async def create_user(body: UserCreate, session: DB, current: CurrentUser = require(P.USERS_MANAGE)):
    return UserOut.model_validate(await UserService(session, current.principal, current.ip).create(body))


@router.get("/users/{user_id}", response_model=UserOut)
async def get_user(user_id: uuid.UUID, session: DB, current: CurrentUser = require(P.USERS_READ)):
    user = await UserRepository(session).get(user_id)
    if user is None:
        raise NotFound("User not found")
    return UserOut.model_validate(user)


@router.patch("/users/{user_id}", response_model=UserOut)
async def update_user(user_id: uuid.UUID, body: UserUpdate, session: DB,
                      current: CurrentUser = require(P.USERS_MANAGE)):
    return UserOut.model_validate(await UserService(session, current.principal, current.ip).update(user_id, body))


@router.delete("/users/{user_id}", response_model=UserDeactivated)
async def deactivate_user(user_id: uuid.UUID, session: DB, current: CurrentUser = require(P.USERS_MANAGE)):
    user, count = await UserService(session, current.principal, current.ip).deactivate(user_id)
    return UserDeactivated(user=UserOut.model_validate(user), future_bookings_count=count)


# ---- roles & permissions ----------------------------------------------------------------------

def _role_out(r: Role) -> RoleOut:
    return RoleOut(id=r.id, name=r.name, description=r.description,
                   permissions=sorted(p.code for p in r.permissions))


@router.get("/roles", response_model=list[RoleOut])
async def list_roles(session: DB, current: CurrentUser = require(P.USERS_READ, P.ROLES_MANAGE, P.USERS_MANAGE)):
    return [_role_out(r) for r in (await session.execute(select(Role).order_by(Role.name))).scalars()]


@router.get("/permissions", response_model=list[PermissionOut])
async def list_permissions(session: DB, current: CurrentUser = require(P.ROLES_MANAGE)):
    return list((await session.execute(select(Permission).order_by(Permission.code))).scalars())


@router.put("/roles/{role_id}/permissions", response_model=RoleOut)
async def put_role_permissions(role_id: uuid.UUID, body: RolePermissionsIn, session: DB,
                               current: CurrentUser = require(P.ROLES_MANAGE)):
    return _role_out(await set_role_permissions(session, current.principal, role_id, body.permissions, current.ip))


# ---- departments --------------------------------------------------------------------------------

def _dept_out(d, count: int) -> DepartmentOut:
    out = DepartmentOut.model_validate(d)
    out.member_count = count
    return out


@router.get("/departments", response_model=list[DepartmentOut])
async def list_departments(session: DB, current: CurrentUser = require(P.DEPARTMENTS_READ, P.DEPARTMENTS_MANAGE),
                           include_inactive: bool = False):
    svc = DepartmentService(session, current.principal, current.ip)
    return [_dept_out(d, n) for d, n in await svc.list(include_inactive)]


@router.post("/departments", response_model=DepartmentOut, status_code=201)
async def create_department(body: DepartmentCreate, session: DB,
                            current: CurrentUser = require(P.DEPARTMENTS_MANAGE)):
    svc = DepartmentService(session, current.principal, current.ip)
    d = await svc.create(body)
    return _dept_out(d, 0)


@router.patch("/departments/{dept_id}", response_model=DepartmentOut)
async def update_department(dept_id: uuid.UUID, body: DepartmentUpdate, session: DB,
                            current: CurrentUser = require(P.DEPARTMENTS_MANAGE)):
    svc = DepartmentService(session, current.principal, current.ip)
    d = await svc.update(dept_id, body)
    return _dept_out(d, await svc.member_count(d.id))


@router.delete("/departments/{dept_id}", response_model=DepartmentOut)
async def deactivate_department(dept_id: uuid.UUID, session: DB,
                                current: CurrentUser = require(P.DEPARTMENTS_MANAGE)):
    svc = DepartmentService(session, current.principal, current.ip)
    d = await svc.update(dept_id, DepartmentUpdate(is_active=False))
    return _dept_out(d, await svc.member_count(d.id))
