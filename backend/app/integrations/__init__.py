"""External integrations (future phase).

Microsoft 365 / Outlook (PRD §16) will live here as a controlled sync layer. This application stays
the authoritative booking system; any synced booking must record its origin (app vs. Outlook) and
go through BookingService so the same validation and the bookings_no_overlap constraint apply.
Do not add unrestricted bidirectional sync without a defined conflict-resolution strategy.
"""
