import express, { Application } from 'express';
import swaggerUi from 'swagger-ui-express';
import mongoose from 'mongoose';
import { swaggerSpec } from './config/swagger';
import { createApiRouter } from './routes/api.routes';
import { requestLogger } from './middlewares/requestLogger.middleware';
import { notFound, errorHandler } from './middlewares/errorHandler.middleware';
import { ProductService } from './services/ProductService';
import { ProductController } from './controllers/ProductController';

export function createApp(_connection?: typeof mongoose): Application {
  const app = express();

  // Middlewares globales
  app.use(express.json());
  app.use(requestLogger);

  // Documentación Swagger
  app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec));

  // Rutas de la API
  app.use('/api', createApiRouter());

  // Manejo de rutas no encontradas y errores (este orden es obligatorio)
  app.use(notFound);
  app.use(errorHandler);

  return app;
}
