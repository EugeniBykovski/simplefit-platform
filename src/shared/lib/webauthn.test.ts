import { describe, expect, it } from "vitest";

import { fromBase64Url, toBase64Url } from "./webauthn";

describe("base64url (SF-120)", () => {
  it("round-trips bytes without padding or URL-unsafe characters", () => {
    const bytes = new Uint8Array([0, 251, 255, 62, 63, 1, 2]);
    const encoded = toBase64Url(bytes.buffer);
    expect(encoded).not.toMatch(/[+/=]/);
    expect(new Uint8Array(fromBase64Url(encoded))).toEqual(bytes);
    expect(toBase64Url(new Uint8Array([1, 2, 3]).buffer)).toBe("AQID");
  });
});
