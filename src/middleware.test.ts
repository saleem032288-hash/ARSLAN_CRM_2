import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

// --- Scenario knobs the mock reads -----------------------------------------
// `mockUser`         — what getUser() resolves to (a refreshed session ⇒ user,
//                      or null for the logged-out path).
// `refreshedCookies` — cookies Supabase writes via setAll() during getUser(),
//                      i.e. the freshly *rotated* auth token. The whole point
//                      of the test is that these must survive onto whatever
//                      response the middleware returns — including redirects.
// `getUserError`     — when set, getUser() rejects, simulating a Supabase
//                      outage. The middleware must fail closed, not 500.
// `getUserCalls`     — counts how many times the network call was made, so
//                      the no-cookie short-circuit is observable.
let mockUser: { id: string } | null = null;
let refreshedCookies: Array<{
  name: string;
  value: string;
  options: Record<string, unknown>;
}> = [];
let getUserError: Error | null = null;
let getUserCalls = 0;

vi.mock("@supabase/ssr", () => ({
  createServerClient: (
    _url: string,
    _key: string,
    opts: {
      cookies: { setAll: (c: typeof refreshedCookies) => void };
    },
  ) => ({
    auth: {
      // Mirrors real auth-js: an expired access token is transparently
      // refreshed inside getUser(), which rotates the refresh token and
      // pushes the new cookies through setAll() before resolving.
      getUser: async () => {
        getUserCalls++;
        if (refreshedCookies.length) opts.cookies.setAll(refreshedCookies);
        if (getUserError) throw getUserError;
        return { data: { user: mockUser } };
      },
    },
  }),
}));

// Imported after the mock is registered.
const { middleware } = await import("./middleware");

beforeEach(() => {
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://test.supabase.co";
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "anon-key";
  mockUser = null;
  refreshedCookies = [];
  getUserError = null;
  getUserCalls = 0;
});

afterEach(() => vi.clearAllMocks());

const AUTH_COOKIE = "sb-test-auth-token=session";

/** A request carrying a Supabase auth cookie (the normal signed-in case). */
function authRequest(path: string) {
  return new NextRequest(`https://app.test${path}`, {
    headers: { cookie: AUTH_COOKIE },
  });
}

const ROTATED = {
  name: "sb-test-auth-token",
  value: "rotated-refresh-token",
  options: { path: "/", httpOnly: true },
};

describe("middleware — refreshed auth cookies survive redirects", () => {
  it("carries the rotated token when redirecting a signed-in user off /login", async () => {
    mockUser = { id: "user-1" };
    refreshedCookies = [ROTATED];

    const res = await middleware(authRequest("/login"));

    // Redirect to /dashboard…
    expect(res.status).toBe(307);
    expect(res.headers.get("location")).toContain("/dashboard");
    // …and the rotated cookie MUST ride along, otherwise the browser keeps
    // replaying the now-consumed refresh token and the session wedges until
    // the user manually clears cookies.
    expect(res.cookies.get(ROTATED.name)?.value).toBe(ROTATED.value);
  });

  it("carries the rotated token when redirecting an unauth user to /login", async () => {
    mockUser = null;
    // Even on the logged-out path getUser() may emit cookie writes (e.g.
    // clearing a dead session); those must not be dropped on the redirect.
    refreshedCookies = [{ ...ROTATED, value: "cleared" }];

    const res = await middleware(authRequest("/dashboard"));

    expect(res.status).toBe(307);
    expect(res.headers.get("location")).toContain("/login");
    expect(res.cookies.get(ROTATED.name)?.value).toBe("cleared");
  });

  it("redirects a signed-in user with an invite token to /join/<token>", async () => {
    mockUser = { id: "user-1" };
    refreshedCookies = [ROTATED];

    const res = await middleware(authRequest("/login?invite=abc123"));

    expect(res.headers.get("location")).toContain("/join/abc123");
    expect(res.cookies.get(ROTATED.name)?.value).toBe(ROTATED.value);
  });

  it("passes through (no redirect) for a signed-in user on a protected page", async () => {
    mockUser = { id: "user-1" };
    refreshedCookies = [ROTATED];

    const res = await middleware(authRequest("/dashboard"));

    // No redirect — the normal NextResponse.next() already carries cookies.
    expect(res.headers.get("location")).toBeNull();
    expect(res.cookies.get(ROTATED.name)?.value).toBe(ROTATED.value);
  });
});

describe("middleware — resilience", () => {
  it("skips the getUser network call entirely when there is no auth cookie", async () => {
    const res = await middleware(new NextRequest("https://app.test/login"));

    // No session is possible without the cookie, so no round-trip.
    expect(getUserCalls).toBe(0);
    expect(res.headers.get("location")).toBeNull();
  });

  it("treats a Supabase outage as signed-out instead of throwing", async () => {
    const consoleError = vi
      .spyOn(console, "error")
      .mockImplementation(() => {});
    getUserError = new Error("fetch failed");

    let res: Awaited<ReturnType<typeof middleware>>;
    try {
      res = await middleware(authRequest("/dashboard"));
    } finally {
      consoleError.mockRestore();
    }

    // Fail closed: protected route redirects to /login, no 500.
    expect(res!.status).toBe(307);
    expect(res!.headers.get("location")).toContain("/login");
  });
});
