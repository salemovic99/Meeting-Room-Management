"""booking source (dashboard / qr) for QR walk-up booking and future integration origin tracking

Revision ID: 0002
Revises: 0001
Create Date: 2026-11-10
"""
import sqlalchemy as sa
from alembic import op

revision = "0002"
down_revision = "0001"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("bookings", sa.Column("source", sa.String(16), nullable=False, server_default="dashboard"))
    op.create_check_constraint("ck_bookings_source", "bookings", "source IN ('dashboard','qr')")


def downgrade() -> None:
    op.drop_constraint("ck_bookings_source", "bookings", type_="check")
    op.drop_column("bookings", "source")
