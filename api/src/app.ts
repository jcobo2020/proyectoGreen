import express, { Application } from 'express';
import swaggerUi from 'swagger-ui-express';
import mongoose from 'mongoose';
import { swaggerSpec } from './config/swagger';
import { createApiRouter } from './routes/api.routes';
import { requestLogger } from './middlewares/requestLogger.middleware';
import { notFound, errorHandler } from './middlewares/errorHandler.middleware';
import { withErrorDetails } from './middlewares/withErrorDetails.middleware';
import { authenticate } from './middlewares/authenticate.middleware';
import { ProductService } from './services/ProductService';
import { OrderService } from './services/OrderService';
import { MongoUnitOfWork } from './lib/MongoUnitOfWork';
import { MongoOrderRepository } from './lib/MongoOrderRepository';
import { ProductController } from './controllers/ProductController';
import { OrderController } from './controllers/OrderController';
import { CustomerService } from './services/CustomerService';
import { CustomerController } from './controllers/CustomerController';
import { ExecutiveService } from './services/ExecutiveService';
import { ExecutiveController } from './controllers/ExecutiveController';

export interface AppDeps {
  orderController?: OrderController;
  productController?: ProductController;
  customerController?: CustomerController;
  executiveController?: ExecutiveController;
}

export function createApp(_connection?: typeof mongoose, deps?: AppDeps): Application {
  const app = express();

  // Middlewares globales. El log por petición va primero: también registra las peticiones cuyo
  // cuerpo no se puede parsear. /api/customers se marca y se autentica ANTES de express.json():
  // sin un token válido responde 401 aunque el cuerpo no sea un JSON válido (RN-AUTH: la
  // autenticación va antes que la validación), y un JSON mal formado con token responde 400 con
  // details (RN-12, R4-SEG-3), sin cambiar los errores de /api/orders (R4-SEG-4).
  app.use(requestLogger);
  app.use('/api/customers', withErrorDetails, authenticate);
  // /api/executives, igual que /api/customers: todo error viaja con details (vacío si no hay,
  // R4-SEG-3 de GREEN-H2-API-EJECUTIVOS-001) y se autentica antes que nada, también un método no
  // declarado o una subruta: sin un token válido, 401 y no 404 (toda ruta de /api exige usuario).
  app.use('/api/executives', withErrorDetails, authenticate);
  app.use(express.json());

  // Composition root: construir servicios y controladores una sola vez
  const productService = new ProductService();
  const unitOfWork = new MongoUnitOfWork();
  const orderRepository = new MongoOrderRepository();
  const orderService = new OrderService(productService, unitOfWork, orderRepository);
  const productController = deps?.productController ?? new ProductController(productService);
  const orderController = deps?.orderController ?? new OrderController(orderService);
  const customerController = deps?.customerController ?? new CustomerController(new CustomerService());
  const executiveController =
    deps?.executiveController ?? new ExecutiveController(new ExecutiveService());

  // Documentación Swagger
  app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec));

  // Rutas de la API
  app.use('/api', createApiRouter({ productController, orderController, customerController, executiveController }));

  // Manejo de rutas no encontradas y errores (este orden es obligatorio)
  app.use(notFound);
  app.use(errorHandler);

  return app;
}
