import { Hono } from "hono";
import { StatusCodes } from "http-status-codes";
import {
  createUserController,
  getUserByIdController,
  getUsersController,
  updateUserController,
  updateUserStoresController,
} from "@/modules/users/user.controller";
import {
  GETUsersQuerySchema,
  POSTUserSchema,
  PUTUserSchema,
  PUTUserStoresSchema,
} from "@/modules/users/user.schema";
import { idParamSchema } from "@/schema/param";
import type { JWTPayload } from "@/types";
import { failure, success } from "@/utils/http";
import { zodValidator } from "@/utils/zod-validator-wrapper";

const app = new Hono()
  .post("/", zodValidator("json", POSTUserSchema), async (c) => {
    const user = c.req.valid("json");
    const created = await createUserController(user);

    return c.json(success(created, "Create user success"), StatusCodes.CREATED);
  })
  .get("/", zodValidator("query", GETUsersQuerySchema), async (c) => {
    const query = c.req.valid("query");
    const { items, meta } = await getUsersController(query);

    return c.json(success(items, undefined, meta));
  })
  .get("/:id", idParamSchema, async (c) => {
    const { id } = c.req.valid("param");

    const user = await getUserByIdController(id);

    if (!user) {
      return c.json(failure("User not found"), StatusCodes.NOT_FOUND);
    }

    return c.json(success(user, "User retrieved successfully"));
  })
  .put(
    "/:id",
    idParamSchema,
    zodValidator("json", PUTUserSchema),
    async (c) => {
      const { id } = c.req.valid("param");
      const body = c.req.valid("json");

      const user = await updateUserController({ id, payload: body });

      if (!user) {
        return c.json(failure("User does not exist"), StatusCodes.NOT_FOUND);
      }

      return c.json(success(user, `Update user ${user.name} success`));
    }
  )
  .put(
    "/:id/stores",
    idParamSchema,
    zodValidator("json", PUTUserStoresSchema),
    async (c) => {
      const actor = c.get("jwtPayload") as JWTPayload;
      const { id } = c.req.valid("param");
      const { store_ids } = c.req.valid("json");

      const result = await updateUserStoresController({
        actor,
        id,
        store_ids,
      });

      if (!result) {
        return c.json(failure("User not found"), StatusCodes.NOT_FOUND);
      }

      return c.json(success(result, "User stores updated"));
    }
  );

export default app;
