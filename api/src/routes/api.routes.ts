import { Router } from 'express';
import { authenticate } from '../middlewares/authenticate.middleware';
import { validateListProductsQuery } from '../validators/product.validator';
import {
  validateCreateOrderQuery,
  validateCreateOrderBody,
  validateListOrdersQuery,
  validateOrderIdQuery,
} from '../validators/order.validator';
import { ProductController } from '../controllers/ProductController';
import { OrderController } from '../controllers/OrderController';
import { ExecutiveController } from '../controllers/ExecutiveController';

export interface ApiRouterDeps {
  productController: ProductController;
  orderController: OrderController;
  executiveController: ExecutiveController;
}

/**
 * Crea el router de la API.
 * Todos los controladores se reciben como parámetro desde el composition root
 * (createApp en app.ts): este módulo no instancia servicios ni repositorios.
 */
export function createApiRouter(deps: ApiRouterDeps): Router {
  const router = Router();

  const { productController, orderController, executiveController } = deps;

  // GET /api/products — catálogo de productos activos
  router.get(
    '/products',
    authenticate,
    validateListProductsQuery,
    productController.listActive
  );

  // POST /api/orders — crear pedido
  router.post(
    '/orders',
    authenticate,
    validateCreateOrderQuery,
    validateCreateOrderBody,
    orderController.createOrder
  );

  // GET /api/orders — listar pedidos del cliente (ANTES que GET /api/orders/:id)
  router.get(
    '/orders',
    authenticate,
    validateListOrdersQuery,
    orderController.listOrders
  );

  // GET /api/orders/:id — detalle de un pedido
  router.get(
    '/orders/:id',
    authenticate,
    validateOrderIdQuery,
    orderController.getOrderById
  );

  // POST /api/orders/:id/confirm — confirmar un pedido
  router.post(
    '/orders/:id/confirm',
    authenticate,
    validateOrderIdQuery,
    orderController.confirmOrder
  );

  // GET /api/executives — ejecutivos activos como opciones (sin permisos por rol)
  router.get('/executives', authenticate, executiveController.listActive);

  return router;
}
