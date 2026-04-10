import { jwt } from "hono/jwt";

export const adminMiddleware = jwt({
  secret: process.env.JWT_SECRET as string,
  alg: "HS256",
});
