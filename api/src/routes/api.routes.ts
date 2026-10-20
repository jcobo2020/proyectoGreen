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
import { ExecutiveController } from '../controllers/ExecutiveController';

export interface ApiRouterDeps {
  productController: ProductController;
  orderController: OrderController;
  customerController: CustomerController;
  executiveController: ExecutiveController;
}

/**
 * Crea el router de la API.
 * Todos los controladores se reciben como parámetro desde el composition root
 * (createApp en app.ts): este módulo no instancia servicios ni repositorios.
 */
export function createApiRouter(deps: ApiRouterDeps): Router {
  const router = Router();

  const { productController, orderController, customerController, executiveController } = deps;

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

  // /api/customers: app.ts monta withErrorDetails y authenticate para todo /api/customers ANTES
  // de express.json(). La cadena de cada ruta es la de la plantilla —authenticate → validación →
  // controller—, con la autenticación delante del parseo del cuerpo (RN-AUTH): sin un token
  // válido, 401 aunque el cuerpo no sea un JSON válido. Aquí van la validación y el controller.

  // GET /api/customers — listado paginado de clientes
  router.get('/customers', validateListCustomersQuery, customerController.list);

  // POST /api/customers — alta de un cliente
  router.post('/customers', validateCreateCustomerBody, customerController.create);

  // GET /api/customers/:id — ficha de un cliente
  router.get('/customers/:id', customerController.getById);

  // PUT /api/customers/:id — edición de un cliente
  router.put('/customers/:id', validateUpdateCustomerBody, customerController.update);

  // GET /api/executives — ejecutivos activos como opciones (sin permisos por rol). Como en
  // /api/customers, app.ts monta withErrorDetails y authenticate para todo /api/executives.
  router.get('/executives', executiveController.listActive);

  return router;
}
