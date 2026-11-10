"""initial schema

Revision ID: 0001
Revises:
Create Date: 2026-11-10
"""
import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects.postgresql import JSONB, UUID

revision = "0001"
down_revision = None
branch_labels = None
depends_on = None


def _uuid_pk():
    return sa.Column("id", UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()"))


def _ts():
    return [sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
            sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now())]


def upgrade() -> None:
    # btree_gist lets the exclusion constraint combine "room_id =" with "time range &&".
    op.execute("CREATE EXTENSION IF NOT EXISTS btree_gist")

    op.create_table(
        "departments", _uuid_pk(),
        sa.Column("name", sa.String(200), nullable=False),
        sa.Column("code", sa.String(32), nullable=False, unique=True),
        sa.Column("description", sa.Text),
        sa.Column("manager_id", UUID(as_uuid=True)),
        sa.Column("is_active", sa.Boolean, nullable=False, server_default=sa.true()),
        *_ts(),
    )
    op.create_table(
        "users", _uuid_pk(),
        sa.Column("full_name", sa.String(200), nullable=False),
        sa.Column("email", sa.String(320), nullable=False),
        sa.Column("password_hash", sa.String(255)),
        sa.Column("department_id", UUID(as_uuid=True), sa.ForeignKey("departments.id", ondelete="SET NULL")),
        sa.Column("is_active", sa.Boolean, nullable=False, server_default=sa.true()),
        *_ts(),
    )
    op.create_index("ix_users_email", "users", ["email"], unique=True)
    op.create_index("ix_users_department_id", "users", ["department_id"])
    op.create_foreign_key("fk_departments_manager_id_users", "departments", "users", ["manager_id"], ["id"],
                          ondelete="SET NULL")

    op.create_table(
        "roles", _uuid_pk(),
        sa.Column("name", sa.String(64), nullable=False, unique=True),
        sa.Column("description", sa.String(255)),
    )
    op.create_table(
        "permissions", _uuid_pk(),
        sa.Column("code", sa.String(100), nullable=False, unique=True),
        sa.Column("description", sa.String(255)),
    )
    op.create_table(
        "user_roles", _uuid_pk(),
        sa.Column("user_id", UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("role_id", UUID(as_uuid=True), sa.ForeignKey("roles.id", ondelete="CASCADE"), nullable=False),
        sa.UniqueConstraint("user_id", "role_id", name="uq_user_roles_user_role"),
    )
    op.create_index("ix_user_roles_user_id", "user_roles", ["user_id"])
    op.create_table(
        "role_permissions", _uuid_pk(),
        sa.Column("role_id", UUID(as_uuid=True), sa.ForeignKey("roles.id", ondelete="CASCADE"), nullable=False),
        sa.Column("permission_id", UUID(as_uuid=True), sa.ForeignKey("permissions.id", ondelete="CASCADE"),
                  nullable=False),
        sa.UniqueConstraint("role_id", "permission_id", name="uq_role_permissions_role_perm"),
    )
    op.create_index("ix_role_permissions_role_id", "role_permissions", ["role_id"])

    op.create_table(
        "refresh_sessions", _uuid_pk(),
        sa.Column("user_id", UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("token_hash", sa.String(128), nullable=False, unique=True),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("revoked_at", sa.DateTime(timezone=True)),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("last_used_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("ip_address", sa.String(64)),
        sa.Column("user_agent", sa.Text),
    )
    op.create_index("ix_refresh_sessions_user_id", "refresh_sessions", ["user_id"])

    op.create_table(
        "meeting_rooms", _uuid_pk(),
        sa.Column("name", sa.String(200), nullable=False),
        sa.Column("code", sa.String(32), nullable=False, unique=True),
        sa.Column("display_slug", sa.String(64), nullable=False, unique=True),
        sa.Column("location", sa.String(200)),
        sa.Column("floor", sa.String(50)),
        sa.Column("capacity", sa.Integer, nullable=False),
        sa.Column("description", sa.Text),
        sa.Column("equipment", JSONB, nullable=False, server_default=sa.text("'[]'::jsonb")),
        sa.Column("operating_hours", JSONB),
        sa.Column("is_active", sa.Boolean, nullable=False, server_default=sa.true()),
        sa.Column("maintenance_mode", sa.Boolean, nullable=False, server_default=sa.false()),
        sa.Column("maintenance_message", sa.Text),
        *_ts(),
        sa.CheckConstraint("capacity > 0", name="ck_meeting_rooms_capacity_positive"),
    )

    op.create_table(
        "booking_series", _uuid_pk(),
        sa.Column("organizer_id", UUID(as_uuid=True), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("room_id", UUID(as_uuid=True), sa.ForeignKey("meeting_rooms.id"), nullable=False),
        sa.Column("recurrence_rule", sa.Text, nullable=False),
        sa.Column("series_start_date", sa.Date, nullable=False),
        sa.Column("series_end_date", sa.Date, nullable=False),
        *_ts(),
    )
    op.create_index("ix_booking_series_organizer_id", "booking_series", ["organizer_id"])

    op.create_table(
        "bookings", _uuid_pk(),
        sa.Column("room_id", UUID(as_uuid=True), sa.ForeignKey("meeting_rooms.id"), nullable=False),
        sa.Column("organizer_id", UUID(as_uuid=True), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("department_id", UUID(as_uuid=True), sa.ForeignKey("departments.id"), nullable=False),
        sa.Column("series_id", UUID(as_uuid=True), sa.ForeignKey("booking_series.id")),
        sa.Column("is_series_exception", sa.Boolean, nullable=False, server_default=sa.false()),
        sa.Column("title", sa.String(200), nullable=False),
        sa.Column("description", sa.Text),
        sa.Column("meeting_type", sa.String(32), nullable=False),
        sa.Column("start_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("end_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("attendee_count", sa.Integer, nullable=False),
        sa.Column("status", sa.String(32), nullable=False, server_default="confirmed"),
        sa.Column("notes", sa.Text),
        sa.Column("created_by_id", UUID(as_uuid=True), sa.ForeignKey("users.id")),
        sa.Column("cancelled_at", sa.DateTime(timezone=True)),
        sa.Column("cancellation_reason", sa.Text),
        *_ts(),
        sa.CheckConstraint("end_at > start_at", name="ck_bookings_time_order"),
        sa.CheckConstraint("attendee_count > 0", name="ck_bookings_attendees_positive"),
        sa.CheckConstraint("status IN ('confirmed','in_progress','completed','cancelled')",
                           name="ck_bookings_status"),
        sa.CheckConstraint(
            "meeting_type IN ('internal','external','management','interview','training','project','other')",
            name="ck_bookings_meeting_type"),
    )
    for col in ("room_id", "organizer_id", "department_id", "series_id", "start_at", "end_at", "status"):
        op.create_index(f"ix_bookings_{col}", "bookings", [col])
    op.create_index("ix_bookings_room_time", "bookings", ["room_id", "start_at", "end_at"])
    # THE double-booking guard. Half-open ranges so back-to-back meetings are allowed; cancelled
    # bookings never block. Concurrent inserts for the same slot: one wins, the other gets 23P01.
    op.execute("""
        ALTER TABLE bookings ADD CONSTRAINT bookings_no_overlap
        EXCLUDE USING gist (room_id WITH =, tstzrange(start_at, end_at, '[)') WITH &&)
        WHERE (status <> 'cancelled')
    """)

    op.create_table(
        "display_devices", _uuid_pk(),
        sa.Column("room_id", UUID(as_uuid=True), sa.ForeignKey("meeting_rooms.id"), nullable=False),
        sa.Column("device_name", sa.String(200), nullable=False),
        sa.Column("device_token_hash", sa.String(128), nullable=False),
        sa.Column("token_version", sa.Integer, nullable=False, server_default="1"),
        sa.Column("device_status", sa.String(16), nullable=False, server_default="unknown"),
        sa.Column("last_heartbeat_at", sa.DateTime(timezone=True)),
        sa.Column("last_connected_at", sa.DateTime(timezone=True)),
        sa.Column("browser_info", sa.Text),
        sa.Column("firmware_info", sa.Text),
        sa.Column("is_active", sa.Boolean, nullable=False, server_default=sa.true()),
        *_ts(),
    )
    op.create_index("ix_display_devices_room_id", "display_devices", ["room_id"])

    op.create_table(
        "display_settings", _uuid_pk(),
        sa.Column("room_id", UUID(as_uuid=True), sa.ForeignKey("meeting_rooms.id", ondelete="CASCADE"),
                  nullable=False, unique=True),
        sa.Column("display_mode", sa.String(32), nullable=False, server_default="full_schedule"),
        sa.Column("theme", sa.String(16), nullable=False, server_default="dark"),
        sa.Column("primary_color", sa.String(16), nullable=False, server_default="#00594F"),
        sa.Column("secondary_color", sa.String(16), nullable=False, server_default="#BB9D5A"),
        sa.Column("background_color", sa.String(16), nullable=False, server_default="#0B1F1C"),
        sa.Column("logo_url", sa.Text),
        sa.Column("show_clock", sa.Boolean, nullable=False, server_default=sa.true()),
        sa.Column("show_date", sa.Boolean, nullable=False, server_default=sa.true()),
        sa.Column("show_organizer", sa.Boolean, nullable=False, server_default=sa.true()),
        sa.Column("show_department", sa.Boolean, nullable=False, server_default=sa.true()),
        sa.Column("show_announcements", sa.Boolean, nullable=False, server_default=sa.true()),
        sa.Column("show_qr_code", sa.Boolean, nullable=False, server_default=sa.false()),
        sa.Column("qr_code_url", sa.Text),
        sa.Column("upcoming_meetings_limit", sa.Integer, nullable=False, server_default="5"),
        sa.Column("refresh_interval_seconds", sa.Integer, nullable=False, server_default="60"),
        sa.Column("idle_behavior", sa.String(32), nullable=False, server_default="show_availability"),
        sa.Column("language", sa.String(8), nullable=False, server_default="en"),
        sa.Column("announcement_text", sa.Text),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
    )

    op.create_table(
        "announcements", _uuid_pk(),
        sa.Column("title", sa.String(200), nullable=False),
        sa.Column("message", sa.Text, nullable=False),
        sa.Column("priority", sa.String(16), nullable=False, server_default="normal"),
        sa.Column("start_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("end_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("is_active", sa.Boolean, nullable=False, server_default=sa.true()),
        sa.Column("created_by", UUID(as_uuid=True), sa.ForeignKey("users.id")),
        *_ts(),
        sa.CheckConstraint("end_at > start_at", name="ck_announcements_time_order"),
    )
    op.create_index("ix_announcements_start_at", "announcements", ["start_at"])
    op.create_index("ix_announcements_end_at", "announcements", ["end_at"])
    op.create_table(
        "announcement_rooms", _uuid_pk(),
        sa.Column("announcement_id", UUID(as_uuid=True), sa.ForeignKey("announcements.id", ondelete="CASCADE"),
                  nullable=False),
        sa.Column("room_id", UUID(as_uuid=True), sa.ForeignKey("meeting_rooms.id", ondelete="CASCADE"),
                  nullable=False),
        sa.UniqueConstraint("announcement_id", "room_id", name="uq_announcement_rooms_pair"),
    )
    op.create_index("ix_announcement_rooms_announcement_id", "announcement_rooms", ["announcement_id"])
    op.create_index("ix_announcement_rooms_room_id", "announcement_rooms", ["room_id"])

    op.create_table(
        "audit_logs", _uuid_pk(),
        sa.Column("actor_user_id", UUID(as_uuid=True), sa.ForeignKey("users.id")),
        sa.Column("actor_device_id", UUID(as_uuid=True), sa.ForeignKey("display_devices.id")),
        sa.Column("action", sa.String(100), nullable=False),
        sa.Column("entity_type", sa.String(64), nullable=False),
        sa.Column("entity_id", UUID(as_uuid=True)),
        sa.Column("old_values", JSONB),
        sa.Column("new_values", JSONB),
        sa.Column("ip_address", sa.String(64)),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
    )
    for col in ("actor_user_id", "action", "entity_type", "entity_id", "created_at"):
        op.create_index(f"ix_audit_logs_{col}", "audit_logs", [col])
    # Append-only audit trail. Retention purges must be run by a DBA with the trigger disabled.
    op.execute("""
        CREATE FUNCTION audit_logs_immutable() RETURNS trigger LANGUAGE plpgsql AS $$
        BEGIN RAISE EXCEPTION 'audit_logs is append-only'; END $$;
    """)
    op.execute("""
        CREATE TRIGGER audit_logs_no_update_delete BEFORE UPDATE OR DELETE ON audit_logs
        FOR EACH ROW EXECUTE FUNCTION audit_logs_immutable();
    """)

    op.create_table(
        "system_settings", _uuid_pk(),
        sa.Column("key", sa.String(100), nullable=False, unique=True),
        sa.Column("value", JSONB),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
    )

    op.create_table(
        "outbox_events", _uuid_pk(),
        sa.Column("event_type", sa.String(64), nullable=False),
        sa.Column("aggregate_type", sa.String(64), nullable=False),
        sa.Column("aggregate_id", UUID(as_uuid=True)),
        sa.Column("payload", JSONB, nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("published_at", sa.DateTime(timezone=True)),
        sa.Column("retry_count", sa.Integer, nullable=False, server_default="0"),
        sa.Column("last_error", sa.Text),
    )
    op.create_index("ix_outbox_events_created_at", "outbox_events", ["created_at"])
    op.create_index("ix_outbox_events_unpublished", "outbox_events", ["created_at"],
                    postgresql_where=sa.text("published_at IS NULL"))
    op.create_index("ix_outbox_events_published_at", "outbox_events", ["published_at"])


def downgrade() -> None:
    op.execute("DROP TRIGGER IF EXISTS audit_logs_no_update_delete ON audit_logs")
    op.execute("DROP FUNCTION IF EXISTS audit_logs_immutable()")
    for t in ("outbox_events", "system_settings", "audit_logs", "announcement_rooms", "announcements",
              "display_settings", "display_devices", "bookings", "booking_series", "meeting_rooms",
              "refresh_sessions", "role_permissions", "user_roles", "permissions", "roles"):
        op.drop_table(t)
    op.drop_constraint("fk_departments_manager_id_users", "departments", type_="foreignkey")
    op.drop_table("users")
    op.drop_table("departments")
