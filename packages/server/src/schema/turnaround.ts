// The turnaround the shop promises the customer at drop-off. Two screens judge
// an Item late against it — /orders counts it into the Overdue pill, /queue
// paints the row red — and they are describing the same shelf, so they read the
// same number. Held here rather than in either one: a second copy is how the
// counter and the workshop end up disagreeing about which Items are late.
export const PICKUP_OVERDUE_HOURS = 72;
