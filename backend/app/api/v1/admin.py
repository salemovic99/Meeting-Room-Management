"""Announcements, analytics, reports, audit logs, system settings, health."""
import uuid
from datetime import date, datetime
from typing import Any, Literal

from fastapi import APIRouter, Body, Depends, Query, Response, status
from sqlalchemy import func, select, text

from app.api.deps import DB, CurrentUser, require
from app.core.timeutils import ensure_aware_utc, now_utc
from app.models import AuditLog
from app.permissions.codes import P
from app.repositories.rooms import RoomRepository
from app.schemas.admin import AuditLogOut, Overview
from app.schemas.common import Page, PageParams
from app.schemas.display import AnnouncementCreate, AnnouncementOut, AnnouncementUpdate
from app.services import audit, outbox, reports, system_settings
from app.services.analytics import AnalyticsService, resolve_scope, today_summary
from app.services.announcements import AnnouncementService, announcement_out
from app.services.rooms import availability_for
from app.services.serializers import booking_out

router = APIRouter()

# ---- Announcements ------------------------------------------------------------------------------

ann = APIRouter(prefix="/announcements", tags=["announcements"])


@ann.get("", response_model=list[AnnouncementOut])
async def list_announcements(session: DB, current: CurrentUser = require(P.ANNOUNCEMENTS_MANAGE),
                             state: Literal["scheduled", "active", "expired", "inactive"] | None = None):
    svc = AnnouncementService(session, current.principal, current.ip)
    return [announcement_out(a) for a in await svc.list(state)]


@ann.post("", response_model=AnnouncementOut, status_code=201)
async def create_announcement(body: AnnouncementCreate, session: DB,
                              current: CurrentUser = require(P.ANNOUNCEMENTS_MANAGE)):
    return announcement_out(await AnnouncementService(session, current.principal, current.ip).create(body))


@ann.patch("/{ann_id}", response_model=AnnouncementOut)
async def update_announcement(ann_id: uuid.UUID, body: AnnouncementUpdate, session: DB,
                              current: CurrentUser = require(P.ANNOUNCEMENTS_MANAGE)):
    return announcement_out(await AnnouncementService(session, current.principal, current.ip).update(ann_id, body))


@ann.delete("/{ann_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_announcement(ann_id: uuid.UUID, session: DB, current: CurrentUser = require(P.ANNOUNCEMENTS_MANAGE)):
    await AnnouncementService(session, current.principal, current.ip).delete(ann_id)


# ---- Analytics ----------------------------------------------------------------------------------

an = APIRouter(prefix="/analytics", tags=["analytics"])
ANALYTICS = (P.ANALYTICS_VIEW, P.ANALYTICS_VIEW_DEPARTMENT)


@an.get("/overview", response_model=Overview)
async def overview(session: DB, current: CurrentUser = require(P.ROOMS_READ)):
    rooms = await RoomRepository(session).list()
    avail = await availability_for(session, rooms, current.principal)
    summary = await today_summary(session)
    recent: list[AuditLogOut] = []
    if current.principal.has(P.AUDIT_VIEW):
        rows = (await session.execute(select(AuditLog).order_by(AuditLog.created_at.desc()).limit(10))).scalars()
        recent = [AuditLogOut.model_validate(r) for r in rows]
    now = now_utc()
    return Overview(
        total_rooms=len(rooms), available_rooms=sum(a.status in ("available", "upcoming") for a in avail),
        occupied_rooms=sum(a.status == "occupied" for a in avail), upcoming_meetings=summary["upcoming_meetings"],
        todays_bookings=summary["todays_bookings"], cancelled_today=summary["cancelled_today"],
        booked_hours_today=summary["booked_hours_today"], utilization_today_pct=summary["utilization_today_pct"],
        rooms=avail, todays_schedule=[booking_out(b, current.principal, now) for b in summary["bookings"]],
        recent_activity=recent)


def _period(from_: date | None = Query(None, alias="from"), to: date | None = None):
    return from_, to


@an.get("/utilization")
async def utilization(session: DB, period=Depends(_period), current: CurrentUser = require(*ANALYTICS)):
    sc = resolve_scope(current.principal, *period)
    return await AnalyticsService(session, current.principal).utilization(sc)


@an.get("/departments")
async def departments(session: DB, period=Depends(_period), current: CurrentUser = require(*ANALYTICS)):
    sc = resolve_scope(current.principal, *period)
    return await AnalyticsService(session, current.principal).departments(sc)


@an.get("/cancellations")
async def cancellations(session: DB, period=Depends(_period), current: CurrentUser = require(*ANALYTICS)):
    sc = resolve_scope(current.principal, *period)
    return await AnalyticsService(session, current.principal).cancellations(sc)


@an.get("/peak-hours")
async def peak_hours(session: DB, period=Depends(_period), current: CurrentUser = require(*ANALYTICS)):
    sc = resolve_scope(current.principal, *period)
    return await AnalyticsService(session, current.principal).peak_hours(sc)


rep = APIRouter(prefix="/reports", tags=["reports"])


@rep.get("/{report}")
async def export_report(report: Literal["bookings", "room-utilization", "department-utilization",
                                        "organizer-activity", "cancellations"],
                        session: DB, period=Depends(_period), format: Literal["csv", "xlsx"] = "csv",
                        current: CurrentUser = require(*ANALYTICS)):
    sc = resolve_scope(current.principal, *period)
    header, rows = await reports.build(report, AnalyticsService(session, current.principal), sc)
    writer, media_type, ext = reports.FORMATS[format]
    title = report.replace("-", " ").title()
    body = writer(title, sc.period, header, rows)
    filename = f"{report}_{sc.period['from']}_{sc.period['to']}.{ext}"
    audit.record(session, action="report.exported", entity_type="report", actor_user_id=current.user.id,
                 ip_address=current.ip, new_values={"report": report, "format": format, **sc.period})
    await session.commit()
    return Response(body, media_type=media_type,
                    headers={"Content-Disposition": f'attachment; filename="{filename}"'})


# ---- Audit logs ---------------------------------------------------------------------------------

aud = APIRouter(prefix="/audit-logs", tags=["audit"])


@aud.get("", response_model=Page[AuditLogOut])
async def list_audit_logs(session: DB, current: CurrentUser = require(P.AUDIT_VIEW), page: PageParams = Depends(),
                          action: str | None = None, entity_type: str | None = None,
                          entity_id: uuid.UUID | None = None, actor_user_id: uuid.UUID | None = None,
                          from_: str | None = Query(None, alias="from"), to: str | None = None):
    stmt = select(AuditLog)
    if action:
        stmt = stmt.where(AuditLog.action.ilike(f"{action}%"))
    if entity_type:
        stmt = stmt.where(AuditLog.entity_type == entity_type)
    if entity_id:
        stmt = stmt.where(AuditLog.entity_id == entity_id)
    if actor_user_id:
        stmt = stmt.where(AuditLog.actor_user_id == actor_user_id)
    if from_:
        stmt = stmt.where(AuditLog.created_at >= ensure_aware_utc(datetime.fromisoformat(from_)))
    if to:
        stmt = stmt.where(AuditLog.created_at < ensure_aware_utc(datetime.fromisoformat(to)))
    total = (await session.execute(select(func.count()).select_from(stmt.subquery()))).scalar_one()
    rows = (await session.execute(stmt.order_by(AuditLog.created_at.desc()).offset(page.offset)
                                  .limit(page.page_size))).scalars()
    return Page(items=[AuditLogOut.model_validate(r) for r in rows], total=total, page=page.page,
                page_size=page.page_size)


# ---- System settings ----------------------------------------------------------------------------

st = APIRouter(prefix="/settings", tags=["settings"])


@st.get("")
async def get_settings(session: DB, current: CurrentUser = require(P.SETTINGS_MANAGE)) -> dict[str, Any]:
    return await system_settings.get_all(session)


@st.patch("")
async def patch_settings(session: DB, body: dict[str, Any] = Body(...),
                         current: CurrentUser = require(P.SETTINGS_MANAGE)) -> dict[str, Any]:
    old, new = await system_settings.update(session, body)
    if new:
        audit.record(session, action="settings.updated", entity_type="system_settings",
                     actor_user_id=current.user.id, old_values=old, new_values=new, ip_address=current.ip)
        if any(k.startswith("company.") or k.startswith("availability.") for k in new):
            outbox.enqueue(session, "display.settings_updated", "system_settings", None, all_rooms=True)
    await outbox.commit(session)
    return await system_settings.get_all(session)


# ---- Health -------------------------------------------------------------------------------------

health = APIRouter(prefix="/health", tags=["health"])


@health.get("")
async def liveness():
    return {"status": "ok"}


@health.get("/ready")
async def readiness(session: DB):
    try:
        await session.execute(text("SELECT 1"))
    except Exception:  # noqa: BLE001
        return Response('{"status":"error","database":"unreachable"}', status_code=503,
                        media_type="application/json")
    return {"status": "ok", "database": "ok"}


for r in (ann, an, rep, aud, st, health):
    router.include_router(r)

