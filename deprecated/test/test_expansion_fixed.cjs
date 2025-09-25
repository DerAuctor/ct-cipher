#!/usr/bin/env node

require('dotenv').config();
const yaml = require('js-yaml');
const fs = require('fs');

// Import env from the hashed filename
const { env } = require('./dist/src/core/env-VDHOI2WR.js');

const config = yaml.load(fs.readFileSync('./memAgent/cipher.yml', 'utf8'));
console.log('Raw config:', JSON.stringify(config.embedding, null, 2));

// Test the expandEnvVars function exactly like the real one
function expandEnvVars(config) {
  if (typeof config === 'string') {
    const expanded = config.replace(
      /\$([A-Z_][A-Z0-9_]*)|\${([A-Z_][A-Z0-9_]*)}/gi,
      (_, v1, v2) => {
        const key = v1 || v2;
        return env[key] || '';
      }
    );

    // Try to convert numeric strings to numbers
    if (expanded !== config && /^-?\d+(\.\d+)?([eE][+-]?\d+)?$/.test(expanded.trim())) {
      return Number(expanded);
    }

    return expanded;
  } else if (Array.isArray(config)) {
    return config.map(expandEnvVars);
  } else if (typeof config === 'object' && config !== null) {
    const result = {};
    for (const key in config) {
      result[key] = expandEnvVars(config[key]);
    }
    return result;
  }
  return config;
}

console.log('After real expansion using env object:', JSON.stringify(expandEnvVars(config.embedding), null, 2));
console.log('MISTRAL_API_KEY in env object:', env.MISTRAL_API_KEY ? env.MISTRAL_API_KEY.length : 'not set');
console.log('MISTRAL_API_KEY in process.env:', process.env.MISTRAL_API_KEY ? process.env.MISTRAL_API_KEY.length : 'not set');