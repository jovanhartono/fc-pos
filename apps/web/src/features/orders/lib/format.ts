import dayjs from "dayjs";

export const formatOrderDateTime = (value: string): string =>
	dayjs(value).format("DD MMM YYYY, HH:mm");
