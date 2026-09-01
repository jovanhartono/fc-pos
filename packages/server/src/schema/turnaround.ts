// Two thresholds that happen to share a number today — deliberately not one
// constant. They answer different questions against different clocks, and a
// single name asserted they were the same question until the two screens
// disagreed about which Items were late.

// "The workshop is slow": how long since drop-off the shop may take before a
// row on /queue turns red. Measured from the order's created_at.
export const TURNAROUND_PROMISE_HOURS = 72;

// "The customer is slow to collect": how long a finished Item may sit on the
// shelf before /orders counts it into the Overdue pill. Measured from
// ready_at — an order nobody has finished has not kept the customer waiting.
export const PICKUP_OVERDUE_HOURS = 72;
