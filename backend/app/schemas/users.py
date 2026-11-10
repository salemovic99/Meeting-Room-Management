import uuid
from datetime import datetime

from pydantic import BaseModel, EmailStr, Field, field_validator

from app.schemas.common import ORMModel, Ref, UserRef

PASSWORD_MIN = 10


class UserOut(ORMModel):
    id: uuid.UUID
    full_name: str
    email: str
    department_id: uuid.UUID | None
    department: Ref | None
    is_active: bool
    roles: list[str]
    created_at: datetime
    updated_at: datetime

    @field_validator("roles", mode="before")
    @classmethod
    def validate_role_names(cls, v):
        return [r if isinstance(r, str) else r.name for r in v]


class Me(UserOut):
    permissions: list[str]


class UserLookup(ORMModel):
    id: uuid.UUID
    full_name: str
    email: str
    department_id: uuid.UUID | None


class UserCreate(BaseModel):
    full_name: str = Field(min_length=1, max_length=200)
    email: EmailStr
    password: str = Field(min_length=PASSWORD_MIN, max_length=256)
    department_id: uuid.UUID | None = None
    roles: list[str] = Field(default_factory=lambda: ["employee"])
    is_active: bool = True


class UserUpdate(BaseModel):
    full_name: str | None = Field(default=None, min_length=1, max_length=200)
    email: EmailStr | None = None
    password: str | None = Field(default=None, min_length=PASSWORD_MIN, max_length=256)
    department_id: uuid.UUID | None = None
    roles: list[str] | None = None
    is_active: bool | None = None


class UserDeactivated(BaseModel):
    user: UserOut
    future_bookings_count: int


class LoginIn(BaseModel):
    email: EmailStr
    password: str = Field(min_length=1, max_length=256)


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    expires_in: int
    user: Me


class ChangePasswordIn(BaseModel):
    current_password: str
    new_password: str = Field(min_length=PASSWORD_MIN, max_length=256)


class RoleOut(BaseModel):
    id: uuid.UUID
    name: str
    description: str | None
    permissions: list[str]


class PermissionOut(ORMModel):
    id: uuid.UUID
    code: str
    description: str | None


class RolePermissionsIn(BaseModel):
    permissions: list[str]


class DepartmentOut(ORMModel):
    id: uuid.UUID
    name: str
    code: str
    description: str | None
    manager_id: uuid.UUID | None
    manager: UserRef | None
    is_active: bool
    member_count: int = 0
    created_at: datetime
    updated_at: datetime


class DepartmentCreate(BaseModel):
    name: str = Field(min_length=1, max_length=200)
    code: str = Field(min_length=1, max_length=32, pattern=r"^[A-Za-z0-9_-]+$")
    description: str | None = None
    manager_id: uuid.UUID | None = None


class DepartmentUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=200)
    code: str | None = Field(default=None, min_length=1, max_length=32, pattern=r"^[A-Za-z0-9_-]+$")
    description: str | None = None
    manager_id: uuid.UUID | None = None
    is_active: bool | None = None
