import {
	handleTileError,
	photoTileUrl,
} from "@/features/orders/utils/photo-tile";
import { cn } from "@/lib/utils";

// "Mr. Jermain Hamill Jr." → "JH": titles and suffixes would make every
// circle read "MJ" or "DF".
const initialsOf = (name: string) =>
	name
		.split(/[\s-]+/)
		.filter((part) => part && !part.endsWith("."))
		.slice(0, 2)
		.map((part) => part[0]?.toUpperCase())
		.join("");

interface UserAvatarProps {
	name: string;
	url?: string | null;
	className?: string;
}

// Initials stand in for a missing photo, so rows with and without one stay lined up.
export const UserAvatar = ({ name, url, className }: UserAvatarProps) => (
	<span
		aria-hidden="true"
		className={cn(
			"grid size-7 shrink-0 place-items-center overflow-hidden rounded-full bg-secondary font-medium text-caption",
			className,
		)}
	>
		{url ? (
			<img
				alt=""
				className="size-full object-cover"
				decoding="async"
				onError={handleTileError}
				src={photoTileUrl(url)}
			/>
		) : (
			initialsOf(name)
		)}
	</span>
);
