import "@testing-library/jest-dom/vitest";
import { afterEach } from "vitest";
import { cleanup } from "@testing-library/react";

// Vitest runs without `globals: true`, so React Testing Library never sees the
// `afterEach` it looks for and its automatic cleanup silently never registers.
// Without this, each `render()` stacks another tree on the same document and
// later tests query a DOM leaked from earlier ones. Registering it here fixes
// it suite-wide; the explicit `afterEach(cleanup)` calls a few test files added
// as a local workaround are harmless duplicates.
afterEach(cleanup);
