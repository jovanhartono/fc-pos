import { createFileRoute, Link } from "@tanstack/react-router";
import { PageHeader } from "@/components/page-header";
import { ChangePasswordForm } from "@/features/users/components/change-password-form";

const ChangePasswordPage = () => (
	<div className="flex w-full flex-col gap-4 lg:w-1/2">
		{/* A phone has the header's back button; a laptop has no header. */}
		<Link
			className="hidden w-fit text-link text-subhead md:block"
			to="/profile"
		>
			‹ Profile
		</Link>
		<PageHeader className="mb-0" title="Change Password" />
		<ChangePasswordForm />
	</div>
);

export const Route = createFileRoute("/_admin/profile/password")({
	component: ChangePasswordPage,
});
