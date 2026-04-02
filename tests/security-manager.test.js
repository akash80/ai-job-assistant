/** @jest-environment jsdom */

describe("background/security-manager", () => {
  beforeEach(() => {
    const nodeCrypto = require("node:crypto");
    Object.defineProperty(globalThis, "crypto", { value: nodeCrypto.webcrypto, configurable: true });

    const local = {};
    const session = {};

    global.chrome.storage.local.get.mockImplementation(async (key) => {
      if (!key) return { ...local };
      return { [key]: local[key] };
    });
    global.chrome.storage.local.set.mockImplementation(async (obj) => {
      Object.assign(local, obj);
    });
    global.chrome.storage.local.remove.mockImplementation(async (key) => {
      delete local[key];
    });

    global.chrome.storage.session.get.mockImplementation(async (key) => {
      if (!key) return { ...session };
      return { [key]: session[key] };
    });
    global.chrome.storage.session.set.mockImplementation(async (obj) => {
      Object.assign(session, obj);
    });
    global.chrome.storage.session.remove.mockImplementation(async (key) => {
      delete session[key];
    });
  });

  test("enable + unlock stores encrypted keys and uses session cache", async () => {
    const {
      enableSecurityMode,
      getSecurityStatus,
      lockSecurityMode,
      unlockSecurityMode,
      getSessionDecryptedKeys,
      getEncryptedApiKeys,
    } = await import("../src/background/security-manager.js");

    const apiConfig = { apiKey: "sk-openai", anthropicKey: "sk-ant", perplexityKey: "pplx" };
    await enableSecurityMode("supersecret!", apiConfig);

    const enc = await getEncryptedApiKeys();
    expect(enc).toBeTruthy();
    expect(typeof enc.dataB64).toBe("string");

    let st = await getSecurityStatus();
    expect(st.enabled).toBe(true);
    expect(st.locked).toBe(false);

    let sessionKeys = await getSessionDecryptedKeys();
    expect(sessionKeys.apiKey).toBe("sk-openai");

    await lockSecurityMode();
    st = await getSecurityStatus();
    expect(st.enabled).toBe(true);
    expect(st.locked).toBe(true);

    await unlockSecurityMode("supersecret!");
    st = await getSecurityStatus();
    expect(st.locked).toBe(false);
    sessionKeys = await getSessionDecryptedKeys();
    expect(sessionKeys.perplexityKey).toBe("pplx");
  });
});

