module.exports = {
  testEnvironment: "jsdom",
  roots: ["<rootDir>/tests"],
  testMatch: ["**/*.test.js"],
  transform: {
    "^.+\\.js$": "babel-jest",
  },
  moduleNameMapper: {
    "^@/(.*)$": "<rootDir>/src/$1",
  },
  setupFiles: ["<rootDir>/tests/setup.js"],
  collectCoverage: true,
  collectCoverageFrom: [
    "<rootDir>/src/background/*-client.js",
    "<rootDir>/src/background/local-analyzer.js",
    "<rootDir>/src/shared/constants.js",
    "<rootDir>/src/shared/prompts.js",
    "<rootDir>/src/shared/utils.js",
  ],
  coveragePathIgnorePatterns: [
    "<rootDir>/src/background/storage-manager.js",
  ],
  coverageThreshold: {
    global: {
      branches: 55,
      functions: 70,
      lines: 70,
      statements: 70,
    },
  },
};
