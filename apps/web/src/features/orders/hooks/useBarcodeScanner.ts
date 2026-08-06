import { useCallback, useEffect, useRef, useState } from "react";

interface BarcodeDetectorLike {
	detect: (input: ImageBitmapSource) => Promise<Array<{ rawValue?: string }>>;
}

type WindowWithBarcodeDetector = typeof window & {
	BarcodeDetector?: new (...args: unknown[]) => BarcodeDetectorLike;
};

const getBarcodeDetector = () =>
	(window as WindowWithBarcodeDetector).BarcodeDetector;

interface UseBarcodeScannerResult {
	videoRef: React.RefObject<HTMLVideoElement | null>;
	isScanning: boolean;
	error: string | null;
	start: () => Promise<void>;
	stop: () => void;
}

export const useBarcodeScanner = (
	onDetect: (rawValue: string) => void,
): UseBarcodeScannerResult => {
	const videoRef = useRef<HTMLVideoElement | null>(null);
	const cancelRef = useRef(false);
	const openingRef = useRef(false);
	// Mirrors `stream` so teardown never depends on React running a state
	// updater: a tablet that keeps the camera lit sits on the counter all day.
	const streamRef = useRef<MediaStream | null>(null);
	const [stream, setStream] = useState<MediaStream | null>(null);
	const [error, setError] = useState<string | null>(null);

	const onDetectRef = useRef(onDetect);
	useEffect(() => {
		onDetectRef.current = onDetect;
	});

	const stop = useCallback(() => {
		cancelRef.current = true;

		if (streamRef.current) {
			for (const track of streamRef.current.getTracks()) {
				track.stop();
			}
			streamRef.current = null;
		}

		setStream(null);
	}, []);

	const start = useCallback(async () => {
		if (openingRef.current || streamRef.current) {
			return;
		}

		setError(null);

		if (!getBarcodeDetector()) {
			setError("Barcode scanner is not supported on this browser.");
			return;
		}

		openingRef.current = true;
		cancelRef.current = false;

		try {
			const nextStream = await navigator.mediaDevices.getUserMedia({
				video: { facingMode: { ideal: "environment" } },
			});

			if (cancelRef.current) {
				for (const track of nextStream.getTracks()) {
					track.stop();
				}
				return;
			}

			streamRef.current = nextStream;
			setStream(nextStream);
		} catch {
			setError("Unable to access camera.");
			stop();
		} finally {
			openingRef.current = false;
		}
	}, [stop]);

	useEffect(() => {
		const video = videoRef.current;
		const detectorConstructor = getBarcodeDetector();

		if (!(stream && video && detectorConstructor)) {
			return;
		}

		video.srcObject = stream;
		void video.play().catch(() => {
			setError("Unable to access camera.");
		});

		const detector = new detectorConstructor();
		let frameId: number | null = null;
		// A worker who taps Stop Scan and Scan Tag again on a tag that will not read can
		// do it inside one decode, and starting clears cancelRef. Without a flag this
		// loop owns, that decode resolves into a frame the new session cannot cancel and
		// two detectors then read every frame off the same video for the rest of the shift.
		let alive = true;

		const detect = async () => {
			if (!alive || cancelRef.current) {
				return;
			}

			try {
				const codes = await detector.detect(video);
				const rawValue = codes.find((item) => !!item.rawValue)?.rawValue;

				if (rawValue) {
					// A stop landing during the decode must not still yank the worker off
					// the queue on a scan they cancelled.
					if (!alive || cancelRef.current) {
						return;
					}

					stop();
					onDetectRef.current(rawValue);
					return;
				}
			} catch {
				// ignore frame-level errors
			}

			if (!alive) {
				return;
			}

			frameId = requestAnimationFrame(() => {
				void detect();
			});
		};

		frameId = requestAnimationFrame(() => {
			void detect();
		});

		return () => {
			alive = false;
			if (frameId !== null) {
				cancelAnimationFrame(frameId);
			}
			if (video.srcObject === stream) {
				video.srcObject = null;
			}
		};
	}, [stream, stop]);

	// The Find button and every queue row navigate away without stopping the scanner.
	useEffect(() => stop, [stop]);

	return {
		videoRef,
		isScanning: stream !== null,
		error,
		start,
		stop,
	};
};
