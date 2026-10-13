import { Router } from 'express';
import { authenticate } from '../middlewares/authenticate.middleware';
import { validateListProductsQuery } from '../validators/product.validator';
import { ProductController } from '../controllers/ProductController';
import { ProductService } from '../services/ProductService';

export function createApiRouter(): Router {
  const router = Router();

  // Instanciación de servicios y controladores (composition root parcial;
  // el root principal está en createApp)
  const productService = new ProductService();
  const productController = new ProductController(productService);

  // GET /api/products — catálogo de productos activos
  router.get(
    '/products',
    authenticate,
    validateListProductsQuery,
    productController.listActive
  );

  return router;
}
