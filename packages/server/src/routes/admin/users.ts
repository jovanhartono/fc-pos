import { Hono } from "hono";
import { StatusCodes } from "http-status-codes";
import { NotFoundException } from "@/http-exceptions";
import {
  assertCanCreateOrder,
  assertCanManageUsers,
} from "@/modules/permissions/permissions";
import {
  GETPerformanceQuerySchema,
  GETUsersQuerySchema,
  POSTAvatarPresignSchema,
  PUTAvatarSchema,
  PUTUserStoresSchema,
} from "@/modules/users/user.schema";
import {
  changeOwnPassword,
  createAvatarPresign,
  createUser,
  getCouriers,
  getUserById,
  getUsers,
  removeAvatar,
  resetUserPassword,
  saveAvatar,
  updateOwnName,
  updateUser,
  updateUserStores,
} from "@/modules/users/user.service";
import { getOwnPerformance } from "@/modules/users/user-performance.service";
import {
  PATCHOwnProfileSchema,
  POSTUserSchema,
  PUTOwnPasswordSchema,
  PUTUserPasswordSchema,
  PUTUserSchema,
} from "@/schema";
import { idParamSchema } from "@/schema/param";
import type { AdminEnv } from "@/types/hono";
import { success } from "@/utils/http";
import { zodValidator } from "@/utils/zod-validator-wrapper";

const app = new Hono<AdminEnv>()
  .post("/", zodValidator("json", POSTUserSchema), async (c) => {
    const actor = c.get("jwtPayload");
    assertCanManageUsers(actor);

    const { confirm_password: _, ...user } = c.req.valid("json");
    const created = await createUser(user);

    return c.json(success(created, "User created"), StatusCodes.CREATED);
  })
  .get("/", zodValidator("query", GETUsersQuerySchema), async (c) => {
    const actor = c.get("jwtPayload");
    assertCanManageUsers(actor);

    const query = c.req.valid("query");
    const { items, meta } = await getUsers(query);

    return c.json(success(items, undefined, meta));
  })
  .get("/couriers", async (c) => {
    assertCanCreateOrder(c.get("jwtPayload"));

    return c.json(success(await getCouriers()));
  })
  .get("/me", async (c) => {
    const actor = c.get("jwtPayload");
    const user = await getUserById(actor.id);

    if (!user) {
      throw new NotFoundException("User not found");
    }

    return c.json(success(user));
  })
  .patch("/me", zodValidator("json", PATCHOwnProfileSchema), async (c) => {
    const { name } = c.req.valid("json");
    const user = await updateOwnName(c.get("jwtPayload").id, name);

    return c.json(success(user, "Name saved"));
  })
  .put(
    "/me/password",
    zodValidator("json", PUTOwnPasswordSchema),
    async (c) => {
      const { current_password, password } = c.req.valid("json");
      await changeOwnPassword({
        userId: c.get("jwtPayload").id,
        currentPassword: current_password,
        password,
      });

      return c.json(success(null, "Password changed"));
    }
  )
  .post(
    "/me/avatar/presign",
    zodValidator("json", POSTAvatarPresignSchema),
    (c) => {
      const { content_type } = c.req.valid("json");
      const signed = createAvatarPresign(c.get("jwtPayload").id, content_type);

      return c.json(success(signed));
    }
  )
  .put("/me/avatar", zodValidator("json", PUTAvatarSchema), async (c) => {
    const { image_path } = c.req.valid("json");
    const user = await saveAvatar(c.get("jwtPayload").id, image_path);

    return c.json(success(user, "Photo saved"));
  })
  .delete("/me/avatar", async (c) => {
    const user = await removeAvatar(c.get("jwtPayload").id);

    return c.json(success(user, "Photo removed"));
  })
  .get(
    "/me/performance",
    zodValidator("query", GETPerformanceQuerySchema),
    async (c) => {
      const { id, role } = c.get("jwtPayload");
      const performance = await getOwnPerformance({
        userId: id,
        role,
        period: c.req.valid("query").period,
      });

      return c.json(success(performance));
    }
  )
  .get("/:id", idParamSchema, async (c) => {
    const actor = c.get("jwtPayload");
    assertCanManageUsers(actor);

    const { id } = c.req.valid("param");
    const user = await getUserById(id);

    if (!user) {
      throw new NotFoundException("User not found");
    }

    return c.json(success(user));
  })
  .put(
    "/:id",
    idParamSchema,
    zodValidator("json", PUTUserSchema),
    async (c) => {
      const actor = c.get("jwtPayload");
      assertCanManageUsers(actor);

      const { id } = c.req.valid("param");
      const body = c.req.valid("json");

      const user = await updateUser({ id, payload: body });

      if (!user) {
        throw new NotFoundException("User not found");
      }

      return c.json(success(user, `${user.name} updated`));
    }
  )
  .put(
    "/:id/password",
    idParamSchema,
    zodValidator("json", PUTUserPasswordSchema),
    async (c) => {
      const actor = c.get("jwtPayload");
      assertCanManageUsers(actor);

      const { id } = c.req.valid("param");
      const { password } = c.req.valid("json");

      const user = await resetUserPassword({ id, password });

      if (!user) {
        throw new NotFoundException("User not found");
      }

      return c.json(success(user, `Password reset for ${user.name}`));
    }
  )
  .put(
    "/:id/stores",
    idParamSchema,
    zodValidator("json", PUTUserStoresSchema),
    async (c) => {
      const actor = c.get("jwtPayload");
      assertCanManageUsers(actor);

      const { id } = c.req.valid("param");
      const { store_ids } = c.req.valid("json");

      const result = await updateUserStores({
        actor,
        id,
        store_ids,
      });

      if (!result) {
        throw new NotFoundException("User not found");
      }

      return c.json(success(result, "User stores updated"));
    }
  );

export default app;
