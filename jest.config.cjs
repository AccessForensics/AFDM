/** @type {import("jest").Config} */
module.exports = {
  testEnvironment: "node",

  // Run only Jest tests
  testMatch: [
    "**/__tests__/**/*.test.js",
    "**/tests/**/*.test.js"
  ],

  // Do NOT let Jest try to run Playwright Test or Node's test runner suites
  testPathIgnorePatterns: [
    "/node_modules/",
    "\\.spec\\.js$",
    "template3_preconditions\\.test\\.js$"
  ],
};
