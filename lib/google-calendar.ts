// Google Calendar helpers — query open slots and create booking events.

import { google } from "googleapis";
import { getAuthClient } from "@/lib/google-auth";

function calendar() {
  return google.calendar({ version: "v3", auth: getAuthClient() });
}

export interface CalendarSlot {
  startIso: string;
  endIso: string;
  humanReadable: string; // e.g. "Tuesday Apr 22 at 2:00 PM ET"
}

// Returns up to 2 open 30-minute slots in the next 5 business days, 10 AM–4 PM ET.
export async function getOpenSlots(count = 2): Promise<CalendarSlot[]> {
  const now = new Date();
  const timeMax = addBusinessDays(now, 5);

  const busyRes = await calendar().freebusy.query({
    requestBody: {
      timeMin: now.toISOString(),
      timeMax: timeMax.toISOString(),
      timeZone: "America/Toronto",
      items: [{ id: "primary" }],
    },
  });

  const busyRanges = busyRes.data.calendars?.["primary"]?.busy ?? [];
  const slots: CalendarSlot[] = [];
  const cursor = new Date(now);

  while (slots.length < count && cursor < timeMax) {
    const day = cursor.getDay(); // 0=Sun, 6=Sat
    if (day !== 0 && day !== 6) {
      for (let hour = 10; hour <= 15; hour++) {
        const slotStart = new Date(cursor);
        slotStart.setHours(hour, 0, 0, 0);
        const slotEnd = new Date(slotStart);
        slotEnd.setMinutes(30);

        if (slotStart <= now) continue;

        const overlaps = busyRanges.some((b) => {
          const bStart = new Date(b.start!);
          const bEnd = new Date(b.end!);
          return slotStart < bEnd && slotEnd > bStart;
        });

        if (!overlaps) {
          slots.push({
            startIso: slotStart.toISOString(),
            endIso: slotEnd.toISOString(),
            humanReadable: formatSlot(slotStart),
          });
          if (slots.length >= count) break;
        }
      }
    }
    cursor.setDate(cursor.getDate() + 1);
  }

  return slots;
}

// Create a calendar event for a booked demo call.
export async function createBookingEvent(params: {
  summary: string;
  description: string;
  startIso: string;
  endIso: string;
  attendeeEmail: string;
}): Promise<string> {
  const res = await calendar().events.insert({
    calendarId: "primary",
    sendUpdates: "all",
    requestBody: {
      summary: params.summary,
      description: params.description,
      start: { dateTime: params.startIso, timeZone: "America/Toronto" },
      end: { dateTime: params.endIso, timeZone: "America/Toronto" },
      attendees: [{ email: params.attendeeEmail }],
    },
  });
  return res.data.id ?? "";
}

function formatSlot(date: Date): string {
  return date.toLocaleString("en-CA", {
    weekday: "long",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZone: "America/Toronto",
    timeZoneName: "short",
  });
}

function addBusinessDays(date: Date, days: number): Date {
  const result = new Date(date);
  let added = 0;
  while (added < days) {
    result.setDate(result.getDate() + 1);
    const day = result.getDay();
    if (day !== 0 && day !== 6) added++;
  }
  return result;
}
