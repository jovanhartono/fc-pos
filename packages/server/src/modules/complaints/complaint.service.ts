import { db } from "@/db";
import type { DbExecutor } from "@/db";
import { BadRequestException, NotFoundException } from "@/http-exceptions";
import {
  findComplaintById,
  findComplaintDetailById,
  findComplaintForService,
  findComplaintSubjectService,
  findComplaints,
  findItemLines,
  insertComplaint,
  lockOrderServiceState,
} from "@/modules/complaints/complaint.repository";
import { normalizeComplaintListQuery } from "@/modules/complaints/complaint.schema";
import type {
  GetComplaintsQuery,
  PostComplaintInput,
} from "@/modules/complaints/complaint.schema";
import { queueReworkLine } from "@/modules/orders/order-status-machine";
import { isComplainableLine, isComplainableStatus } from "@/schema/complaint";
import { isInWorkshop } from "@/schema/order-status";
import type { AuthUser } from "@/types";
import {
  assertStoreAccess,
  resolveStoreScope,
  unhandledStoreScope,
} from "@/utils/authorization";
import { buildPaginationMeta } from "@/utils/pagination";

type SubjectService = NonNullable<
  Awaited<ReturnType<typeof findComplaintSubjectService>>
>;

// The same shoes come back over the counter, so the Rework line reuses the
// complained Item and its tag (ADR-0013, ADR-0017).
const createReworkLine = (
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
) => {
  const { order } = subject;
  if (!order) {
    throw new BadRequestException("Order service is not attached to an order");
  }

  return queueReworkLine(tx, {
    by: userId,
    complaintId,
    itemId: subject.item_id,
    orderId: order.id,
    serviceId: subject.service_id,
  });
};

const lockSubjectLine = async (tx: DbExecutor, subject: SubjectService) => {
  const line = await lockOrderServiceState(tx, {
    orderId: subject.order_id,
    serviceId: subject.id,
  });
  const itemLines = await findItemLines(tx, subject.item_id);
  return { itemLines, line };
};

const loadComplaintSubject = async (user: AuthUser, complaintId: number) => {
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
};

export const openComplaint = async ({
  user,
  body,
}: {
  user: AuthUser;
  body: PostComplaintInput;
}) => {
  const subject = await findComplaintSubjectService(body.order_service_id);
  if (!subject?.order) {
    throw new NotFoundException("Order service not found");
  }

  await assertStoreAccess(user, subject.order.store_id);

  return db.transaction(async (tx) => {
    const { itemLines, line } = await lockSubjectLine(tx, subject);
    if (!(line && isComplainableLine(line, itemLines))) {
      throw new BadRequestException(
        "Complaints can only be opened on items that are ready or picked up"
      );
    }

    // Complaints attach only to lines the Customer paid for (ADR-0013), or the
    // one-per-line rule and the Complaint rate break.
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
};

export const addRework = async ({
  user,
  complaintId,
}: {
  user: AuthUser;
  complaintId: number;
}) => {
  const { complaint, subject } = await loadComplaintSubject(user, complaintId);

  return db.transaction(async (tx) => {
    // Refund is the terminal rung of the ladder (ADR-0013) — no rework once the
    // original line is refunded or otherwise off the shelf.
    const { itemLines, line } = await lockSubjectLine(tx, subject);
    if (!(line && isComplainableStatus(line.status))) {
      throw new BadRequestException(
        "Cannot add a rework once the original line is no longer ready or picked up"
      );
    }

    // A round still in the workshop would put the same shoes on the rack twice;
    // a ready one waits on the shelf and leaves with the next.
    const rounds = itemLines.filter(
      (round) => round.complaint_id === complaint.id
    );
    if (rounds.some(isInWorkshop)) {
      throw new BadRequestException(
        "Finish the current rework before starting another"
      );
    }

    return createReworkLine(tx, {
      complaintId: complaint.id,
      subject,
      userId: user.id,
    });
  });
};

export const getComplaintDetail = async (user: AuthUser, id: number) => {
  const detail = await findComplaintDetailById(id);
  if (!detail?.orderService?.order) {
    return null;
  }

  await assertStoreAccess(user, detail.orderService.order.store_id);

  return detail;
};

export const listComplaints = async (
  user: AuthUser,
  query?: GetComplaintsQuery
) => {
  const normalized = normalizeComplaintListQuery(query);
  const scope = await resolveStoreScope(user, normalized.store_id);
  let scopedStoreIds: number[] | undefined;

  switch (scope.kind) {
    // A cashier sees the Complaints of the Stores they work at, never another's.
    case "some": {
      scopedStoreIds = scope.storeIds;
      break;
    }
    // A User not yet assigned to a Store sees nothing, not everything.
    case "none": {
      scopedStoreIds = [];
      break;
    }
    // A named Store is already the query's store_id filter.
    case "all":
    case "one": {
      break;
    }
    default: {
      return unhandledStoreScope(scope);
    }
  }

  const { items, total } = await findComplaints(normalized, scopedStoreIds);

  return {
    items,
    meta: buildPaginationMeta(total, normalized),
  };
};
