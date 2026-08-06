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
	// Skip the chooser and go straight to the viewfinder. For intake flows where a
	// live photo is the expected answer and the gallery is the exception — the
	// picker is still in the shutter row. See SinglePhotoCaptureDialog.
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

// Capture-only single-photo dialog. Reuses the full-screen camera/picker/preview
// UI but, instead of uploading, hands the picked File back to the caller — for
// flows where the target row does not exist yet (POS drop-off photo before
// checkout) or where the upload is bundled with other data (pickup event).
//
// Opens on the viewfinder by default: drop-off is an intake action, so a live
// photo of the items in front of the cashier is the expected answer. It is no
// longer the only one — a store whose iPad camera is refused or broken can still
// finish the drop-off from the gallery. Pass autoOpenCamera={false} for flows
// that should land on the chooser instead (e.g. pickup).
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
