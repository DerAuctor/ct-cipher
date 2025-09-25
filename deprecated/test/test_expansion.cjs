#!/usr/bin/env node

require('dotenv').config();
const yaml = require('js-yaml');
const fs = require('fs');
const config = yaml.load(fs.readFileSync('./memAgent/cipher.yml', 'utf8'));
console.log('Raw config:', JSON.stringify(config.embedding, null, 2));

// Test the expandEnvVars function manually
function expandEnvVars(config) {
  if (typeof config === 'string') {
    return config.replace(/\$([A-Z_][A-Z0-9_]*)|\\$\{([A-Z_][A-Z0-9_]*)\}/gi, (_, v1, v2) => {
      const key = v1 || v2;
      return process.env[key] || '';
    });
  }
  if (Array.isArray(config)) {
    return config.map(expandEnvVars);
  }
  if (typeof config === 'object' && config !== null) {
    const result = {};
    for (const [key, value] of Object.entries(config)) {
      result[key] = expandEnvVars(value);
    }
    return result;
  }
  return config;
}

console.log('After manual expansion:', JSON.stringify(expandEnvVars(config.embedding), null, 2));
console.log('MISTRAL_API_KEY from process.env:', process.env.MISTRAL_API_KEY ? process.env.MISTRAL_API_KEY.length : 'not set');