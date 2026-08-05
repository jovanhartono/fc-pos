import { useCallback, useEffect, useRef, useState } from "react";
import {
	type EncodedUpload,
	encodeForUpload,
	MAX_UPLOAD_DIMENSION,
} from "@/features/orders/utils/normalize-image";

const waitForVideoReady = (video: HTMLVideoElement) =>
	new Promise<void>((resolve, reject) => {
		if (video.readyState >= HTMLMediaElement.HAVE_METADATA) {
			resolve();
			return;
		}

		const cleanup = () => {
			video.removeEventListener("loadedmetadata", handleReady);
			video.removeEventListener("error", handleError);
			clearTimeout(timeoutId);
		};
		const handleReady = () => {
			cleanup();
			resolve();
		};
		const handleError = () => {
			cleanup();
			reject(new Error("video error"));
		};
		const timeoutId = setTimeout(() => {
			cleanup();
			reject(new Error("video timeout"));
		}, 3000);

		video.addEventListener("loadedmetadata", handleReady);
		video.addEventListener("error", handleError);
	});

export interface UseCameraCaptureResult {
	previewRef: React.RefObject<HTMLVideoElement | null>;
	isOpen: boolean;
	isReady: boolean;
	error: string | null;
	open: () => Promise<void>;
	stop: () => void;
	capture: () => Promise<EncodedUpload | null>;
	markReady: () => void;
}

export const useCameraCapture = (): UseCameraCaptureResult => {
	const previewRef = useRef<HTMLVideoElement | null>(null);
	const cancelRef = useRef(false);
	const [isOpen, setIsOpen] = useState(false);
	const [isReady, setIsReady] = useState(false);
	const [stream, setStream] = useState<MediaStream | null>(null);
	const [error, setError] = useState<string | null>(null);

	const stop = useCallback(() => {
		cancelRef.current = true;
		setStream((previous) => {
			if (previous) {
				for (const track of previous.getTracks()) {
					track.stop();
				}
			}
			return null;
		});

		if (previewRef.current) {
			previewRef.current.srcObject = null;
		}

		setIsReady(false);
		setIsOpen(false);
	}, []);

	const open = useCallback(async () => {
		setError(null);
		setIsReady(false);
		setIsOpen(true);
		cancelRef.current = false;

		if (!navigator.mediaDevices?.getUserMedia) {
			setError("Camera is unavailable on this device.");
			setIsOpen(false);
			return;
		}

		try {
			// Unconstrained negotiation settles on 640x480, useless for proving a 5mm
			// stain was already there. ideal (not exact) degrades on cheap Androids
			// instead of refusing to open the camera.
			const nextStream = await navigator.mediaDevices.getUserMedia({
				video: {
					facingMode: { ideal: "environment" },
					width: { ideal: 2560 },
					height: { ideal: 2560 },
				},
				audio: false,
			});

			if (cancelRef.current) {
				for (const track of nextStream.getTracks()) {
					track.stop();
				}
				return;
			}

			setStream(nextStream);
		} catch {
			setError("Unable to open the camera on this device.");
			setIsOpen(false);
		}
	}, []);

	useEffect(() => {
		const preview = previewRef.current;

		if (!stream || !preview) {
			return;
		}

		preview.srcObject = stream;
		if (preview.readyState >= HTMLMediaElement.HAVE_METADATA) {
			setIsReady(true);
		}
		void preview.play().catch(() => {
			setError("Camera preview is unavailable on this device.");
		});

		return () => {
			if (preview.srcObject === stream) {
				preview.srcObject = null;
			}
		};
	}, [stream]);

	const capture = useCallback(async (): Promise<EncodedUpload | null> => {
		const video = previewRef.current;
		if (!video) {
			setError("Camera preview is not ready yet.");
			return null;
		}

		try {
			await waitForVideoReady(video);
		} catch {
			setError("Camera preview is not ready yet.");
			return null;
		}

		const frameWidth = video.videoWidth;
		const frameHeight = video.videoHeight;
		if (frameWidth === 0 || frameHeight === 0) {
			setError("Camera preview is not ready yet.");
			return null;
		}

		// Keep the whole sensor frame rather than the slice the viewfinder box happened to
		// show. Cropping to the box was WYSIWYG, but a portrait viewfinder over a landscape
		// track threw away a fifth of the width — exactly the pixels a whole-garment frame
		// needs for a 5mm stain to read as a mark. The preview uses object-contain so this
		// stays honest: the letterboxed feed is the frame that gets saved.
		//
		// A 4K phone hands back a frame well past what gets stored. Shrink it here so the shot is
		// already in budget and gets encoded exactly once — passing it on full-size would cost an
		// extra lossy pass over the faint mark a dispute is argued from.
		const outputScale = Math.min(
			1,
			MAX_UPLOAD_DIMENSION / Math.max(frameWidth, frameHeight),
		);
		const canvas = document.createElement("canvas");
		canvas.width = Math.round(frameWidth * outputScale);
		canvas.height = Math.round(frameHeight * outputScale);

		const context = canvas.getContext("2d");
		if (!context) {
			setError("Unable to capture a photo right now.");
			return null;
		}

		context.drawImage(video, 0, 0, canvas.width, canvas.height);

		try {
			return await encodeForUpload(canvas);
		} catch {
			setError("Unable to capture a photo right now.");
			return null;
		}
	}, []);

	const markReady = useCallback(() => {
		setIsReady(true);
	}, []);

	return {
		previewRef,
		isOpen,
		isReady,
		error,
		open,
		stop,
		capture,
		markReady,
	};
};
