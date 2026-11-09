import { describe, expect, it } from "vitest";

import { isCrossOriginRequest } from "$lib/server/http/cross-origin";

function request(method: string, headers: Record<string, string>): Request {
  return new Request("http://192.168.1.20:5173/login", { method, headers });
}

describe("isCrossOriginRequest", () => {
  it("allows safe methods from anywhere", () => {
    for (const method of ["GET", "HEAD", "OPTIONS"]) {
      expect(
        isCrossOriginRequest(
          request(method, { "sec-fetch-site": "cross-site" }),
        ),
      ).toBe(false);
    }
  });

  it("allows a same-origin browser request from any address", () => {
    expect(
      isCrossOriginRequest(
        request("POST", {
          "sec-fetch-site": "same-origin",
          origin: "http://192.168.1.20:5173",
          host: "192.168.1.20:5173",
        }),
      ),
    ).toBe(false);
  });

  it("allows a request the user typed or bookmarked", () => {
    expect(
      isCrossOriginRequest(request("POST", { "sec-fetch-site": "none" })),
    ).toBe(false);
  });

  it("blocks cross-site and same-site requests", () => {
    for (const fetchSite of ["cross-site", "same-site"]) {
      expect(
        isCrossOriginRequest(request("POST", { "sec-fetch-site": fetchSite })),
      ).toBe(true);
    }
  });

  it("trusts Sec-Fetch-Site over a mismatched host", () => {
    expect(
      isCrossOriginRequest(
        request("PUT", {
          "sec-fetch-site": "same-origin",
          origin: "https://subtitles.example.org",
          host: "127.0.0.1:5173",
        }),
      ),
    ).toBe(false);
  });

  it("compares Origin with the host when Sec-Fetch-Site is missing", () => {
    expect(
      isCrossOriginRequest(
        request("POST", {
          origin: "http://nas.local:5173",
          host: "nas.local:5173",
        }),
      ),
    ).toBe(false);
    expect(
      isCrossOriginRequest(
        request("POST", {
          origin: "https://evil.example",
          host: "nas.local:5173",
        }),
      ),
    ).toBe(true);
  });

  it("accepts the host a reverse proxy forwarded", () => {
    expect(
      isCrossOriginRequest(
        request("PATCH", {
          origin: "https://subtitles.example.org",
          host: "web:3000",
          "x-forwarded-host": "subtitles.example.org",
        }),
      ),
    ).toBe(false);
  });

  it("blocks an opaque or malformed Origin", () => {
    for (const origin of ["null", "not a url"]) {
      expect(
        isCrossOriginRequest(request("POST", { origin, host: "nas.local" })),
      ).toBe(true);
    }
  });

  it("allows non-browser clients that send neither header", () => {
    expect(isCrossOriginRequest(request("POST", {}))).toBe(false);
  });
});
