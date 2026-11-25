import { useSuspenseQuery } from "@tanstack/react-query";

import { usersQueries } from "@/features/users/api";
import { storeScope } from "@/features/users/lib/store-scope";

// The `_admin` layout loads `me` before any page draws, so this never waits.
// ADR-0006.
export const useStoreScope = () =>
  storeScope(useSuspenseQuery(usersQueries.me()).data);
