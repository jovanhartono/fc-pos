import type { JwtVariables } from "hono/jwt";
import type { AuthUser } from "./jwt";

export interface AdminEnv {
  Variables: JwtVariables<AuthUser>;
}
