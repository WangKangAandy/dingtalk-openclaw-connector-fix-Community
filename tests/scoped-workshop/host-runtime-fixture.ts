// Only a resolution target for the explicit vi.mock in plugin.test.ts. The suite
// proves plugin wiring against real scope/storage, not a live OpenClaw host.
export function hasActiveSessionRuns(): never { throw new Error("Host runtime must be explicitly mocked in this unit suite") }
