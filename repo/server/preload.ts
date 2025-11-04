import dotenv from 'dotenv';
// Disable OpenTelemetry SDK/exporters early to avoid ADC lookups in transitive deps
// This runs before any other imports when explicitly imported at the top of entry files.
try {
  const env = (typeof process !== 'undefined' ? process.env : {}) as Record<string, string | undefined>;
  if (!env.OTEL_SDK_DISABLED) process.env.OTEL_SDK_DISABLED = 'true';
  if (!env.OTEL_TRACES_EXPORTER) process.env.OTEL_TRACES_EXPORTER = 'none';
  if (!env.OTEL_METRICS_EXPORTER) process.env.OTEL_METRICS_EXPORTER = 'none';
  if (!env.OTEL_LOG_LEVEL) process.env.OTEL_LOG_LEVEL = 'error';
  // Some clients honor these toggles; harmless if ignored
  if (!env.GOOGLE_CLOUD_DISABLE_TRACING) process.env.GOOGLE_CLOUD_DISABLE_TRACING = '1';
  // Load env before any other module initialization
  dotenv.config({ path: '.env.local' });
  dotenv.config();
  dotenv.config({ path: '.env.local.user', override: true });
} catch {}

export {};