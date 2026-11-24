import { Flight, Stay, TransportLeg, Trip } from '../types/models';

export interface PlannedReminder {
  key: string;
  tripId: string;
  kind: 'flight_checkin' | 'flight_departure' | 'stay_checkin' | 'transport_departure';
  title: string;
  body: string;
  fireAt: Date;
}

const MAX_SCHEDULED_REMINDERS = 48; // Safely below iOS 64-notification OS limit

function parseLocalDateTime(raw?: string | null, fallbackHour = 9): Date | null {
  if (!raw) return null;
  const s = raw.trim();
  if (!s) return null;

  // Date-only YYYY-MM-DD -> local fallbackHour:00
  const dateOnly = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (dateOnly) {
    const d = new Date(
      Number(dateOnly[1]),
      Number(dateOnly[2]) - 1,
      Number(dateOnly[3]),
      fallbackHour,
      0,
      0,
      0
    );
    return Number.isNaN(d.getTime()) ? null : d;
  }

  // Local YYYY-MM-DDTHH:mm(:ss) without timezone -> interpret in device local time
  const localIso = s.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?$/);
  if (localIso) {
    const d = new Date(
      Number(localIso[1]),
      Number(localIso[2]) - 1,
      Number(localIso[3]),
      Number(localIso[4]),
      Number(localIso[5]),
      Number(localIso[6] || 0),
      0
    );
    return Number.isNaN(d.getTime()) ? null : d;
  }

  const parsed = new Date(s);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

/**
 * Computes upcoming offline travel reminders for flights (24h check-in + 3h airport alert),
 * hotel stays (9 AM check-in morning alert), and ground/sea transports (3h before departure).
 * Returns chronological reminders strictly in the future, capped at 48 items.
 */
export function buildTravelReminders(input: {
  trips: Trip[];
  flights: Flight[];
  stays: Stay[];
  transports: TransportLeg[];
  now?: Date;
}): PlannedReminder[] {
  const nowMs = (input.now ?? new Date()).getTime();
  const minFireMs = nowMs + 60 * 1000; // At least 1 minute in the future
  const tripIds = new Set(input.trips.map((t) => t.id));
  const planned: PlannedReminder[] = [];

  for (const f of input.flights) {
    if (!tripIds.has(f.tripId)) continue;
    const dep = parseLocalDateTime(f.departureTime, 10);
    if (!dep) continue;

    // 1. 24h online check-in reminder
    const checkInAt = new Date(dep.getTime() - 24 * 3600 * 1000);
    if (checkInAt.getTime() > minFireMs) {
      planned.push({
        key: `flt_ci_${f.id}`,
        tripId: f.tripId,
        kind: 'flight_checkin',
        title: `✈️ Check-in opens for ${f.flightNumber}`,
        body: [
          `${f.originIata} → ${f.destIata}`,
          f.pnr ? `PNR ${f.pnr}` : '',
          f.airlineName,
        ]
          .filter(Boolean)
          .join(' • '),
        fireAt: checkInAt,
      });
    }

    // 2. 3h departure / airport reminder
    const depAlertAt = new Date(dep.getTime() - 3 * 3600 * 1000);
    if (depAlertAt.getTime() > minFireMs) {
      planned.push({
        key: `flt_dep_${f.id}`,
        tripId: f.tripId,
        kind: 'flight_departure',
        title: `🛫 Upcoming flight ${f.flightNumber}`,
        body: [
          `${f.originIata} → ${f.destIata}`,
          f.terminal ? `Terminal ${f.terminal.replace(/^T/i, '')}` : '',
          f.gate ? `Gate ${f.gate}` : '',
          f.seat ? `Seat ${f.seat}` : '',
        ]
          .filter(Boolean)
          .join(' • '),
        fireAt: depAlertAt,
      });
    }
  }

  for (const s of input.stays) {
    if (!tripIds.has(s.tripId)) continue;
    const morning = parseLocalDateTime(s.checkIn, 9);
    if (!morning || morning.getTime() <= minFireMs) continue;
    planned.push({
      key: `stay_ci_${s.id}`,
      tripId: s.tripId,
      kind: 'stay_checkin',
      title: `🏨 Check-in today: ${s.name}`,
      body: [
        `${s.nights} ${s.nights === 1 ? 'night' : 'nights'}`,
        s.confirmationCode ? `Conf #${s.confirmationCode}` : '',
        s.address || '',
      ]
        .filter(Boolean)
        .join(' • '),
      fireAt: morning,
    });
  }

  for (const tr of input.transports) {
    if (!tripIds.has(tr.tripId)) continue;
    const hasTime = tr.startDate.includes('T');
    const start = parseLocalDateTime(tr.startDate, 8);
    if (!start) continue;
    const alertAt = hasTime ? new Date(start.getTime() - 3 * 3600 * 1000) : start;
    if (alertAt.getTime() <= minFireMs) continue;
    planned.push({
      key: `trn_dep_${tr.id}`,
      tripId: tr.tripId,
      kind: 'transport_departure',
      title: `🚆 Upcoming ${tr.mode.replace('_', ' ')}: ${tr.title}`,
      body: [
        tr.origin && tr.destination ? `${tr.origin} → ${tr.destination}` : '',
        tr.referenceCode ? `Ref ${tr.referenceCode}` : '',
        tr.seatOrVehicle || '',
      ]
        .filter(Boolean)
        .join(' • '),
      fireAt: alertAt,
    });
  }

  planned.sort((a, b) => a.fireAt.getTime() - b.fireAt.getTime());
  return planned.slice(0, MAX_SCHEDULED_REMINDERS);
}
