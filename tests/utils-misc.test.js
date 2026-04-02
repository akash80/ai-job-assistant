/** @jest-environment jsdom */

describe("shared/utils misc", () => {
  beforeEach(() => {
    global.chrome.runtime.sendMessage.mockReset();
    global.chrome.runtime.sendMessage.mockResolvedValue({ success: true });
  });

  test("truncateText and estimateCost", async () => {
    const { truncateText, estimateCost } = await import("../src/shared/utils.js");
    expect(truncateText("abc", 10)).toBe("abc");
    expect(truncateText("abcdefghij", 5)).toBe("abcde...");
    expect(estimateCost(1000, 500, "x", { x: { prompt: 1, completion: 2 } })).toBe(1000 / 1000 * 1 + 500 / 1000 * 2);
  });

  test("debounce delays execution", async () => {
    jest.useFakeTimers();
    const { debounce } = await import("../src/shared/utils.js");
    const fn = jest.fn();
    const d = debounce(fn, 100);
    d(1);
    d(2);
    expect(fn).not.toHaveBeenCalled();
    jest.advanceTimersByTime(99);
    expect(fn).not.toHaveBeenCalled();
    jest.advanceTimersByTime(1);
    expect(fn).toHaveBeenCalledWith(2);
    jest.useRealTimers();
  });

  test("sendMessage retries transient errors then succeeds", async () => {
    jest.useFakeTimers();
    const { sendMessage } = await import("../src/shared/utils.js");

    global.chrome.runtime.sendMessage
      .mockRejectedValueOnce(new Error("Could not establish connection. Receiving end does not exist."))
      .mockResolvedValueOnce({ success: true });

    const p = sendMessage("PING", { a: 1 });
    // First retry waits 200ms.
    await jest.advanceTimersByTimeAsync(200);
    await expect(p).resolves.toEqual({ success: true });
    jest.useRealTimers();
  });

  test("sendMessage returns CONTEXT_INVALIDATED on context invalidation", async () => {
    const { sendMessage } = await import("../src/shared/utils.js");
    global.chrome.runtime.sendMessage.mockRejectedValueOnce(new Error("Extension context invalidated."));
    const out = await sendMessage("PING");
    expect(out).toMatchObject({ success: false, code: "CONTEXT_INVALIDATED" });
  });
});

