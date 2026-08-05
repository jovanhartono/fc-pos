import { describe, expect, it } from "bun:test";
import {
	type PhotoUploader,
	resolveUploadedKey,
	type UploadPhotoInput,
} from "./photo-upload";

/** Counts pushes, because a photo pushed twice is a second copy of the evidence in the bucket. */
const stubUploader = (keys: (string | Error)[]) => {
	const pushed: File[] = [];
	const uploader: PhotoUploader = {
		commit: () => Promise.resolve(),
		pushBytes: ({ file }) => {
			pushed.push(file);
			const next = keys[pushed.length - 1];
			return next instanceof Error
				? Promise.reject(next)
				: Promise.resolve(next ?? "unexpected-push");
		},
	};
	return { pushed, uploader };
};

const failureOf = async (run: () => Promise<unknown>) => {
	try {
		await run();
	} catch (error) {
		return error as Error;
	}
	return null;
};

const tear = new File(["bytes"], "tear.webp", { type: "image/webp" });
const input: UploadPhotoInput = {
	contentType: "image/webp",
	file: tear,
};

describe("resolveUploadedKey", () => {
	it("commits the key the staged push already earned, without sending the photo a second time", async () => {
		const { pushed, uploader } = stubUploader([]);
		const staged = Promise.resolve("orders/812/services/9/staged");

		expect(await resolveUploadedKey(uploader, input, staged)).toBe(
			"orders/812/services/9/staged",
		);
		expect(pushed).toHaveLength(0);
	});

	it("pushes at confirm when the photo was staged in a flow that does not upload early", async () => {
		const { pushed, uploader } = stubUploader(["orders/812/dropoff/fresh"]);

		expect(await resolveUploadedKey(uploader, input)).toBe(
			"orders/812/dropoff/fresh",
		);
		expect(pushed).toEqual([tear]);
	});

	it("retries a push that died while the operator was still reviewing, rather than losing the batch", async () => {
		const { pushed, uploader } = stubUploader(["orders/812/dropoff/retried"]);
		const staged = Promise.reject(new Error("network changed"));
		staged.catch(() => undefined);

		expect(await resolveUploadedKey(uploader, input, staged)).toBe(
			"orders/812/dropoff/retried",
		);
		expect(pushed).toEqual([tear]);
	});

	it("surfaces a retry that fails too, so the operator is told the evidence did not save", async () => {
		const { uploader } = stubUploader([new Error("still offline")]);
		const staged = Promise.reject(new Error("network changed"));
		staged.catch(() => undefined);

		const failure = await failureOf(() =>
			resolveUploadedKey(uploader, input, staged),
		);

		expect(failure?.message).toBe("still offline");
	});
});
