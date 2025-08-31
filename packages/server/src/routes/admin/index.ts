import { Hono } from 'hono';
import categoriesRoutes from '@/routes/admin/categories';
import customerRoutes from '@/routes/admin/customer';
import productsRoutes from '@/routes/admin/products';
import servicesRoutes from '@/routes/admin/services';
import storeRoutes from '@/routes/admin/stores';
import usersRoutes from '@/routes/admin/users';

const app = new Hono()
  .route('/stores', storeRoutes)
  .route('/customers', customerRoutes)
  .route('/users', usersRoutes)
  .route('/services', servicesRoutes)
  .route('/products', productsRoutes)
  .route('/categories', categoriesRoutes)
  .get('/test', (c) => {
    const _jwtPayload = c.get('jwtPayload');

    return c.text('masuk');
  });

export default app;
