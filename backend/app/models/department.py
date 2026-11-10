import uuid
from typing import TYPE_CHECKING

from sqlalchemy import Boolean, ForeignKey, String, Text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base, Timestamps, UUIDPk

if TYPE_CHECKING:
    from app.models.user import User


class Department(UUIDPk, Timestamps, Base):
    __tablename__ = "departments"

    name: Mapped[str] = mapped_column(String(200))
    code: Mapped[str] = mapped_column(String(32), unique=True)
    description: Mapped[str | None] = mapped_column(Text)
    manager_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL", use_alter=True,
                                       name="fk_departments_manager_id_users")
    )
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)

    manager: Mapped["User | None"] = relationship(foreign_keys=[manager_id], lazy="raise")
