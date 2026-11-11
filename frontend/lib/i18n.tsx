"use client";

/**
 * Minimal gettext-style i18n: the English string IS the key. Arabic translations live in
 * the `ar` dictionary; any missing key falls back to English. To add a language, add a
 * dictionary and extend `Language`.
 */

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";

export type Language = "en" | "ar";

export const ar: Record<string, string> = {
  // Navigation
  Overview: "نظرة عامة",
  Calendar: "التقويم",
  Reservations: "الحجوزات",
  "Meeting Rooms": "غرف الاجتماعات",
  Employees: "الموظفون",
  Departments: "الإدارات",
  "TV Displays": "شاشات العرض",
  Announcements: "الإعلانات",
  Analytics: "التحليلات",
  "Audit Logs": "سجل التدقيق",
  Settings: "الإعدادات",
  // Common actions
  Create: "إنشاء",
  Save: "حفظ",
  Cancel: "إلغاء",
  Close: "إغلاق",
  Edit: "تعديل",
  Delete: "حذف",
  Search: "بحث",
  Filter: "تصفية",
  Export: "تصدير",
  Logout: "تسجيل الخروج",
  "Sign in": "تسجيل الدخول",
  "Change password": "تغيير كلمة المرور",
  Loading: "جار التحميل",
  "New reservation": "حجز جديد",
  "Cancel reservation": "إلغاء الحجز",
  Deactivate: "تعطيل",
  Activate: "تفعيل",
  Previous: "السابق",
  Next: "التالي",
  // Statuses
  Available: "متاحة",
  Upcoming: "قادم",
  Occupied: "مشغولة",
  Maintenance: "صيانة",
  Unavailable: "غير متاحة",
  Confirmed: "مؤكد",
  "In progress": "جارٍ",
  Completed: "مكتمل",
  Cancelled: "ملغى",
  Online: "متصل",
  Offline: "غير متصل",
  Unknown: "غير معروف",
  Disabled: "معطل",
  Active: "نشط",
  Inactive: "غير نشط",
  // Fields
  Title: "العنوان",
  Room: "الغرفة",
  Organizer: "المنظم",
  Department: "الإدارة",
  Date: "التاريخ",
  "Start time": "وقت البدء",
  "End time": "وقت الانتهاء",
  Attendees: "الحضور",
  "Meeting type": "نوع الاجتماع",
  Description: "الوصف",
  Notes: "ملاحظات",
  Capacity: "السعة",
  Location: "الموقع",
  Email: "البريد الإلكتروني",
  Password: "كلمة المرور",
  Name: "الاسم",
  Code: "الرمز",
  Status: "الحالة",
  Roles: "الأدوار",
  // TV display
  AVAILABLE: "متاحة",
  OCCUPIED: "مشغولة",
  "STARTING SOON": "يبدأ قريبًا",
  UNAVAILABLE: "غير متاحة",
  "ROOM UNDER MAINTENANCE": "الغرفة تحت الصيانة",
  "Upcoming meetings": "الاجتماعات القادمة",
  "No more meetings today": "لا توجد اجتماعات أخرى اليوم",
  "Next meeting": "الاجتماع التالي",
  "Up next": "التالي",
  "Remaining": "المتبقي",
  "Starts in": "يبدأ خلال",
  "Free until": "متاحة حتى",
  "Free at": "متاحة الساعة",
  "Free for the rest of the day": "متاحة لبقية اليوم",
  "Last sync": "آخر مزامنة",
  "Offline — last synced": "غير متصل — آخر مزامنة",
  "Display not paired": "الشاشة غير مقترنة",
  "Ask IT to pair this display.": "يرجى التواصل مع قسم تقنية المعلومات لإقران هذه الشاشة.",
  "Display credentials revoked": "تم إلغاء بيانات اعتماد الشاشة",
  "This display is assigned to a different room": "هذه الشاشة مخصصة لغرفة أخرى",
  "Scan to book": "امسح للحجز",
  "Book this room": "احجز هذه الغرفة",
  "Book now": "احجز الآن",
  "Later today": "لاحقاً اليوم",
  "Today's schedule": "جدول اليوم",
  "Meeting title": "عنوان الاجتماع",
  "Booking confirmed": "تم تأكيد الحجز",
  "Cancel this booking": "إلغاء هذا الحجز",
  "Open dashboard": "فتح لوحة التحكم",
  "Book another time": "احجز وقتاً آخر",
  "No more free time today": "لا يوجد وقت متاح آخر اليوم",
  "Occupied until": "مشغولة حتى",
};

const dictionaries: Record<Language, Record<string, string>> = { en: {}, ar };

export function translate(lang: Language, key: string, vars?: Record<string, string | number>): string {
  let s = dictionaries[lang][key] ?? key;
  if (vars) {
    for (const k of Object.keys(vars)) s = s.split(`{${k}}`).join(String(vars[k]));
  }
  return s;
}

interface I18nContextValue {
  lang: Language;
  dir: "ltr" | "rtl";
  setLang: (l: Language) => void;
  t: (key: string, vars?: Record<string, string | number>) => string;
}

const I18nContext = createContext<I18nContextValue | null>(null);
const STORAGE_KEY = "mrm.lang";

export function I18nProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Language>("en");

  useEffect(() => {
    try {
      const stored = window.localStorage.getItem(STORAGE_KEY);
      if (stored === "ar" || stored === "en") setLangState(stored);
    } catch {
      /* storage unavailable */
    }
  }, []);

  const setLang = useCallback((l: Language) => {
    setLangState(l);
    try {
      window.localStorage.setItem(STORAGE_KEY, l);
    } catch {
      /* ignore */
    }
  }, []);

  const dir = lang === "ar" ? "rtl" : "ltr";

  useEffect(() => {
    document.documentElement.lang = lang;
    document.documentElement.dir = dir;
  }, [lang, dir]);

  const value = useMemo<I18nContextValue>(
    () => ({ lang, dir, setLang, t: (key, vars) => translate(lang, key, vars) }),
    [lang, dir, setLang],
  );

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n(): I18nContextValue {
  const ctx = useContext(I18nContext);
  if (!ctx) {
    return { lang: "en", dir: "ltr", setLang: () => undefined, t: (k, v) => translate("en", k, v) };
  }
  return ctx;
}

export function useT() {
  return useI18n().t;
}
