import {
	ArrowUUpLeftIcon,
	HouseIcon,
	MapPinSimpleAreaIcon,
} from "@phosphor-icons/react";
import { Link } from "@tanstack/react-router";
import { useEffect } from "react";
import { Button } from "@/components/ui/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/components/ui/card";

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
			<Card className="w-full max-w-xl">
				<CardHeader className="border-b pb-4">
					<CardTitle className="flex items-center gap-2 text-sm">
						<MapPinSimpleAreaIcon className="size-4 text-muted-foreground" />
						Page not found
					</CardTitle>
					<CardDescription>
						The route you requested does not exist. Check the URL or head back.
					</CardDescription>
				</CardHeader>

				<CardContent className="grid gap-3">
					<div className="grid gap-1">
						<div className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
							Status
						</div>
						<div className="border bg-muted/50 px-3 py-2 font-mono text-[11px] leading-5">
							404 · {window.location.pathname}
						</div>
					</div>

					<div className="flex flex-wrap gap-2">
						<Button
							size="sm"
							variant="outline"
							onClick={handleBack}
							icon={<ArrowUUpLeftIcon />}
						>
							Go back
						</Button>
						<Button
							size="sm"
							nativeButton={false}
							render={<Link to="/" />}
							icon={<HouseIcon />}
						>
							Dashboard
						</Button>
					</div>
				</CardContent>
			</Card>
		</div>
	);
};

export { NotFoundPage };
