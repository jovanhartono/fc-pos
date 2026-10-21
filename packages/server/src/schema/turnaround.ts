// Two thresholds that share a number today, kept apart on purpose: they run on
// different clocks, and one shared name had the two screens disagree on lateness.

// "The workshop is slow": how long since drop-off the shop may take before a
// row on /queue turns red. Measured from the order's created_at.
export const TURNAROUND_PROMISE_HOURS = 72;

// "The customer is slow to collect": how long a finished Item may sit on the
// shelf before /orders counts it Overdue. Measured from ready_at.
export const PICKUP_OVERDUE_HOURS = 72;
