import { useMutation } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, FieldError, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { trackPublicOrder } from "@/lib/api";
import {
	formatOrderServiceStatus,
	formatOrderStatus,
	formatPaymentStatus,
	getOrderServiceStatusBadgeVariant,
	getOrderStatusBadgeVariant,
	getPaymentStatusBadgeVariant,
} from "@/lib/status";

export const Route = createFileRoute("/track")({
	component: TrackOrderPage,
});

function TrackOrderPage() {
	const [code, setCode] = useState("");
	const [phone, setPhone] = useState("");
	const [formError, setFormError] = useState<string | null>(null);

	const trackMutation = useMutation({
		mutationFn: trackPublicOrder,
	});

	const handleTrack = async () => {
		if (!code.trim() || !phone.trim()) {
			setFormError("Order code and phone number are required");
			return;
		}
		setFormError(null);
		await trackMutation.mutateAsync({
			code: code.trim(),
			phone_number: phone.trim(),
		});
	};

	const sortedServices = useMemo(() => {
		if (!trackMutation.data) {
			return [];
		}
		return [...trackMutation.data.services].sort((a, b) => a.id - b.id);
	}, [trackMutation.data]);

	return (
		<div className="container mx-auto grid max-w-3xl gap-4 px-4 py-8">
			<Card>
				<CardHeader>
					<CardTitle>Track Shoe Laundry Order</CardTitle>
				</CardHeader>
				<CardContent className="grid gap-3">
					<Field data-invalid={!!formError}>
						<FieldLabel htmlFor="track-code">Order Code</FieldLabel>
						<Input
							id="track-code"
							placeholder="e.g. #ABC/06032026/1"
							value={code}
							onChange={(event) => setCode(event.target.value)}
						/>
					</Field>
					<Field data-invalid={!!formError}>
						<FieldLabel htmlFor="track-phone">Phone Number</FieldLabel>
						<Input
							id="track-phone"
							placeholder="e.g. +628123456789"
							value={phone}
							onChange={(event) => setPhone(event.target.value)}
						/>
						<FieldError
							errors={[formError ? { message: formError } : undefined]}
						/>
					</Field>
					<Button onClick={handleTrack} disabled={trackMutation.isPending}>
						{trackMutation.isPending ? "Checking..." : "Track Order"}
					</Button>
				</CardContent>
			</Card>

			{trackMutation.data ? (
				<Card>
					<CardHeader>
						<CardTitle>{trackMutation.data.code}</CardTitle>
					</CardHeader>
					<CardContent className="grid gap-3">
						<div className="flex flex-wrap gap-2">
							<Badge
								variant={getOrderStatusBadgeVariant(trackMutation.data.status)}
							>
								{formatOrderStatus(trackMutation.data.status)}
							</Badge>
							<Badge
								variant={getPaymentStatusBadgeVariant(
									trackMutation.data.payment_status,
								)}
							>
								{formatPaymentStatus(trackMutation.data.payment_status)}
							</Badge>
						</div>
						<p>{`Customer: ${trackMutation.data.customer.name}`}</p>
						<p>{`Phone: ${trackMutation.data.customer.phone_number_masked}`}</p>
						<p>{`Store: ${trackMutation.data.store.name}`}</p>
						<p>{`Store Contact: ${trackMutation.data.store.phone_number}`}</p>

						<div className="grid gap-2">
							<p className="font-medium">Items</p>
							{sortedServices.map((item) => (
								<div key={item.id} className="border p-3 text-sm">
									<div className="flex flex-wrap items-center justify-between gap-2">
										<p className="font-medium">{`${item.item_code ?? `#${item.id}`} - ${item.service?.name ?? "Service"}`}</p>
										<Badge
											variant={getOrderServiceStatusBadgeVariant(item.status)}
										>
											{formatOrderServiceStatus(item.status)}
										</Badge>
									</div>
									<p>{`Color/Brand/Size: ${item.color ?? "-"} / ${item.shoe_brand ?? "-"} / ${item.shoe_size ?? "-"}`}</p>
									{item.images.length > 0 ? (
										<div className="mt-2 grid gap-2 sm:grid-cols-2">
											{item.images.map((image) => (
												<a
													key={image.id}
													href={image.image_url}
													target="_blank"
													rel="noopener"
													className="grid gap-2 border p-2"
												>
													<img
														src={image.image_url}
														alt={`${image.photo_type} for ${item.item_code ?? `service-${item.id}`}`}
														className="aspect-[4/3] w-full object-cover"
														loading="lazy"
													/>
													<p className="text-xs text-muted-foreground">
														{`${image.photo_type} - ${new Date(image.created_at).toLocaleString()}`}
													</p>
												</a>
											))}
										</div>
									) : null}
									<div className="mt-2 grid gap-1 border-t pt-2">
										{item.statusLogs.length > 0 ? (
											item.statusLogs
												.sort(
													(a, b) =>
														new Date(a.created_at).getTime() -
														new Date(b.created_at).getTime(),
												)
												.map((log) => (
													<div key={log.id} className="grid gap-1">
														<p className="text-xs text-muted-foreground">
															{`${formatOrderServiceStatus(log.to_status)} at ${new Date(log.created_at).toLocaleString()}`}
														</p>
														{log.note ? (
															<p className="text-xs text-muted-foreground">
																{log.note}
															</p>
														) : null}
													</div>
												))
										) : (
											<p className="text-xs text-muted-foreground">
												No timeline yet
											</p>
										)}
									</div>
								</div>
							))}
						</div>
					</CardContent>
				</Card>
			) : null}
		</div>
	);
}
