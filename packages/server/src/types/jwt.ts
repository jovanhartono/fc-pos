// when dealing with cross-package types, use relative import
import type { usersTable } from "../db/schema";

type User = typeof usersTable.$inferSelect;
export type JWTPayload = Pick<
  User,
  "id" | "name" | "username" | "role" | "is_active"
>;
