import type { JWTPayload } from "@/types";

// Wide on purpose: a worker who lives near their Store is not the problem, and a
// manager quoting it back must be beyond argument (ADR-0020).
export const CLOCK_IN_RADIUS_KM = 3;

// A Courier is on the road all day, never near the Store they clock in at.
// The clock-in screen reads this too.
export const clockInRequiresLocation = (role: JWTPayload["role"]) =>
  role !== "courier";
