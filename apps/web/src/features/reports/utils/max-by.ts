// The first row with the largest value; callers pass a list that has rows.
export const maxBy = <T>(rows: readonly T[], pick: (row: T) => number): T => {
  let [best] = rows;
  for (const row of rows) {
    if (pick(row) > pick(best)) {
      best = row;
    }
  }
  return best;
};
