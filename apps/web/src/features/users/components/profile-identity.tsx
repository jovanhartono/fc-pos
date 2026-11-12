import { PATCHOwnProfileSchema } from "@fresclean/api/schema";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Field, FieldError, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { PhotoLightbox } from "@/features/orders/components/photo-lightbox";
import { SinglePhotoUploadDialog } from "@/features/orders/components/photo-upload-dialog";
import { storesQueries } from "@/features/stores/api";
import {
	avatarUploader,
	type Me,
	removeAvatar,
	type UpdateOwnProfilePayload,
	updateOwnProfile,
	usersKeys,
} from "@/features/users/api";
import { UserAvatar } from "@/features/users/components/user-avatar";

interface ProfileIdentityProps {
	me: Me;
}

const useStoreNames = (me: Me) => {
	const storesQuery = useQuery({
		...storesQueries.list(),
		enabled: me.role !== "admin",
	});
	if (me.role === "admin") {
		return "All Stores";
	}
	const mine = new Set(me.userStores.map((row) => row.store_id));
	return (storesQuery.data ?? [])
		.filter((store) => mine.has(store.id))
		.map((store) => store.name)
		.join(", ");
};

const NameForm = ({ me }: ProfileIdentityProps) => {
	const queryClient = useQueryClient();
	const { control, handleSubmit, formState } = useForm<UpdateOwnProfilePayload>(
		{
			resolver: zodResolver(PATCHOwnProfileSchema),
			defaultValues: { name: me.name },
		},
	);
	// The new name remounts this form (its key), so Save greys out again.
	const mutation = useMutation({
		mutationFn: updateOwnProfile,
		onSuccess: (response) => {
			queryClient.setQueryData(usersKeys.me(), response.data);
			toast.success(response.message);
		},
	});

	return (
		<form onSubmit={handleSubmit((values) => mutation.mutateAsync(values))}>
			<Controller
				control={control}
				name="name"
				render={({ field, fieldState }) => (
					<Field data-invalid={fieldState.invalid}>
						<FieldLabel htmlFor="profile-name">Name</FieldLabel>
						<div className="flex gap-2">
							<Input
								{...field}
								aria-invalid={fieldState.invalid}
								autoComplete="name"
								id="profile-name"
							/>
							<Button
								disabled={!formState.isDirty}
								loading={formState.isSubmitting}
								type="submit"
							>
								Save
							</Button>
						</div>
						<FieldError errors={[fieldState.error]} />
					</Field>
				)}
			/>
		</form>
	);
};

export const ProfileIdentity = ({ me }: ProfileIdentityProps) => {
	const queryClient = useQueryClient();
	const [isUploadOpen, setIsUploadOpen] = useState(false);
	const [isLightboxOpen, setIsLightboxOpen] = useState(false);
	const storeNames = useStoreNames(me);
	const refreshMe = () =>
		queryClient.invalidateQueries({ queryKey: usersKeys.me(), exact: true });

	const handleAvatarClick = () =>
		me.avatar_url ? setIsLightboxOpen(true) : setIsUploadOpen(true);

	return (
		<div className="grid gap-6">
			<div className="flex flex-col items-center gap-1">
				<button
					aria-label={me.avatar_url ? "View photo" : "Add photo"}
					className="rounded-full"
					onClick={handleAvatarClick}
					type="button"
				>
					<UserAvatar
						className="size-22 text-title-1"
						name={me.name}
						url={me.avatar_url}
					/>
				</button>
				<Button onClick={() => setIsUploadOpen(true)} size="sm" variant="link">
					{me.avatar_url ? "Change Photo" : "Add Photo"}
				</Button>
				<p className="min-h-5 text-center text-muted-foreground text-subhead">
					<span className="capitalize">{me.role}</span>
					{storeNames ? ` · ${storeNames}` : ""}
				</p>
			</div>

			<NameForm key={me.name} me={me} />

			<Button
				nativeButton={false}
				render={<Link to="/profile/password" />}
				variant="secondary"
			>
				Change Password
			</Button>

			<SinglePhotoUploadDialog
				onOpenChange={setIsUploadOpen}
				onUploaded={refreshMe}
				open={isUploadOpen}
				title="Profile Photo"
				uploader={avatarUploader}
			/>
			{me.avatar_url ? (
				<PhotoLightbox
					items={[
						{
							alt: me.name,
							canDelete: true,
							id: "avatar",
							image_url: me.avatar_url,
						},
					]}
					onDelete={async () => {
						await removeAvatar();
						await refreshMe();
					}}
					onOpenChange={setIsLightboxOpen}
					open={isLightboxOpen}
					title="Profile Photo"
				/>
			) : null}
		</div>
	);
};
