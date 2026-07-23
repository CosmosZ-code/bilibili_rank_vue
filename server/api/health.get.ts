/**
 * GET /api/health
 *
 * Health check endpoint for Docker HEALTHCHECK and external monitoring.
 * Returns 200 OK when the server is running.
 */
export default defineEventHandler(() => {
  return {
    status: 'ok',
    timestamp: Date.now(),
  }
})
