import { useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { PageHeader } from "@/components/page-header";
import { usersQueries } from "@/features/users/api";
import { MyPerformance } from "@/features/users/components/my-performance";
import { ProfileIdentity } from "@/features/users/components/profile-identity";

// Half the width on a laptop: a short page of rows reads better with each
// label close to its number (decided in the #57 mockup).
const ProfilePage = () => {
	const { data: me } = useSuspenseQuery(usersQueries.me());

	return (
		<div className="flex w-full flex-col gap-8 lg:w-1/2">
			<PageHeader className="mb-0" title="Profile" />
			<ProfileIdentity me={me} />
			{me.role === "admin" ? null : <MyPerformance role={me.role} />}
		</div>
	);
};

export const Route = createFileRoute("/_admin/profile/")({
	component: ProfilePage,
});
