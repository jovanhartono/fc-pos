import { Hono } from "hono";
import { StatusCodes } from "http-status-codes";
import {
  GETComplaintsQuerySchema,
  POSTComplaintSchema,
} from "@/modules/complaints/complaint.schema";
import {
  addRework,
  getComplaintDetail,
  listComplaints,
  openComplaint,
} from "@/modules/complaints/complaint.service";
import { idParamSchema } from "@/schema/param";
import type { JWTPayload } from "@/types";
import { failure, success } from "@/utils/http";
import { zodValidator } from "@/utils/zod-validator-wrapper";

const app = new Hono()
  .get("/", zodValidator("query", GETComplaintsQuerySchema), async (c) => {
    const user = c.get("jwtPayload") as JWTPayload;
    const query = c.req.valid("query");

    const { items, meta } = await listComplaints(user, query);

    return c.json(success(items, undefined, meta));
  })
  .get("/:id", idParamSchema, async (c) => {
    const user = c.get("jwtPayload") as JWTPayload;
    const { id } = c.req.valid("param");

    const detail = await getComplaintDetail(user, id);
    if (!detail) {
      return c.json(failure("Complaint not found"), StatusCodes.NOT_FOUND);
    }

    return c.json(success(detail, "Complaint detail retrieved successfully"));
  })
  .post("/", zodValidator("json", POSTComplaintSchema), async (c) => {
    const user = c.get("jwtPayload") as JWTPayload;
    const body = c.req.valid("json");

    const result = await openComplaint({ user, body });

    return c.json(success(result, "Complaint opened"), StatusCodes.CREATED);
  })
  .post("/:id/rework", idParamSchema, async (c) => {
    const user = c.get("jwtPayload") as JWTPayload;
    const { id } = c.req.valid("param");

    const rework = await addRework({ user, complaintId: id });

    return c.json(success(rework, "Rework added"), StatusCodes.CREATED);
  });

export default app;
