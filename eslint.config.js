const { defineConfig } = require('eslint/config');
const expo = require('eslint-config-expo/flat');
module.exports = defineConfig([expo, { ignores: ['server/**', 'dist/**', 'coverage/**', 'test-results/**', 'playwright-report/**'] }]);
