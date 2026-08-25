import { describe, expect, it } from "vitest";
import { applyCors } from "./cors.js";

function mockRes() {
  const headers = {};
  return {
    headers,
    statusCode: null,
    ended: false,
    setHeader(name, value) {
      headers[name] = value;
    },
    status(code) {
      this.statusCode = code;
      return this;
    },
    end() {
      this.ended = true;
    },
  };
}

describe("applyCors", () => {
  it("reflects the origin for an allowlisted native webview on POST and does not handle the request", () => {
    const res = mockRes();

    const handled = applyCors({ method: "POST", headers: { origin: "capacitor://localhost" } }, res);

    expect(handled).toBe(false);
    expect(res.headers["Access-Control-Allow-Origin"]).toBe("capacitor://localhost");
    expect(res.headers["Vary"]).toBe("Origin");
    expect(res.ended).toBe(false);
  });

  it("sets no allow-origin header for a non-allowlisted web origin", () => {
    const res = mockRes();

    const handled = applyCors({ method: "POST", headers: { origin: "https://evil.example" } }, res);

    expect(handled).toBe(false);
    expect(res.headers["Access-Control-Allow-Origin"]).toBeUndefined();
  });

  it("sets no allow-origin header when the request has no origin", () => {
    const res = mockRes();

    const handled = applyCors({ method: "POST", headers: {} }, res);

    expect(handled).toBe(false);
    expect(res.headers["Access-Control-Allow-Origin"]).toBeUndefined();
  });

  it("short-circuits an allowlisted OPTIONS preflight with 204 and the full header set", () => {
    const res = mockRes();

    const handled = applyCors({ method: "OPTIONS", headers: { origin: "https://localhost" } }, res);

    expect(handled).toBe(true);
    expect(res.statusCode).toBe(204);
    expect(res.ended).toBe(true);
    expect(res.headers["Access-Control-Allow-Origin"]).toBe("https://localhost");
    expect(res.headers["Access-Control-Allow-Methods"]).toBe("POST, OPTIONS");
    expect(res.headers["Access-Control-Allow-Headers"]).toBe("Content-Type");
  });

  it("still ends an OPTIONS request from an unknown origin, without allow-origin", () => {
    const res = mockRes();

    const handled = applyCors({ method: "OPTIONS", headers: { origin: "https://evil.example" } }, res);

    expect(handled).toBe(true);
    expect(res.statusCode).toBe(204);
    expect(res.headers["Access-Control-Allow-Origin"]).toBeUndefined();
  });
});
