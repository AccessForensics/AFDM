'use strict';
const { defineConfig } = require('@playwright/test');

module.exports = defineConfig({
  testDir:     './tests',
  testMatch:   '**/*.spec.js',
  timeout:     30000,
  use: {
    headless: true
  }
});
