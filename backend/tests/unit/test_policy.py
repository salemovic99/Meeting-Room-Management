import uuid
from dataclasses import dataclass

from app.permissions.codes import ROLE_DEFAULTS, SUPER_ADMIN, P
from app.permissions.policy import Principal, can_book_for, can_grant_roles, can_manage_booking, can_view_booking_details

DEPT_A, DEPT_B = uuid.uuid4(), uuid.uuid4()


def principal(role: str, dept=DEPT_A) -> Principal:
    return Principal(user_id=uuid.uuid4(), department_id=dept, permissions=frozenset(ROLE_DEFAULTS[role][1]),
                     role_names=frozenset({role}))


@dataclass
class B:
    organizer_id: uuid.UUID
    created_by_id: uuid.UUID | None
    department_id: uuid.UUID


def test_employee_manages_only_own():
    emp = principal("employee")
    own = B(emp.user_id, emp.user_id, DEPT_A)
    other = B(uuid.uuid4(), None, DEPT_A)
    assert can_manage_booking(emp, own)
    assert not can_manage_booking(emp, other)
    assert not can_view_booking_details(emp, other)


def test_department_manager_scope():
    mgr = principal("department_manager")
    assert can_manage_booking(mgr, B(uuid.uuid4(), None, DEPT_A))
    assert not can_manage_booking(mgr, B(uuid.uuid4(), None, DEPT_B))
    assert can_book_for(mgr, uuid.uuid4(), DEPT_A)
    assert not can_book_for(mgr, uuid.uuid4(), DEPT_B)


def test_receptionist_manages_everything():
    rec = principal("receptionist")
    assert can_manage_booking(rec, B(uuid.uuid4(), None, DEPT_B))
    assert can_book_for(rec, uuid.uuid4(), DEPT_B)


def test_only_super_admin_grants_super_admin():
    admin = principal(SUPER_ADMIN)
    limited = Principal(user_id=uuid.uuid4(), department_id=None, permissions=frozenset({P.ROLES_MANAGE}))
    assert can_grant_roles(admin, {SUPER_ADMIN})
    assert not can_grant_roles(limited, {SUPER_ADMIN})
    assert can_grant_roles(limited, {"employee"})
    assert not can_grant_roles(principal("employee"), {"employee"})


def test_super_admin_has_all_permissions():
    from app.permissions.codes import ALL_PERMISSIONS
    assert set(ROLE_DEFAULTS[SUPER_ADMIN][1]) == set(ALL_PERMISSIONS)
