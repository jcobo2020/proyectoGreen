import { Request, Response, NextFunction } from 'express';
import { ProductService } from '../services/ProductService';

/**
 * @swagger
 * tags:
 *   name: Products
 *   description: Catálogo de productos
 */

/**
 * @swagger
 * /api/products:
 *   get:
 *     summary: Catálogo de productos activos
 *     description: >
 *       Devuelve la lista paginada de productos activos con precio y disponibilidad,
 *       para componer el pedido en /orders/new. Ordenado por name y después por sku.
 *     tags: [Products]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           minimum: 1
 *           default: 1
 *         description: Número de página (≥ 1)
 *       - in: query
 *         name: pageSize
 *         schema:
 *           type: integer
 *           minimum: 1
 *           maximum: 100
 *           default: 50
 *         description: Tamaño de página (1-100)
 *     responses:
 *       200:
 *         description: Lista de productos activos
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 items:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/PublicProduct'
 *                 total:
 *                   type: integer
 *                   description: Total de productos activos
 *                 page:
 *                   type: integer
 *                   description: Página actual
 *                 pageSize:
 *                   type: integer
 *                   description: Tamaño de página
 *       400:
 *         description: page o pageSize fuera de rango o no enteros
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ValidationError'
 *       401:
 *         description: Sin token válido
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/UnauthorizedError'
 */
export class ProductController {
  constructor(private readonly productService: ProductService) {}

  listActive = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const page = req.query['page'] !== undefined ? parseInt(req.query['page'] as string, 10) : 1;
      const pageSize =
        req.query['pageSize'] !== undefined
          ? parseInt(req.query['pageSize'] as string, 10)
          : 50;

      const result = await this.productService.listActive({ page, pageSize });
      res.status(200).json(result);
    } catch (err) {
      next(err);
    }
  };
}
