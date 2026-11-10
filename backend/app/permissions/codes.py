"""Permission catalogue and built-in role defaults.

Permissions are data (permissions / role_permissions tables); this module is the source used by
the seed script to create them. Code must check permissions, never role names.
"""


class P:
    USERS_READ = "users.read"
    USERS_LOOKUP = "users.lookup"
    USERS_MANAGE = "users.manage"
    ROLES_MANAGE = "roles.manage"
    DEPARTMENTS_READ = "departments.read"
    DEPARTMENTS_MANAGE = "departments.manage"
    ROOMS_READ = "rooms.read"
    ROOMS_MANAGE = "rooms.manage"
    BOOKINGS_CREATE = "bookings.create"
    BOOKINGS_READ_ALL = "bookings.read_all"
    BOOKINGS_MANAGE_ALL = "bookings.manage_all"
    BOOKINGS_MANAGE_DEPARTMENT = "bookings.manage_department"
    BOOKINGS_MANAGE_OWN = "bookings.manage_own"
    BOOKINGS_OVERRIDE_CAPACITY = "bookings.override_capacity"
    DISPLAYS_MANAGE = "displays.manage"
    ANNOUNCEMENTS_MANAGE = "announcements.manage"
    ANALYTICS_VIEW = "analytics.view"
    ANALYTICS_VIEW_DEPARTMENT = "analytics.view_department"
    AUDIT_VIEW = "audit.view"
    SETTINGS_MANAGE = "settings.manage"


PERMISSION_DESCRIPTIONS: dict[str, str] = {
    P.USERS_READ: "View employees",
    P.USERS_LOOKUP: "Search active employees (e.g. to pick a meeting organizer)",
    P.USERS_MANAGE: "Create, edit and deactivate employees",
    P.ROLES_MANAGE: "Assign roles and edit role permissions",
    P.DEPARTMENTS_READ: "View departments",
    P.DEPARTMENTS_MANAGE: "Create, edit and deactivate departments",
    P.ROOMS_READ: "View rooms and availability",
    P.ROOMS_MANAGE: "Create and edit rooms, maintenance mode",
    P.BOOKINGS_CREATE: "Create reservations",
    P.BOOKINGS_READ_ALL: "View full details of all reservations",
    P.BOOKINGS_MANAGE_ALL: "Edit/cancel any reservation and book on behalf of anyone",
    P.BOOKINGS_MANAGE_DEPARTMENT: "Edit/cancel reservations of own department",
    P.BOOKINGS_MANAGE_OWN: "Edit/cancel own reservations",
    P.BOOKINGS_OVERRIDE_CAPACITY: "Book above room capacity",
    P.DISPLAYS_MANAGE: "Register and configure TV displays",
    P.ANNOUNCEMENTS_MANAGE: "Manage TV announcements",
    P.ANALYTICS_VIEW: "View analytics and export reports for all departments",
    P.ANALYTICS_VIEW_DEPARTMENT: "View analytics and reports for own department",
    P.AUDIT_VIEW: "View audit and system logs",
    P.SETTINGS_MANAGE: "Manage system settings",
}

ALL_PERMISSIONS = list(PERMISSION_DESCRIPTIONS)

SUPER_ADMIN = "super_admin"

ROLE_DEFAULTS: dict[str, tuple[str, list[str]]] = {
    SUPER_ADMIN: ("Full access to the application", ALL_PERMISSIONS),
    "it_admin": (
        "Rooms, TV displays, technical settings and logs",
        [P.ROOMS_READ, P.ROOMS_MANAGE, P.DISPLAYS_MANAGE, P.ANNOUNCEMENTS_MANAGE, P.SETTINGS_MANAGE,
         P.AUDIT_VIEW, P.BOOKINGS_READ_ALL, P.BOOKINGS_CREATE, P.BOOKINGS_MANAGE_OWN, P.USERS_READ,
         P.USERS_LOOKUP, P.DEPARTMENTS_READ],
    ),
    "receptionist": (
        "Create, edit and cancel any reservation",
        [P.ROOMS_READ, P.BOOKINGS_CREATE, P.BOOKINGS_READ_ALL, P.BOOKINGS_MANAGE_ALL,
         P.BOOKINGS_MANAGE_OWN, P.USERS_READ, P.USERS_LOOKUP, P.DEPARTMENTS_READ],
    ),
    "department_manager": (
        "Manage own department's reservations and view department reports",
        [P.ROOMS_READ, P.BOOKINGS_CREATE, P.BOOKINGS_MANAGE_DEPARTMENT, P.BOOKINGS_MANAGE_OWN,
         P.ANALYTICS_VIEW_DEPARTMENT, P.USERS_LOOKUP, P.DEPARTMENTS_READ],
    ),
    "employee": (
        "View availability and manage own reservations",
        [P.ROOMS_READ, P.BOOKINGS_CREATE, P.BOOKINGS_MANAGE_OWN, P.DEPARTMENTS_READ],
    ),
}
