import uuid

from fastapi import APIRouter, Depends, Query
from pydantic import AwareDatetime

from app.api.deps import DB, CurrentUser, require
from app.core.errors import NotFound, ValidationFailed
from app.core.timeutils import ensure_aware_utc, now_utc
from app.permissions.codes import P
from app.repositories.bookings import BookingFilters, BookingRepository
from app.schemas.bookings import (
    BookingCreate,
    BookingOut,
    BookingUpdate,
    CalendarOut,
    CancelIn,
    ConflictCheck,
    RecurringBookingCreate,
    RecurringResult,
    SeriesCancelled,
    SeriesDetail,
    SeriesOut,
    SeriesUpdate,
)
from app.schemas.common import Page, PageParams
from app.services.bookings import BookingService
from app.services.serializers import booking_out, conflict_item

router = APIRouter(prefix="/bookings", tags=["bookings"])

# Anyone who can see rooms can see the calendar; details are redacted per booking.
VIEW = (P.ROOMS_READ, P.BOOKINGS_CREATE, P.BOOKINGS_READ_ALL)


def _svc(session, current: CurrentUser) -> BookingService:
    return BookingService(session, current.principal, current.ip)


@router.get("", response_model=Page[BookingOut])
async def list_bookings(session: DB, current: CurrentUser = require(*VIEW), page: PageParams = Depends(),
                        room_id: uuid.UUID | None = None, department_id: uuid.UUID | None = None,
                        organizer_id: uuid.UUID | None = None, status: str | None = None,
                        from_: AwareDatetime | None = Query(None, alias="from"), to: AwareDatetime | None = None,
                        q: str | None = None, mine: bool = False):
    p = current.principal
    # Users without read_all only list their own (or their department's, for managers) bookings;
    # everyone can still see busy slots via /bookings/calendar.
    if not p.has(P.BOOKINGS_READ_ALL, P.BOOKINGS_MANAGE_ALL):
        if p.has(P.BOOKINGS_MANAGE_DEPARTMENT) and not mine:
            department_id = p.department_id
        else:
            mine = True
    f = BookingFilters(room_id=room_id, department_id=department_id, organizer_id=organizer_id, status=status,
                       start=from_, end=to, q=q, mine_user_id=p.user_id if mine else None)
    items, total = await BookingRepository(session).search(f, page.offset, page.page_size)
    now = now_utc()
    return Page(items=[booking_out(b, p, now) for b in items], total=total, page=page.page,
                page_size=page.page_size)


@router.post("", response_model=BookingOut, status_code=201)
async def create_booking(body: BookingCreate, session: DB, current: CurrentUser = require(P.BOOKINGS_CREATE)):
    b = await _svc(session, current).create(body)
    return booking_out(b, current.principal, now_utc())


@router.get("/calendar", response_model=CalendarOut)
async def calendar(session: DB, current: CurrentUser = require(*VIEW),
                   from_: AwareDatetime = Query(alias="from"), to: AwareDatetime = Query(),
                   room_id: uuid.UUID | None = None, department_id: uuid.UUID | None = None,
                   include_cancelled: bool = False):
    if (to - from_).days > 62:
        raise ValidationFailed("Calendar range cannot exceed 62 days")
    items = await BookingRepository(session).calendar(ensure_aware_utc(from_), ensure_aware_utc(to), room_id,
                                                      department_id, include_cancelled)
    now = now_utc()
    return CalendarOut(items=[booking_out(b, current.principal, now) for b in items])


@router.get("/conflicts", response_model=ConflictCheck)
async def check_conflicts(session: DB, room_id: uuid.UUID, start_at: AwareDatetime, end_at: AwareDatetime,
                          exclude_booking_id: uuid.UUID | None = None,
                          current: CurrentUser = require(P.BOOKINGS_CREATE)):
    if start_at >= end_at:
        raise ValidationFailed("start_at must be earlier than end_at")
    clashes = await _svc(session, current).conflicts(room_id, start_at, end_at, exclude_booking_id)
    return ConflictCheck(has_conflict=bool(clashes), conflicts=[conflict_item(b, current.principal) for b in clashes])


@router.post("/recurring", response_model=RecurringResult, status_code=201)
async def create_recurring(body: RecurringBookingCreate, session: DB,
                           current: CurrentUser = require(P.BOOKINGS_CREATE)):
    series, created, skipped = await _svc(session, current).create_recurring(body)
    now = now_utc()
    return RecurringResult(series=SeriesOut.model_validate(series),
                           created=[booking_out(b, current.principal, now) for b in created], skipped=skipped)


@router.get("/series/{series_id}", response_model=SeriesDetail)
async def get_series(series_id: uuid.UUID, session: DB, current: CurrentUser = require(*VIEW)):
    repo = BookingRepository(session)
    series = await repo.get_series(series_id)
    if series is None:
        raise NotFound("Series not found")
    now = now_utc()
    occ = await repo.series_occurrences(series_id)
    return SeriesDetail(series=SeriesOut.model_validate(series),
                        occurrences=[booking_out(b, current.principal, now) for b in occ])


@router.patch("/series/{series_id}", response_model=SeriesDetail)
async def update_series(series_id: uuid.UUID, body: SeriesUpdate, session: DB,
                        current: CurrentUser = require(P.BOOKINGS_CREATE)):
    series = await _svc(session, current).update_series(series_id, body)
    now = now_utc()
    occ = await BookingRepository(session).series_occurrences(series_id)
    return SeriesDetail(series=SeriesOut.model_validate(series),
                        occurrences=[booking_out(b, current.principal, now) for b in occ])


@router.post("/series/{series_id}/cancel", response_model=SeriesCancelled)
async def cancel_series(series_id: uuid.UUID, body: CancelIn, session: DB,
                        current: CurrentUser = require(P.BOOKINGS_CREATE)):
    series, n = await _svc(session, current).cancel_series(series_id, body.reason)
    return SeriesCancelled(series=SeriesOut.model_validate(series), cancelled_count=n)


@router.get("/{booking_id}", response_model=BookingOut)
async def get_booking(booking_id: uuid.UUID, session: DB, current: CurrentUser = require(*VIEW)):
    b = await BookingRepository(session).get(booking_id)
    if b is None:
        raise NotFound("Booking not found")
    return booking_out(b, current.principal, now_utc())


@router.patch("/{booking_id}", response_model=BookingOut)
async def update_booking(booking_id: uuid.UUID, body: BookingUpdate, session: DB,
                         current: CurrentUser = require(P.BOOKINGS_CREATE, P.BOOKINGS_MANAGE_ALL)):
    b = await _svc(session, current).update(booking_id, body)
    return booking_out(b, current.principal, now_utc())


@router.post("/{booking_id}/cancel", response_model=BookingOut)
async def cancel_booking(booking_id: uuid.UUID, body: CancelIn, session: DB,
                         current: CurrentUser = require(P.BOOKINGS_CREATE, P.BOOKINGS_MANAGE_ALL)):
    b = await _svc(session, current).cancel(booking_id, body.reason)
    return booking_out(b, current.principal, now_utc())

