global.chrome = {
  storage: {
    local: {
      get: jest.fn((keys) => Promise.resolve({})),
      set: jest.fn(() => Promise.resolve()),
      remove: jest.fn(() => Promise.resolve()),
    },
    session: {
      get: jest.fn((keys) => Promise.resolve({})),
      set: jest.fn(() => Promise.resolve()),
      remove: jest.fn(() => Promise.resolve()),
    },
  },
  runtime: {
    sendMessage: jest.fn(() => Promise.resolve()),
    onMessage: {
      addListener: jest.fn(),
      removeListener: jest.fn(),
    },
    getURL: jest.fn((path) => `chrome-extension://fake-id/${path}`),
    openOptionsPage: jest.fn(),
  },
  tabs: {
    query: jest.fn(() => Promise.resolve([])),
    sendMessage: jest.fn(() => Promise.resolve()),
  },
};

// Load local env vars for tests only (never shipped in extension bundle).
require("dotenv").config({ quiet: true });

// Node/Jest in jsdom may not provide these globals consistently.
const { TextEncoder, TextDecoder } = require("node:util");
global.TextEncoder = global.TextEncoder || TextEncoder;
global.TextDecoder = global.TextDecoder || TextDecoder;

const nodeCrypto = require("node:crypto");
global.crypto = global.crypto?.subtle ? global.crypto : nodeCrypto.webcrypto;

// jsdom doesn't always provide CSS.escape.
global.CSS = global.CSS || {};
global.CSS.escape = global.CSS.escape || ((value) => String(value).replace(/[^a-zA-Z0-9_\u00A0-\uFFFF-]/g, "\\$&"));
