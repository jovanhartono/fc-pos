import { useState } from "react";

// A value fixed when the screen opens: the week shown, the presets, the first Store.
export const useMountValue = <T>(init: () => T): T => {
  // oxlint-disable-next-line react/hook-use-state -- the setter is never used, by design
  const [value] = useState(init);
  return value;
};
