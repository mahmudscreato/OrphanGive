// Liveness probe (Session 15b1). Used by:
//   - Docker HEALTHCHECK in Dockerfile (containers go "unhealthy"
//     if /api/health stops responding)
//   - External uptime monitor (BetterStack / similar) once 15b2
//     adds one
//   - Reverse proxy health gates (nginx upstream, Caddy)
//
// Deliberately simple: returns 200 if the Node process is alive
// and the route handler has been compiled. Does NOT probe
// downstream dependencies (Directus, Stripe, Resend) — a single
// dependency outage shouldn't take the whole box "unhealthy"
// and force restart loops. Deeper "/health/deep" can be added
// later if we ever need transitive checks.

import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json({
    status: "ok",
    timestamp: new Date().toISOString(),
    uptime_seconds: Math.floor(process.uptime()),
  });
}
