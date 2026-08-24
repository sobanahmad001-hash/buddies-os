import { createActionFingerprint, stableStringify } from "@/lib/ai/action-fingerprint";

describe("action fingerprint", () => {
  it("serializes object keys deterministically", () => {
    expect(stableStringify({ b: 2, a: 1 })).toBe('{"a":1,"b":2}');
  });

  it("produces the same fingerprint for equivalent parameters", () => {
    expect(createActionFingerprint("task", { title: "Ship", priority: 1 }))
      .toBe(createActionFingerprint("task", { priority: 1, title: "Ship" }));
  });
});
