import type { ReactNode } from "react";

import { paceText } from "@/features/reports/utils/format";
import { UserAvatar } from "@/features/users/components/user-avatar";

interface PersonNameProps {
  name: string;
  avatarUrl?: string | null;
  children: ReactNode;
  detail?: ReactNode;
}

// A person's row title: their photo or initials, the name, and an optional line under it.
export const PersonName = ({
  name,
  avatarUrl,
  children,
  detail,
}: PersonNameProps) => (
  <span className="flex items-center gap-2.5">
    <UserAvatar name={name} url={avatarUrl} />
    <span className="grid min-w-0 gap-0.5">
      <span className="font-medium lg:line-clamp-2">{children}</span>
      {detail}
    </span>
  </span>
);

interface PaceProps {
  perDay: number | null;
  // What the pace is over: "15 days" on a person, "per checker" on Team.
  detail: string;
}

export const Pace = ({ perDay, detail }: PaceProps) => (
  <span className="grid justify-items-end gap-0.5 tabular-nums">
    <span>{paceText(perDay)}</span>
    <span className="text-subhead font-normal text-muted-foreground">
      {detail}
    </span>
  </span>
);
