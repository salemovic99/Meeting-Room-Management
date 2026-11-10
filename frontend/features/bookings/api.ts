"use client";

import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import type {
  Booking,
  BookingCreate,
  BookingUpdate,
  ConflictCheck,
  Page,
  RecurringCreate,
  RecurringResult,
  Series,
  SeriesDetail,
  SeriesUpdate,
} from "@/lib/types";

export interface BookingFilters {
  room_id?: string;
  department_id?: string;
  organizer_id?: string;
  status?: string;
  from?: string;
  to?: string;
  q?: string;
  mine?: boolean;
  page: number;
  page_size: number;
}

const INVALIDATE = ["bookings", "calendar", "availability", "overview", "series", "room-bookings", "analytics"];

function useInvalidateBookings() {
  const qc = useQueryClient();
  return () => INVALIDATE.forEach((k) => void qc.invalidateQueries({ queryKey: [k] }));
}

export function useBookings(filters: BookingFilters) {
  return useQuery({
    queryKey: ["bookings", filters],
    queryFn: () => api<Page<Booking>>("/bookings", { query: { ...filters, mine: filters.mine || undefined } }),
    placeholderData: keepPreviousData,
  });
}

export function useBooking(id: string | null) {
  return useQuery({
    queryKey: ["bookings", "detail", id],
    queryFn: () => api<Booking>(`/bookings/${id}`),
    enabled: !!id,
  });
}

export function useCalendar(params: {
  from: string;
  to: string;
  room_id?: string;
  department_id?: string;
  include_cancelled?: boolean;
}) {
  return useQuery({
    queryKey: ["calendar", params],
    queryFn: () => api<{ items: Booking[] }>("/bookings/calendar", { query: params }),
    placeholderData: keepPreviousData,
    enabled: !!params.from && !!params.to,
  });
}

export function useConflictCheck(params: {
  room_id?: string;
  start_at?: string;
  end_at?: string;
  exclude_booking_id?: string;
}) {
  const ready = !!params.room_id && !!params.start_at && !!params.end_at && params.start_at < params.end_at;
  return useQuery({
    queryKey: ["bookings", "conflicts", params],
    queryFn: () => api<ConflictCheck>("/bookings/conflicts", { query: params }),
    enabled: ready,
    staleTime: 5_000,
  });
}

export function useCreateBooking() {
  const invalidate = useInvalidateBookings();
  return useMutation({
    mutationFn: (data: BookingCreate) => api<Booking>("/bookings", { method: "POST", body: data }),
    onSuccess: invalidate,
  });
}

export function useCreateRecurring() {
  const invalidate = useInvalidateBookings();
  return useMutation({
    mutationFn: (data: RecurringCreate) => api<RecurringResult>("/bookings/recurring", { method: "POST", body: data }),
    onSuccess: invalidate,
  });
}

export function useUpdateBooking() {
  const invalidate = useInvalidateBookings();
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: BookingUpdate }) =>
      api<Booking>(`/bookings/${id}`, { method: "PATCH", body: data }),
    onSuccess: invalidate,
  });
}

export function useCancelBooking() {
  const invalidate = useInvalidateBookings();
  return useMutation({
    mutationFn: ({ id, reason }: { id: string; reason?: string }) =>
      api<Booking>(`/bookings/${id}/cancel`, { method: "POST", body: { reason: reason || undefined } }),
    onSuccess: invalidate,
  });
}

export function useSeries(id: string | null) {
  return useQuery({
    queryKey: ["series", id],
    queryFn: () => api<SeriesDetail>(`/bookings/series/${id}`),
    enabled: !!id,
  });
}

export function useUpdateSeries() {
  const invalidate = useInvalidateBookings();
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: SeriesUpdate }) =>
      api<SeriesDetail>(`/bookings/series/${id}`, { method: "PATCH", body: data }),
    onSuccess: invalidate,
  });
}

export function useCancelSeries() {
  const invalidate = useInvalidateBookings();
  return useMutation({
    mutationFn: ({ id, reason }: { id: string; reason?: string }) =>
      api<{ series: Series; cancelled_count: number }>(`/bookings/series/${id}/cancel`, {
        method: "POST",
        body: { reason: reason || undefined },
      }),
    onSuccess: invalidate,
  });
}
