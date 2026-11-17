import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";

import { usersQueries } from "@/features/users/api";
import { useLeaveSheetLink } from "@/hooks/useLeaveSheetLink";
import { cn } from "@/lib/utils";

interface CustomerLinkProps {
  className?: string;
  customerId: number;
  name: string;
}

// The detail page is admin-only (ADR-0021); a cashier gets the name as text
// rather than a link into a page that would refuse them.
export const CustomerLink = ({
  className,
  customerId,
  name,
}: CustomerLinkProps) => {
  const leaveSheet = useLeaveSheetLink();
  // The order sheet sits outside the `_admin` layout, so `me` may not be
  // loaded yet: show the plain name until it is.
  const { data: me } = useQuery(usersQueries.me());
  if (me?.role !== "admin") {
    return <span className={cn("font-medium", className)}>{name}</span>;
  }

  return (
    <Link
      className={cn("text-link", className)}
      onClick={leaveSheet}
      params={{ customerId: String(customerId) }}
      // The name sits in every order row, so a cursor sweeping the column
      // would otherwise preload a detail page and its orders per row.
      preloadDelay={300}
      search={{ page: 1 }}
      to="/customers/$customerId"
    >
      {name}
    </Link>
  );
};
