import express, { Application } from 'express';
import swaggerUi from 'swagger-ui-express';
import mongoose from 'mongoose';
import { swaggerSpec } from './config/swagger';
import { createApiRouter } from './routes/api.routes';
import { requestLogger } from './middlewares/requestLogger.middleware';
import { notFound, errorHandler } from './middlewares/errorHandler.middleware';
import { withErrorDetails } from './middlewares/withErrorDetails.middleware';
import { ProductService } from './services/ProductService';
import { OrderService } from './services/OrderService';
import { MongoUnitOfWork } from './lib/MongoUnitOfWork';
import { MongoOrderRepository } from './lib/MongoOrderRepository';
import { ProductController } from './controllers/ProductController';
import { OrderController } from './controllers/OrderController';
import { CustomerService } from './services/CustomerService';
import { CustomerController } from './controllers/CustomerController';

export interface AppDeps {
  orderController?: OrderController;
  productController?: ProductController;
  customerController?: CustomerController;
}

export function createApp(_connection?: typeof mongoose, deps?: AppDeps): Application {
  const app = express();

  // Middlewares globales. El log por petición va primero: también registra las peticiones cuyo
  // cuerpo no se puede parsear. /api/customers se marca ANTES de express.json(): un JSON mal
  // formado también responde con details (RN-12, R4-SEG-3) sin cambiar los errores de /api/orders.
  app.use(requestLogger);
  app.use('/api/customers', withErrorDetails);
  app.use(express.json());

  // Composition root: construir servicios y controladores una sola vez
  const productService = new ProductService();
  const unitOfWork = new MongoUnitOfWork();
  const orderRepository = new MongoOrderRepository();
  const orderService = new OrderService(productService, unitOfWork, orderRepository);
  const productController = deps?.productController ?? new ProductController(productService);
  const orderController = deps?.orderController ?? new OrderController(orderService);
  const customerController = deps?.customerController ?? new CustomerController(new CustomerService());

  // Documentación Swagger
  app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec));

  // Rutas de la API
  app.use('/api', createApiRouter({ productController, orderController, customerController }));

  // Manejo de rutas no encontradas y errores (este orden es obligatorio)
  app.use(notFound);
  app.use(errorHandler);

  return app;
}
