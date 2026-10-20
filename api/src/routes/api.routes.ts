import { Router } from 'express';
import { authenticate } from '../middlewares/authenticate.middleware';
import { validateListProductsQuery } from '../validators/product.validator';
import {
  validateCreateOrderQuery,
  validateCreateOrderBody,
  validateListOrdersQuery,
  validateOrderIdQuery,
} from '../validators/order.validator';
import {
  validateCreateCustomerBody,
  validateListCustomersQuery,
  validateUpdateCustomerBody,
} from '../validators/customer.validator';
import { ProductController } from '../controllers/ProductController';
import { OrderController } from '../controllers/OrderController';
import { CustomerController } from '../controllers/CustomerController';

export interface ApiRouterDeps {
  productController: ProductController;
  orderController: OrderController;
  customerController: CustomerController;
}

/**
 * Crea el router de la API.
 * Todos los controladores se reciben como parámetro desde el composition root
 * (createApp en app.ts): este módulo no instancia servicios ni repositorios.
 */
export function createApiRouter(deps: ApiRouterDeps): Router {
  const router = Router();

  const { productController, orderController, customerController } = deps;

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

  // /api/customers: todo error lleva details (R4-SEG-3); la marca la pone app.ts antes de express.json()

  // GET /api/customers — listado paginado de clientes
  router.get('/customers', authenticate, validateListCustomersQuery, customerController.list);

  // POST /api/customers — alta de un cliente
  router.post('/customers', authenticate, validateCreateCustomerBody, customerController.create);

  // GET /api/customers/:id — ficha de un cliente
  router.get('/customers/:id', authenticate, customerController.getById);

  // PUT /api/customers/:id — edición de un cliente
  router.put('/customers/:id', authenticate, validateUpdateCustomerBody, customerController.update);

  return router;
}
