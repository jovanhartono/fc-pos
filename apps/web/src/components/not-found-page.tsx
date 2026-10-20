import {
	ArrowUUpLeftIcon,
	HouseIcon,
	MapPinSimpleAreaIcon,
} from "@phosphor-icons/react";
import { Link } from "@tanstack/react-router";
import { useEffect } from "react";
import { Button } from "@/components/ui/button";

const NotFoundPage = () => {
	useEffect(() => {
		document.title = "Page Not Found | Fresclean POS";
	}, []);

	const handleBack = () => {
		if (typeof window !== "undefined" && window.history.length > 1) {
			window.history.back();
			return;
		}
		window.location.assign("/");
	};

	return (
		<div className="grid min-h-dvh place-items-center bg-background px-4 py-10">
			<div className="grid w-full max-w-md justify-items-center gap-3 text-center">
				<MapPinSimpleAreaIcon className="size-10 text-muted-foreground" />
				<h1 className="font-bold text-title-2">Page not found</h1>
				<p className="text-headline">
					This page does not exist. Check the address or go back.
				</p>
				<p className="break-all text-muted-foreground text-subhead tabular-nums">
					{window.location.pathname}
				</p>
				<div className="mt-1 flex flex-wrap justify-center gap-2">
					<Button
						variant="outline"
						onClick={handleBack}
						icon={<ArrowUUpLeftIcon />}
					>
						Go back
					</Button>
					<Button
						nativeButton={false}
						render={<Link to="/" />}
						icon={<HouseIcon />}
					>
						Home
					</Button>
				</div>
			</div>
		</div>
	);
};

export { NotFoundPage };
