"""Authorization decisions. Pure functions over a Principal so they're unit-testable."""
import uuid
from dataclasses import dataclass, field
from typing import Protocol

from app.permissions.codes import SUPER_ADMIN, P


@dataclass(frozen=True)
class Principal:
    user_id: uuid.UUID
    department_id: uuid.UUID | None
    permissions: frozenset[str]
    role_names: frozenset[str] = field(default_factory=frozenset)
    session_id: uuid.UUID | None = None

    def has(self, *codes: str) -> bool:
        """True if the principal holds ANY of the given permissions."""
        return any(c in self.permissions for c in codes)

    @property
    def is_super_admin(self) -> bool:
        return SUPER_ADMIN in self.role_names


class BookingLike(Protocol):
    organizer_id: uuid.UUID
    created_by_id: uuid.UUID | None
    department_id: uuid.UUID


def is_own_booking(p: Principal, b: BookingLike) -> bool:
    return b.organizer_id == p.user_id or b.created_by_id == p.user_id


def in_department(p: Principal, b: BookingLike) -> bool:
    return p.department_id is not None and b.department_id == p.department_id


def can_view_booking_details(p: Principal, b: BookingLike) -> bool:
    if p.has(P.BOOKINGS_READ_ALL, P.BOOKINGS_MANAGE_ALL):
        return True
    if is_own_booking(p, b):
        return True
    return p.has(P.BOOKINGS_MANAGE_DEPARTMENT) and in_department(p, b)


def can_manage_booking(p: Principal, b: BookingLike) -> bool:
    if p.has(P.BOOKINGS_MANAGE_ALL):
        return True
    if p.has(P.BOOKINGS_MANAGE_DEPARTMENT) and in_department(p, b):
        return True
    return p.has(P.BOOKINGS_MANAGE_OWN) and is_own_booking(p, b)


def can_book_for(p: Principal, organizer_id: uuid.UUID, organizer_department_id: uuid.UUID | None) -> bool:
    """May `p` create/assign a booking whose organizer is `organizer_id`?"""
    if organizer_id == p.user_id:
        return True
    if p.has(P.BOOKINGS_MANAGE_ALL):
        return True
    return (p.has(P.BOOKINGS_MANAGE_DEPARTMENT) and p.department_id is not None
            and organizer_department_id == p.department_id)


def can_grant_roles(p: Principal, role_names: set[str]) -> bool:
    """Prevent privilege escalation: only super admins can grant super_admin."""
    if not p.has(P.ROLES_MANAGE):
        return False
    return SUPER_ADMIN not in role_names or p.is_super_admin
