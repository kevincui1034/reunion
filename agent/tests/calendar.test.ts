import { describe, it, expect } from "vitest";
import {
  CalendarClient,
  parseAvailability,
  type FetchLike,
} from "../src/planning/when/calendarClient.js";
import { pickWindow } from "../src/planning/when/pickWindow.js";
import { resolveAvailability, createCalendarResolver } from "../src/planning/when/availabilityResolver.js";
import type { Trip } from "../src/contracts/index.js";

const DAY = 24 * 60 * 60 * 1000;
const JUL = (d: number) => Date.UTC(2026, 6, d);

function tripWith(timeframe: string | null): Trip {
  return {
    id: "trip_1",
    groupId: "g1",
    destination: "Mexico City",
    timeframe,
    status: "scheduling",
    currentSummary: "",
    createdAt: 0,
    updatedAt: 0,
  };
}

describe("parseAvailability", () => {
  it("normalizes epoch-ms ranges and splits resolved vs pending participants", () => {
    const a = parseAvailability({
      common_free: [{ start: JUL(10), end: JUL(13) }],
      participants: [
        { handle: "+1555000001", status: "resolved" },
        { handle: "+1555000002", status: "needs_connect_link", connect_url: "https://c/2" },
      ],
    });
    expect(a.commonFree).toEqual([{ start: JUL(10), end: JUL(13) }]);
    expect(a.participants).toHaveLength(2);
    expect(a.pendingConnects).toEqual([{ handle: "+1555000002", connectUrl: "https://c/2" }]);
  });

  it("accepts ISO range bounds and sorts them", () => {
    const a = parseAvailability({
      common_free: [
        { start: "2026-07-20", end: "2026-07-22" },
        { start: "2026-07-10T00:00:00Z", end: "2026-07-12T00:00:00Z" },
      ],
      participants: [],
    });
    expect(a.commonFree[0]!.start).toBe(JUL(10));
    expect(a.commonFree[1]!.start).toBe(JUL(20));
  });

  it("reads connect status nested inside the availability JSON string", () => {
    const a = parseAvailability({
      common_free: [],
      participants: [
        {
          handle: "+1555000003",
          availability: JSON.stringify({ status: "needs_connect_link", connect_url: "https://c/3" }),
        },
      ],
    });
    expect(a.participants[0]!.status).toBe("needs_connect_link");
    expect(a.pendingConnects).toEqual([{ handle: "+1555000003", connectUrl: "https://c/3" }]);
  });

  it("drops malformed ranges", () => {
    const a = parseAvailability({
      common_free: [{ start: "nope", end: 123 }, { start: JUL(13), end: JUL(10) }],
      participants: [],
    });
    expect(a.commonFree).toEqual([]);
  });
});

describe("CalendarClient", () => {
  function fakeFetch(body: unknown, ok = true, status = 200): { fetchImpl: FetchLike; calls: any[] } {
    const calls: any[] = [];
    const fetchImpl: FetchLike = async (url, init) => {
      calls.push({ url, init });
      return {
        ok,
        status,
        json: async () => body,
        text: async () => JSON.stringify(body),
      };
    };
    return { fetchImpl, calls };
  }

  it("POSTs trip_id with the internal key header and parses the response", async () => {
    const { fetchImpl, calls } = fakeFetch({
      common_free: [{ start: JUL(10), end: JUL(13) }],
      participants: [{ handle: "+1", status: "resolved" }],
    });
    const client = new CalendarClient({ baseUrl: "https://cal/", internalKey: "secret", fetchImpl });

    const a = await client.getAvailability("trip_9");

    expect(calls[0].url).toBe("https://cal/api/trip-availability");
    expect(calls[0].init.headers["x-internal-key"]).toBe("secret");
    expect(JSON.parse(calls[0].init.body)).toEqual({ trip_id: "trip_9" });
    expect(a.commonFree).toHaveLength(1);
  });

  it("throws on a non-ok response", async () => {
    const { fetchImpl } = fakeFetch({ error: "boom" }, false, 500);
    const client = new CalendarClient({ baseUrl: "https://cal", internalKey: "k", fetchImpl });
    await expect(client.getAvailability("t")).rejects.toThrow(/500/);
  });
});

describe("pickWindow", () => {
  it("clips common_free to the timeframe and returns best-first candidates", () => {
    const cands = pickWindow(
      [
        { start: JUL(1), end: JUL(4) }, // before/at timeframe edge
        { start: JUL(14), end: JUL(18) },
      ],
      {
        timeframe: { start: JUL(10), end: JUL(31) },
        resolvedHandles: ["+1", "+2"],
        pendingHandles: [],
      },
    );
    // First range mostly clipped out (Jul 10..4 invalid), only the second survives.
    expect(cands).toHaveLength(1);
    expect(cands[0]!.label).toBe("Jul 14–17");
    expect(cands[0]!.score).toBe(1);
  });

  it("drops windows shorter than minDays and caps at maxDays", () => {
    const cands = pickWindow([{ start: JUL(1), end: JUL(1) + DAY }], { minDays: 2 });
    expect(cands).toHaveLength(0);

    const long = pickWindow([{ start: JUL(1), end: JUL(20) }], { maxDays: 3, resolvedHandles: ["+1"] });
    expect(long[0]!.end - long[0]!.start).toBe(3 * DAY);
  });

  it("scores partial coverage when some participants are pending", () => {
    const cands = pickWindow([{ start: JUL(10), end: JUL(13) }], {
      resolvedHandles: ["+1", "+2", "+3"],
      pendingHandles: ["+4"],
    });
    expect(cands[0]!.score).toBeCloseTo(0.75);
    expect(cands[0]!.conflictUserIds).toEqual(["+4"]);
  });
});

describe("resolveAvailability", () => {
  it("uses the stub when USE_STUBS is on", async () => {
    const stub = async () => ({ candidates: [], pendingConnects: [] });
    const resolver = resolveAvailability({ useStubs: true, calendar: { baseUrl: "x", internalKey: "y" } }, stub);
    expect(resolver).toBe(stub);
  });

  it("calls the calendar endpoint when configured and maps common_free to candidates", async () => {
    const fetchImpl: FetchLike = async () => ({
      ok: true,
      status: 200,
      json: async () => ({
        common_free: [{ start: JUL(14), end: JUL(17) }],
        participants: [{ handle: "+1", status: "resolved" }],
      }),
      text: async () => "",
    });
    const stub = async () => ({ candidates: [], pendingConnects: [] });
    const resolver = createCalendarResolver(
      { baseUrl: "https://cal", internalKey: "k", fetchImpl },
      stub,
    );

    const res = await resolver(tripWith("2026-07-01..2026-07-31"), ["u_pablo"]);
    expect(res.candidates).toHaveLength(1);
    expect(res.candidates[0]!.label).toBe("Jul 14–16");
  });

  it("degrades to the stub when the endpoint errors", async () => {
    const fetchImpl: FetchLike = async () => {
      throw new Error("network down");
    };
    const stubResult = { candidates: [], pendingConnects: [{ handle: "+9", connectUrl: "u" }] };
    const stub = async () => stubResult;
    const resolver = createCalendarResolver({ baseUrl: "https://cal", internalKey: "k", fetchImpl }, stub);

    const res = await resolver(tripWith("july"), ["u_pablo"]);
    expect(res).toEqual(stubResult);
  });
});
