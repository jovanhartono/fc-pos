// The one place the public /track URL is built, so every link a Customer gets
// opens the same page.
export const buildTrackingUrl = (code: string, phone: string): string => {
  const origin = typeof window === "undefined" ? "" : window.location.origin;
  const params = new URLSearchParams({ code, phone });
  return `${origin}/track?${params.toString()}`;
};
