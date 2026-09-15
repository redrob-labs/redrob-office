import { describe, expect, it } from "vitest";
import { isPrivateHost } from "./net-tools.js";

describe("isPrivateHost", () => {
  it("flags loopback, private, link-local and metadata hosts", () => {
    for (const host of [
      "localhost",
      "127.0.0.1",
      "0.0.0.0",
      "::1",
      "metadata.google.internal",
      "10.0.0.5",
      "192.168.1.1",
      "172.16.0.1",
      "172.31.255.255",
      "169.254.169.254",
    ]) {
      expect(isPrivateHost(host)).toBe(true);
    }
  });

  it("allows public hosts", () => {
    for (const host of ["example.com", "duckduckgo.com", "8.8.8.8", "172.32.0.1"]) {
      expect(isPrivateHost(host)).toBe(false);
    }
  });
});
