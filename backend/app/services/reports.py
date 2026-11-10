import csv
import io
from collections.abc import Callable

from openpyxl import Workbook
from openpyxl.styles import Font

from app.core.timeutils import to_local
from app.services.analytics import AnalyticsService, Scope
from app.services.schedule_rules import effective_status
from app.core.timeutils import now_utc

REPORTS = ("bookings", "room-utilization", "department-utilization", "organizer-activity", "cancellations")


def _fmt(dt) -> str:
    return to_local(dt).strftime("%Y-%m-%d %H:%M")


async def build(report: str, svc: AnalyticsService, sc: Scope) -> tuple[list[str], list[list]]:
    if report == "bookings":
        now = now_utc()
        rows = [[b.title, b.room.name, b.organizer.full_name, b.department.name, b.meeting_type,
                 _fmt(b.start_at), _fmt(b.end_at), round((b.end_at - b.start_at).total_seconds() / 3600, 2),
                 b.attendee_count, effective_status(b.status, b.start_at, b.end_at, now),
                 b.source, b.cancellation_reason or ""]
                for b in await svc.bookings_rows(sc)]
        return (["Title", "Room", "Organizer", "Department", "Type", "Start", "End", "Hours", "Attendees",
                 "Status", "Source", "Cancellation reason"], rows)
    if report == "room-utilization":
        data = await svc.utilization(sc)
        return (["Room", "Bookings", "Booked hours", "Operating hours", "Utilization %"],
                [[r["room_name"], r["booking_count"], r["booked_hours"], r["available_hours"],
                  r["utilization_pct"]] for r in data["rooms"]])
    if report == "department-utilization":
        data = await svc.departments(sc)
        return (["Department", "Bookings", "Booked hours", "Share %"],
                [[d["name"], d["booking_count"], d["booked_hours"], d["share_pct"]] for d in data["departments"]])
    if report == "organizer-activity":
        rows = await svc.organizer_activity(sc)
        return (["Organizer", "Email", "Department", "Bookings", "Cancelled", "Booked hours"],
                [[r["organizer"], r["email"], r["department"], r["bookings"], r["cancelled"], r["booked_hours"]]
                 for r in rows])
    if report == "cancellations":
        data = await svc.cancellations(sc)
        rows = [["Room", r["room_name"], r["cancelled"]] for r in data["by_room"]]
        rows += [["Department", d["name"], d["cancelled"]] for d in data["by_department"]]
        rows.append(["Total", f"{data['cancelled']} of {data['total_bookings']}",
                     f"{data['cancellation_rate_pct']}%"])
        return ["Group", "Name", "Cancelled"], rows
    raise ValueError(report)


def _safe_cell(v):
    # Neutralise spreadsheet formula injection in user-provided text.
    if isinstance(v, str) and v[:1] in ("=", "+", "-", "@"):
        return "'" + v
    return v


def to_csv(title: str, period: dict, header: list[str], rows: list[list]) -> bytes:
    buf = io.StringIO()
    w = csv.writer(buf)
    w.writerow([title, f"Period: {period['from']} to {period['to']}"])
    w.writerow(header)
    for r in rows:
        w.writerow([_safe_cell(v) for v in r])
    return ("﻿" + buf.getvalue()).encode("utf-8")  # BOM so Excel detects UTF-8 (Arabic names)


def to_xlsx(title: str, period: dict, header: list[str], rows: list[list]) -> bytes:
    wb = Workbook()
    ws = wb.active
    ws.title = title[:31]
    ws.append([title, f"Period: {period['from']} to {period['to']}"])
    ws.append(header)
    for c in ws[2]:
        c.font = Font(bold=True)
    for r in rows:
        ws.append([_safe_cell(v) for v in r])
    for col in ws.columns:
        width = max(len(str(c.value or "")) for c in col)
        ws.column_dimensions[col[0].column_letter].width = min(60, max(10, width + 2))
    out = io.BytesIO()
    wb.save(out)
    return out.getvalue()


FORMATS: dict[str, tuple[Callable, str, str]] = {
    "csv": (to_csv, "text/csv; charset=utf-8", "csv"),
    "xlsx": (to_xlsx, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "xlsx"),
}
