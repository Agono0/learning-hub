/**
 * Learning HUB server — REST routes (composition root).
 *
 * TD-11: the former 3,300-line monolith now lives in ./routes/<area>.ts
 * modules (same handlers, same validation, same table order); this file
 * keeps the public surface (`dispatch`, `routes`, `prototypeExemplarRouteJson`)
 * stable for apps/server/src/index.ts and the cross-host parity tests.
 */
export { dispatch, prototypeExemplarRouteJson, routes, type Route } from './routes/index'
