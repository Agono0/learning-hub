/**
 * Learning HUB server — REST routes (composition root).
 *
 * TD-11: the former 3,300-line monolith lives in ./routes/<area>.ts modules
 * (same handlers, same validation, same table order); this file keeps the
 * public surface (`dispatch`, `routes`, `prototypeExemplarRouteJson`)
 * stable for apps/server/src/index.ts and the cross-host parity tests.
 *
 * IMPORTANT: this file must stay a pure re-export. Resolving `./routes` from
 * apps/server/src/index.ts binds to THIS file (routes.ts wins over
 * routes/index.ts under bundler module resolution), so any handler logic
 * added here instead of the area modules would silently shadow the split —
 * guarded by apps/web/tests/headless-composition.test.ts.
 */
export { dispatch, prototypeExemplarRouteJson, routes, type Route } from './routes/index'
