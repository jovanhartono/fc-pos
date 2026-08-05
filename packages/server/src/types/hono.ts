import type { JwtVariables } from "hono/jwt";
import type { JWTPayload } from "./jwt";

export interface AdminEnv {
  Variables: JwtVariables<JWTPayload>;
}
