import { useCallback, useEffect, useRef, useState } from "react";

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
	capture: () => Promise<Blob | null>;
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
			const nextStream = await navigator.mediaDevices.getUserMedia({
				video: { facingMode: { ideal: "environment" } },
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

	const capture = useCallback(async (): Promise<Blob | null> => {
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

		if (video.videoWidth === 0 || video.videoHeight === 0) {
			setError("Camera preview is not ready yet.");
			return null;
		}

		// Crop the captured frame to the region the object-cover preview actually
		// showed, so the saved photo matches what the user framed (WYSIWYG) instead
		// of the full sensor frame that object-cover hid behind the viewfinder edges.
		const frameWidth = video.videoWidth;
		const frameHeight = video.videoHeight;
		const boxWidth = video.clientWidth || frameWidth;
		const boxHeight = video.clientHeight || frameHeight;
		const frameAspect = frameWidth / frameHeight;
		const boxAspect = boxWidth / boxHeight;

		let sourceX = 0;
		let sourceY = 0;
		let sourceWidth = frameWidth;
		let sourceHeight = frameHeight;
		if (frameAspect > boxAspect) {
			// Frame wider than the viewfinder → its sides were cropped off.
			sourceWidth = Math.round(frameHeight * boxAspect);
			sourceX = Math.round((frameWidth - sourceWidth) / 2);
		} else {
			// Frame taller than the viewfinder → its top and bottom were cropped off.
			sourceHeight = Math.round(frameWidth / boxAspect);
			sourceY = Math.round((frameHeight - sourceHeight) / 2);
		}

		const canvas = document.createElement("canvas");
		canvas.width = sourceWidth;
		canvas.height = sourceHeight;

		const context = canvas.getContext("2d");
		if (!context) {
			setError("Unable to capture a photo right now.");
			return null;
		}

		context.drawImage(
			video,
			sourceX,
			sourceY,
			sourceWidth,
			sourceHeight,
			0,
			0,
			sourceWidth,
			sourceHeight,
		);
		const blob = await new Promise<Blob | null>((resolve) => {
			canvas.toBlob(resolve, "image/jpeg", 0.92);
		});

		if (!blob) {
			setError("Unable to capture a photo right now.");
			return null;
		}

		return blob;
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
