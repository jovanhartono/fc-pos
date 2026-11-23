// Saves a file with the current screen kept open behind it: a click on an
// anchor is the one way a browser starts a download without leaving the page.
export const triggerDownload = (href: string, filename?: string): void => {
  const link = document.createElement("a");
  link.href = href;
  if (filename) {
    link.download = filename;
  }
  document.body.append(link);
  link.click();
  link.remove();
};

export const downloadBlob = (blob: Blob, filename: string): void => {
  const url = URL.createObjectURL(blob);
  triggerDownload(url, filename);
  // A slow phone or Firefox may not have read the file yet when the click
  // returns; FileSaver.js waits 40s for the same reason.
  setTimeout(() => URL.revokeObjectURL(url), 40_000);
};
