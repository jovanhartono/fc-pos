import { db } from "@/db";
import { BadRequestException, NotFoundException } from "@/http-exceptions";
import {
  findComplaintById,
  findComplaintDetailById,
  findComplaintForService,
  findComplaintSubjectService,
  findComplaints,
  insertComplaint,
  insertOrderServiceStatusLog,
  insertReworkLine,
  lockOrderServiceState,
} from "@/modules/complaints/complaint.repository";
import {
  type GetComplaintsQuery,
  isComplainableStatus,
  normalizeComplaintListQuery,
  type PostComplaintInput,
} from "@/modules/complaints/complaint.schema";
import {
  type DbExecutor,
  recomputeOrderRollup,
} from "@/modules/orders/order-status-machine";
import type { JWTPayload } from "@/types";
import {
  assertStoreAccess,
  resolveStoreScope,
  unhandledStoreScope,
} from "@/utils/authorization";
import { buildPaginationMeta } from "@/utils/pagination";

type SubjectService = NonNullable<
  Awaited<ReturnType<typeof findComplaintSubjectService>>
>;

// A rework is a free OrderService line on the same order (ADR-0013); adding it
// flips the order rollup back to processing. It is the same physical object
// coming back over the counter, so the line reuses the complained Item — same
// tag, same descriptors — and the Item stops being collectable until the
// re-clean is ready (ADR-0017).
async function createReworkLine(
  tx: DbExecutor,
  {
    complaintId,
    subject,
    userId,
  }: {
    complaintId: number;
    subject: SubjectService;
    userId: number;
  }
) {
  const { order } = subject;
  if (!order) {
    throw new BadRequestException("Order service is not attached to an order");
  }

  const note = `Rework for complaint #${complaintId}`;
  const line = await insertReworkLine(tx, {
    order_id: order.id,
    item_id: subject.item_id,
    service_id: subject.service_id,
    price: "0",
    cogs_snapshot: "0",
    is_priority: true,
    status: "queued",
    complaint_id: complaintId,
    notes: note,
  });

  // A line has no created_at, so this row is the only record of who put a
  // second or third round on the rack, and when.
  await insertOrderServiceStatusLog(tx, {
    order_service_id: line.id,
    from_status: null,
    to_status: "queued",
    changed_by: userId,
    note,
  });

  await recomputeOrderRollup(tx, order.id, userId);

  return line;
}

async function lockComplainableLine(
  tx: DbExecutor,
  serviceId: number,
  refusal: string
) {
  const line = await lockOrderServiceState(tx, serviceId);
  if (!(line && isComplainableStatus(line.status))) {
    throw new BadRequestException(refusal);
  }
  return line;
}

async function loadComplaintSubject(user: JWTPayload, complaintId: number) {
  const complaint = await findComplaintById(complaintId);
  if (!complaint) {
    throw new NotFoundException("Complaint not found");
  }

  const subject = await findComplaintSubjectService(complaint.order_service_id);
  if (!subject?.order) {
    throw new NotFoundException("Complaint subject line not found");
  }

  await assertStoreAccess(user, subject.order.store_id);

  return { complaint, subject };
}

export async function openComplaint({
  user,
  body,
}: {
  user: JWTPayload;
  body: PostComplaintInput;
}) {
  const subject = await findComplaintSubjectService(body.order_service_id);
  if (!subject?.order) {
    throw new NotFoundException("Order service not found");
  }

  await assertStoreAccess(user, subject.order.store_id);

  return db.transaction(async (tx) => {
    const line = await lockComplainableLine(
      tx,
      subject.id,
      "Complaints can only be opened on items that are ready or picked up"
    );

    // A rework line is itself an OrderService; complaints attach only to real
    // lines (ADR-0013) so the one-per-line rule and the rate denominator hold.
    if (line.complaint_id !== null) {
      throw new BadRequestException("Cannot open a complaint on a rework line");
    }

    const existing = await findComplaintForService(tx, subject.id);
    if (existing) {
      throw new BadRequestException("A complaint already exists for this item");
    }

    const complaint = await insertComplaint(tx, {
      order_service_id: subject.id,
      reason: body.reason,
      opened_by: user.id,
    });

    const rework = body.start_rework
      ? await createReworkLine(tx, {
          complaintId: complaint.id,
          subject,
          userId: user.id,
        })
      : null;

    return { complaint, rework };
  });
}

export async function addRework({
  user,
  complaintId,
}: {
  user: JWTPayload;
  complaintId: number;
}) {
  const { complaint, subject } = await loadComplaintSubject(user, complaintId);

  return db.transaction(async (tx) => {
    // Refund is the terminal rung of the ladder (ADR-0013) — no rework once the
    // original line is refunded or otherwise off the shelf.
    await lockComplainableLine(
      tx,
      subject.id,
      "Cannot add a rework once the original line is no longer ready or picked up"
    );

    return createReworkLine(tx, {
      complaintId: complaint.id,
      subject,
      userId: user.id,
    });
  });
}

export async function getComplaintDetail(user: JWTPayload, id: number) {
  const detail = await findComplaintDetailById(id);
  if (!detail?.orderService?.order) {
    return null;
  }

  await assertStoreAccess(user, detail.orderService.order.store_id);

  return detail;
}

export async function listComplaints(
  user: JWTPayload,
  query?: GetComplaintsQuery
) {
  const normalized = normalizeComplaintListQuery(query);
  const scope = await resolveStoreScope(user, normalized.store_id);
  let scopedStoreIds: number[] | undefined;

  switch (scope.kind) {
    // Complaints are the branch's own returns desk — a cashier reviewing them
    // sees the branches they work at, never another branch's grievances.
    case "some":
      scopedStoreIds = scope.storeIds;
      break;
    // A staff account not yet assigned to a branch: nothing, not everything.
    case "none":
      scopedStoreIds = [];
      break;
    // An admin reviews every branch, and a named branch is already the
    // store_id filter the query carries.
    case "all":
    case "one":
      break;
    default:
      return unhandledStoreScope(scope);
  }

  const { items, total } = await findComplaints(normalized, scopedStoreIds);

  return {
    items,
    meta: buildPaginationMeta(total, normalized),
  };
}
