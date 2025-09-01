import { Hono } from 'hono';
import categoriesRoutes from '@/routes/admin/categories';
import paymentMethodsRoutes from '@/routes/admin/payment-methods';
import customerRoutes from '@/routes/admin/customer';
import productsRoutes from '@/routes/admin/products';
import usersRoutes from '@/routes/admin/users';
    import servicesRoutes from '@/routes/admin/services';
import storeRoutes from '@/routes/admin/stores';

const app = new Hono()
  .route('/stores', storeRoutes)
  .route('/customers', customerRoutes)
  .route('/users', usersRoutes)
  .route('/services', servicesRoutes)
  .route('/products', productsRoutes)
  .route('/categories', categoriesRoutes)
  .route('/payment-methods', paymentMethodsRoutes)
  .get('/test', (c) => {
    const _jwtPayload = c.get('jwtPayload');

    return c.text('masuk');
  });

export default app;
