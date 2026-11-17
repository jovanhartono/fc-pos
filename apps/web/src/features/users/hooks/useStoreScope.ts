import { useSuspenseQuery } from "@tanstack/react-query";

import { usersQueries } from "@/features/users/api";
import { storeScope } from "@/features/users/lib/store-scope";

// The `_admin` layout loads `me` before any page draws, so this never waits.
// It reads the server's role, not the sign-in token's, which goes stale when
// an admin changes someone's role or Stores mid-session.
export const useStoreScope = () =>
  storeScope(useSuspenseQuery(usersQueries.me()).data);
