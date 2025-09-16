// ESM Sentry instrumentation for ct-cipher
import * as Sentry from "@sentry/node";
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Read package.json for version
const packageJson = JSON.parse(readFileSync(join(__dirname, 'package.json'), 'utf8'));

Sentry.init({
  dsn: "https://80325ca95b3c0463061d031d453858bc@o4509990298189824.ingest.de.sentry.io/4510031328641104",
  // Setting this option to true will send default PII data to Sentry.
  // For example, automatic IP address collection on events
  sendDefaultPii: true,

  // Environment configuration
  environment: process.env.NODE_ENV || 'development',

  // Release tracking
  release: packageJson.version,

  // Performance monitoring
  tracesSampleRate: process.env.NODE_ENV === 'production' ? 0.1 : 1.0,

  // Additional context
  tags: {
    component: 'ct-cipher',
    system: 'X∞'
  },

  // Error filtering
  beforeSend(event) {
    // Filter out development noise if needed
    if (process.env.NODE_ENV === 'development') {
      console.log('Sentry event:', event.exception?.values?.[0]?.value || event.message);
    }
    return event;
  }
});

export default Sentry;