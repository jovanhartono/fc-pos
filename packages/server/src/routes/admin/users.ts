import { Hono } from "hono";
import { StatusCodes } from "http-status-codes";
import { assertCanManageUsers } from "@/modules/permissions/permissions";
import {
  GETUsersQuerySchema,
  PUTUserStoresSchema,
} from "@/modules/users/user.schema";
import {
  createUser,
  getUserById,
  getUsers,
  updateUser,
  updateUserStores,
} from "@/modules/users/user.service";
import { POSTUserSchema, PUTUserSchema } from "@/schema";
import { idParamSchema } from "@/schema/param";
import type { JWTPayload } from "@/types";
import { failure, success } from "@/utils/http";
import { zodValidator } from "@/utils/zod-validator-wrapper";

const app = new Hono()
  .post("/", zodValidator("json", POSTUserSchema), async (c) => {
    const actor = c.get("jwtPayload") as JWTPayload;
    assertCanManageUsers(actor);

    const { confirm_password: _, ...user } = c.req.valid("json");
    const created = await createUser(user);

    return c.json(success(created, "Create user success"), StatusCodes.CREATED);
  })
  .get("/", zodValidator("query", GETUsersQuerySchema), async (c) => {
    const actor = c.get("jwtPayload") as JWTPayload;
    assertCanManageUsers(actor);

    const query = c.req.valid("query");
    const { items, meta } = await getUsers(query);

    return c.json(success(items, undefined, meta));
  })
  .get("/me", async (c) => {
    const actor = c.get("jwtPayload") as JWTPayload;
    const user = await getUserById(actor.id);

    if (!user) {
      return c.json(failure("User not found"), StatusCodes.NOT_FOUND);
    }

    return c.json(success(user, "Current user retrieved successfully"));
  })
  .get("/:id", idParamSchema, async (c) => {
    const actor = c.get("jwtPayload") as JWTPayload;
    assertCanManageUsers(actor);

    const { id } = c.req.valid("param");
    const user = await getUserById(id);

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
      const actor = c.get("jwtPayload") as JWTPayload;
      assertCanManageUsers(actor);

      const { id } = c.req.valid("param");
      const body = c.req.valid("json");

      const user = await updateUser({ id, payload: body });

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
      assertCanManageUsers(actor);

      const { id } = c.req.valid("param");
      const { store_ids } = c.req.valid("json");

      const result = await updateUserStores({
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
