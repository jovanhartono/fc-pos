import { HTTPException } from 'hono/http-exception';
import { StatusCodes } from 'http-status-codes';
import app from '@/app';
import { adminMiddleware } from '@/middlewares/admin';
import adminRoutes from '@/routes/admin';
import authRoutes from '@/routes/auth';
import { failure } from '@/utils/http';

app.use('/admin/*', adminMiddleware);

const router = app.route('/auth', authRoutes).route('/admin', adminRoutes);

// error handling
app.onError((err, c) => {
  if (err instanceof HTTPException) {
    return c.json(failure(err.message, err.cause), err.status);
  }

  if (typeof err.cause === 'object' && err.cause && 'detail' in err.cause) {
    let statusCode: StatusCodes = StatusCodes.INTERNAL_SERVER_ERROR;
    if ('code' in err.cause) {
      switch (err.cause.code) {
        case '23505': {
          statusCode = StatusCodes.CONFLICT;
          break;
        }

        default: {
          statusCode = StatusCodes.INTERNAL_SERVER_ERROR;
        }
      }
    }

    return c.json(failure(err.cause.detail as string), statusCode);
  }

  // console.error(err);
  return c.json(failure(err.message), StatusCodes.INTERNAL_SERVER_ERROR);
});

export type AppType = typeof router;
export default {
  fetch: app.fetch,
  port: '8000',
};
