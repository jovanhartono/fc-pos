import { hc } from 'hono/client';
import type { AppType } from '@/index';

// eslint-disable-next-line @typescript-eslint/no-unused-vars
const client = hc<AppType>(
  ''
  // headers: {
  //   Authorization: `Bearer ${localStorage.getItem('jwt')}`,
  // },
);
type Client = typeof client;
export const rpcFn = (...args: Parameters<typeof hc>): Client =>
  hc<AppType>(...args);
