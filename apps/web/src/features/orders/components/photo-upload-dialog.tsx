import { PhotoCaptureProvider } from "@/features/orders/components/photo-capture-context";
import { PhotoCaptureDialog } from "@/features/orders/components/photo-capture-dialog";
import type { PhotoUploader } from "@/features/orders/utils/photo-upload";

interface PhotoUploadDialogProps {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	title: string;
	badgeLabel?: string;
	uploader?: PhotoUploader;
	onUploaded?: () => Promise<void>;
	// For intake, where a live photo is expected; the gallery picker stays in
	// the shutter row.
	autoOpenCamera?: boolean;
}

export const PhotoUploadDialog = (props: PhotoUploadDialogProps) => (
	<PhotoCaptureProvider {...props} variant="batch-upload">
		<PhotoCaptureDialog />
	</PhotoCaptureProvider>
);

export const SinglePhotoUploadDialog = (props: PhotoUploadDialogProps) => (
	<PhotoCaptureProvider {...props} variant="single-upload">
		<PhotoCaptureDialog />
	</PhotoCaptureProvider>
);

interface SinglePhotoCaptureDialogProps {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	title: string;
	badgeLabel?: string;
	autoOpenCamera?: boolean;
	onCapture: (file: File) => void;
}

// Hands the File back instead of uploading: the POS Drop-off photo has no Order
// to save against before checkout, and a pickup sends it with the handover.
// A Store whose iPad camera is broken can still pick from the gallery.
export const SinglePhotoCaptureDialog = ({
	onCapture,
	autoOpenCamera = true,
	...props
}: SinglePhotoCaptureDialogProps) => (
	<PhotoCaptureProvider
		{...props}
		variant="single-capture"
		autoOpenCamera={autoOpenCamera}
		onCapture={(files) => {
			const [file] = files;
			if (file) {
				onCapture(file);
			}
		}}
	>
		<PhotoCaptureDialog />
	</PhotoCaptureProvider>
);
