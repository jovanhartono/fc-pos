// when dealing with cross-package types, use relative import
import type { usersTable } from "../db/schema";

type User = typeof usersTable.$inferSelect;
export type JWTPayload = Pick<
  User,
  "id" | "name" | "username" | "role" | "can_process_pickup"
>;

// The signed-in user on a request; Stores are read fresh with the role by
// adminMiddleware, never signed into the token (ADR-0006).
export interface AuthUser extends JWTPayload {
  store_ids: number[];
}
