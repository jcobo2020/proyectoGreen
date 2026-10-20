import express, { Application } from 'express';
import swaggerUi from 'swagger-ui-express';
import mongoose from 'mongoose';
import { swaggerSpec } from './config/swagger';
import { createApiRouter } from './routes/api.routes';
import { requestLogger } from './middlewares/requestLogger.middleware';
import { notFound, errorHandler } from './middlewares/errorHandler.middleware';
import { ProductService } from './services/ProductService';
import { OrderService } from './services/OrderService';
import { MongoUnitOfWork } from './lib/MongoUnitOfWork';
import { MongoOrderRepository } from './lib/MongoOrderRepository';
import { ProductController } from './controllers/ProductController';
import { OrderController } from './controllers/OrderController';
import { ExecutiveService } from './services/ExecutiveService';
import { ExecutiveController } from './controllers/ExecutiveController';

export interface AppDeps {
  orderController?: OrderController;
  productController?: ProductController;
  executiveController?: ExecutiveController;
}

export function createApp(_connection?: typeof mongoose, deps?: AppDeps): Application {
  const app = express();

  // Middlewares globales
  app.use(express.json());
  app.use(requestLogger);

  // Composition root: construir servicios y controladores una sola vez
  const productService = new ProductService();
  const unitOfWork = new MongoUnitOfWork();
  const orderRepository = new MongoOrderRepository();
  const orderService = new OrderService(productService, unitOfWork, orderRepository);
  const productController = deps?.productController ?? new ProductController(productService);
  const orderController = deps?.orderController ?? new OrderController(orderService);
  const executiveController =
    deps?.executiveController ?? new ExecutiveController(new ExecutiveService());

  // Documentación Swagger
  app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec));

  // Rutas de la API
  app.use('/api', createApiRouter({ productController, orderController, executiveController }));

  // Manejo de rutas no encontradas y errores (este orden es obligatorio)
  app.use(notFound);
  app.use(errorHandler);

  return app;
}
