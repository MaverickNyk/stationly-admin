/**
 * Next.js instrumentation hook — runs once when the server process boots
 * (requires `experimental.instrumentationHook` in next.config.mjs on Next 14).
 *
 * We use it to start the health-check scheduler so the platform is probed every
 * 5 minutes for the life of the container, regardless of whether anyone has the
 * dashboard open. Guarded to the Node.js runtime (not the Edge middleware
 * runtime, which can't run setInterval / fetch the way we need).
 */
export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    const { ensureScheduler } = await import('./lib/health/scheduler');
    ensureScheduler();
  }
}
