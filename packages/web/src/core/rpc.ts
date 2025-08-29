import { rpcFn } from '@fresclean/api/rpc'

export const rpc = rpcFn('http://localhost:8000/', {
  headers: {
    Authorization: `Bearer ${localStorage.getItem('jwt')}`,
  },
})
