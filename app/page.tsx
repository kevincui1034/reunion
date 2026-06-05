import Link from 'next/link';
import { redirect } from 'next/navigation';
import { buildConnectLink } from '@/lib/connect-link';
import { getOrCreateParticipantByPhone } from '@/lib/storage';

const routes = [
  {
    href: '/connect',
    title: 'Connect a calendar',
    label: 'GET /connect?s=…',
    desc: 'Google OAuth consent. Requires a signed state token — RocketRide receives these as connect_url on unresolved participants. Use the form below to mint one for testing.',
  },
  {
    href: '/oauth/done',
    title: 'OAuth complete page',
    label: 'GET /oauth/done',
    desc: 'Static success page shown after the Google callback stores tokens.',
  },
];

async function startTestConnect(formData: FormData) {
  'use server';
  const phone = String(formData.get('phone') ?? '').trim();
  const tripId = String(formData.get('trip_id') ?? '').trim() || 'demo-trip';
  if (!phone) return;
  const participant = await getOrCreateParticipantByPhone(phone);
  redirect(buildConnectLink(tripId, participant.id));
}

export default function Home() {
  return (
    <main
      style={{
        fontFamily: 'system-ui, -apple-system, sans-serif',
        maxWidth: '44rem',
        margin: '4rem auto',
        padding: '0 1.5rem',
      }}
    >
      <header style={{ marginBottom: '2.5rem' }}>
        <h1 style={{ fontSize: '1.75rem', marginBottom: '0.4rem' }}>Reunion · Calendar</h1>
        <p style={{ opacity: 0.7, lineHeight: 1.5 }}>
          Google Calendar OAuth + availability engine for the group-trip agent. Two surfaces: a
          browser OAuth loop and a JSON availability endpoint called by RocketRide.
        </p>
      </header>

      <section style={{ display: 'grid', gap: '0.75rem', marginBottom: '2.5rem' }}>
        {routes.map((r) => (
          <Link key={r.href} href={r.href} className="route-card">
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'baseline',
                gap: '1rem',
                marginBottom: '0.25rem',
              }}
            >
              <strong style={{ fontSize: '1rem' }}>{r.title}</strong>
              <code style={{ fontSize: '0.8rem', opacity: 0.55 }}>{r.label}</code>
            </div>
            <p style={{ fontSize: '0.875rem', opacity: 0.7, lineHeight: 1.5 }}>{r.desc}</p>
          </Link>
        ))}
      </section>

      <section style={{ marginBottom: '2.5rem' }}>
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'baseline',
            marginBottom: '0.5rem',
          }}
        >
          <h2 style={{ fontSize: '1.1rem' }}>Try the connect flow</h2>
          <code style={{ fontSize: '0.8rem', opacity: 0.55 }}>dev tool</code>
        </div>
        <p style={{ fontSize: '0.875rem', opacity: 0.7, marginBottom: '0.75rem', lineHeight: 1.5 }}>
          Mints a signed state token for a test phone, then forwards you to Google&apos;s consent
          screen. You still need a Google account in <code>ALLOWED_TEST_EMAILS</code> to complete
          consent.
        </p>
        <form
          action={startTestConnect}
          style={{
            display: 'grid',
            gridTemplateColumns: '1fr 1fr auto',
            gap: '0.5rem',
            alignItems: 'stretch',
          }}
        >
          <input
            name="phone"
            type="tel"
            required
            placeholder="+14155551234"
            aria-label="phone"
            className="form-field"
          />
          <input
            name="trip_id"
            type="text"
            placeholder="trip_id (optional)"
            aria-label="trip id"
            defaultValue="demo-trip"
            className="form-field"
          />
          <button type="submit" className="form-submit">
            Generate &amp; connect
          </button>
        </form>
      </section>

      <section>
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'baseline',
            marginBottom: '0.5rem',
          }}
        >
          <h2 style={{ fontSize: '1.1rem' }}>Availability API</h2>
          <code style={{ fontSize: '0.8rem', opacity: 0.55 }}>POST /api/availability</code>
        </div>
        <p style={{ fontSize: '0.875rem', opacity: 0.7, marginBottom: '0.75rem', lineHeight: 1.5 }}>
          Not a clickable page — POST endpoint. Returns per-participant busy/free + common_free, or
          a signed connect_url when tokens are missing. See{' '}
          <a href="https://github.com/pleyva2004/Reunion/blob/main/docs/contracts/rocketride-to-calendar.md">
            the contract
          </a>{' '}
          for the full shape.
        </p>
        <pre
          style={{
            padding: '1rem',
            borderRadius: '0.5rem',
            background: 'rgba(127,127,127,0.1)',
            overflowX: 'auto',
            fontSize: '0.8rem',
            lineHeight: 1.5,
          }}
        >
{`curl -X POST $CALENDAR_BASE_URL/api/availability \\
  -H "x-internal-key: $CALENDAR_INTERNAL_KEY" \\
  -H "content-type: application/json" \\
  -d '{
    "trip_id": "abc-123",
    "window": { "start": "2026-07-10", "end": "2026-07-20" },
    "participants": [{ "phone": "+14155551234" }]
  }'`}
        </pre>
      </section>
    </main>
  );
}
