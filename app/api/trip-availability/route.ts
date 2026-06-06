import { type NextRequest } from 'next/server';
import { config } from '@/lib/config';
import { buildConnectLink } from '@/lib/connect-link';
import {
  intersectFree,
  normalizeWindow,
  subtractBusy,
  type Interval,
} from '@/lib/availability';
import { DEMO_PARTICIPANTS } from '@/lib/demo-participants';
import { queryFreebusy, TokenRevokedError } from '@/lib/google';
import {
  getOrCreateParticipantByPhone,
  getTrip,
  upsertTripParticipant,
} from '@/lib/storage';
import { parseTimeframe, type Window } from '@/lib/timeframe';

interface TripAvailabilityRequest {
  trip_id: string;
}

interface PerHandleResult {
  handle: string;
  name: string;
  status: 'resolved' | 'needs_connect_link';
  source: 'freebusy' | null;
  busy: Interval[];
  free: Interval[];
  connect_url?: string;
}

export async function POST(request: NextRequest) {
  if (request.headers.get('x-internal-key') !== config.internalApiKey) {
    return Response.json({ error: 'unauthorized' }, { status: 401 });
  }

  let body: TripAvailabilityRequest;
  try {
    body = (await request.json()) as TripAvailabilityRequest;
  } catch {
    return Response.json({ error: 'invalid JSON body' }, { status: 400 });
  }
  if (!body?.trip_id) {
    return Response.json({ error: 'request must include trip_id' }, { status: 400 });
  }

  const trip = await getTrip(body.trip_id);
  if (!trip) {
    return Response.json({ error: `unknown trip_id: ${body.trip_id}` }, { status: 404 });
  }

  const window: Window = parseTimeframe(trip.timeframe);
  const iso = normalizeWindow({ start: window.start, end: window.end });

  const perHandle = await Promise.all(
    DEMO_PARTICIPANTS.map((p) => resolveOne(p.phone, p.name, body.trip_id, iso, window)),
  );

  await Promise.all(
    perHandle.map((r) =>
      upsertTripParticipant({
        trip_id: body.trip_id,
        handle: r.handle,
        status: r.status === 'resolved' ? 'resolved' : 'pending',
        availability: JSON.stringify(
          r.status === 'resolved'
            ? { status: 'resolved', source: r.source, busy: r.busy, free: r.free }
            : { status: 'needs_connect_link', connect_url: r.connect_url },
        ),
      }),
    ),
  );

  const commonFree = intersectFree(
    perHandle.filter((r) => r.status === 'resolved').map((r) => r.free),
  );

  return Response.json({
    trip_id: body.trip_id,
    window: { start: window.start, end: window.end, source: window.source },
    participants: perHandle,
    common_free: commonFree,
    resolved_count: perHandle.filter((r) => r.status === 'resolved').length,
    pending_count: perHandle.filter((r) => r.status === 'needs_connect_link').length,
  });
}

async function resolveOne(
  phone: string,
  name: string,
  tripId: string,
  iso: { startIso: string; endIso: string },
  windowYmd: { start: string; end: string },
): Promise<PerHandleResult> {
  const participant = await getOrCreateParticipantByPhone(phone);

  try {
    const busy = await queryFreebusy(participant.id, { start: iso.startIso, end: iso.endIso });
    return {
      handle: phone,
      name,
      status: 'resolved',
      source: 'freebusy',
      busy,
      free: subtractBusy(windowYmd, busy),
    };
  } catch (e) {
    if (e instanceof TokenRevokedError) {
      return {
        handle: phone,
        name,
        status: 'needs_connect_link',
        source: null,
        busy: [],
        free: [],
        connect_url: buildConnectLink(tripId, participant.id),
      };
    }
    throw e;
  }
}
