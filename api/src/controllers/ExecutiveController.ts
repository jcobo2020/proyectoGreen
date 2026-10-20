import { Request, Response, NextFunction } from 'express';
import { ExecutiveService } from '../services/ExecutiveService';

/**
 * @swagger
 * tags:
 *   name: Executives
 *   description: Ejecutivos comerciales que se asignan a un cliente
 */

/**
 * @swagger
 * components:
 *   schemas:
 *     PublicExecutive:
 *       type: object
 *       description: Opción de ejecutivo; el cliente guarda value (_id), nunca el label
 *       properties:
 *         value:
 *           type: string
 *           description: _id del ejecutivo (ObjectId)
 *           example: 6650f1c2a1b2c3d4e5f60718
 *         label:
 *           type: string
 *           description: name del ejecutivo
 *       required: [value, label]
 */

/**
 * @swagger
 * /api/executives:
 *   get:
 *     summary: Ejecutivos activos como opciones
 *     description: >
 *       Devuelve los ejecutivos activos como opciones [{value, label}], ordenados por nombre.
 *       Es una lista corta, sin paginar; vacía si no hay ejecutivos activos.
 *       Cualquier usuario autenticado puede leerla (sin permisos por rol).
 *     tags: [Executives]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Opciones de ejecutivos activos (lista vacía si no hay)
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 $ref: '#/components/schemas/PublicExecutive'
 *       401:
 *         description: Sin un token válido
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/UnauthorizedError'
 */
export class ExecutiveController {
  constructor(private readonly executiveService: ExecutiveService) {}

  listActive = async (_req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const options = await this.executiveService.listActive();
      res.status(200).json(options);
    } catch (err) {
      next(err);
    }
  };
}
