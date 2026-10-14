import { Request, Response, NextFunction } from 'express';
import mongoose from 'mongoose';
import { OrderService } from '../services/OrderService';
import { InvalidOrderIdError } from '../lib/errors';

/**
 * @swagger
 * tags:
 *   name: Orders
 *   description: Gestión de pedidos del cliente
 */

/**
 * @swagger
 * components:
 *   schemas:
 *     PublicOrderItem:
 *       type: object
 *       properties:
 *         productId:
 *           type: string
 *           description: ID del producto
 *         sku:
 *           type: string
 *           description: Código del producto
 *         name:
 *           type: string
 *           description: Nombre del producto
 *         unitPrice:
 *           type: number
 *           format: float
 *           description: Precio unitario (2 decimales)
 *         quantity:
 *           type: integer
 *           description: Cantidad pedida
 *         lineTotal:
 *           type: number
 *           format: float
 *           description: Total de la línea (unitPrice × quantity)
 *       required: [productId, sku, name, unitPrice, quantity, lineTotal]
 *     PublicOrder:
 *       type: object
 *       properties:
 *         id:
 *           type: string
 *           description: Identificador único del pedido
 *         code:
 *           type: string
 *           description: Código legible del pedido (ORD-AAAAMMDD-XXXXXX)
 *         status:
 *           type: string
 *           enum: [pending_confirmation, confirmed]
 *           description: Estado actual del pedido
 *         items:
 *           type: array
 *           items:
 *             $ref: '#/components/schemas/PublicOrderItem'
 *         total:
 *           type: number
 *           format: float
 *           description: Total del pedido
 *         createdAt:
 *           type: string
 *           format: date-time
 *         updatedAt:
 *           type: string
 *           format: date-time
 *         confirmedAt:
 *           type: string
 *           format: date-time
 *           description: Presente solo si el pedido está confirmado
 *       required: [id, code, status, items, total, createdAt, updatedAt]
 *     OrderForbiddenError:
 *       type: object
 *       properties:
 *         code:
 *           type: string
 *           example: ORDER_FORBIDDEN
 *         message:
 *           type: string
 *       required: [code, message]
 *     OrderNotFoundError:
 *       type: object
 *       properties:
 *         code:
 *           type: string
 *           example: ORDER_NOT_FOUND
 *         message:
 *           type: string
 *       required: [code, message]
 *     ProductNotFoundError:
 *       type: object
 *       properties:
 *         code:
 *           type: string
 *           example: PRODUCT_NOT_FOUND
 *         message:
 *           type: string
 *         details:
 *           type: array
 *           items:
 *             type: object
 *             properties:
 *               productId:
 *                 type: string
 *       required: [code, message, details]
 *     InsufficientStockError:
 *       type: object
 *       properties:
 *         code:
 *           type: string
 *           example: INSUFFICIENT_STOCK
 *         message:
 *           type: string
 *         details:
 *           type: array
 *           items:
 *             type: object
 *             properties:
 *               productId:
 *                 type: string
 *               requested:
 *                 type: integer
 *               available:
 *                 type: integer
 *       required: [code, message, details]
 *     InvalidOrderIdError:
 *       type: object
 *       properties:
 *         code:
 *           type: string
 *           example: INVALID_ORDER_ID
 *         message:
 *           type: string
 *       required: [code, message]
 */

/**
 * @swagger
 * /api/orders:
 *   post:
 *     summary: Crea un pedido del cliente autenticado
 *     description: >
 *       Crea un pedido en estado pending_confirmation con precios del catálogo.
 *       No se reserva stock al crear; la reserva ocurre al confirmar.
 *     tags: [Orders]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [items]
 *             properties:
 *               items:
 *                 type: array
 *                 minItems: 1
 *                 maxItems: 50
 *                 items:
 *                   type: object
 *                   required: [productId, quantity]
 *                   properties:
 *                     productId:
 *                       type: string
 *                       description: ObjectId del producto
 *                     quantity:
 *                       type: integer
 *                       minimum: 1
 *                       maximum: 99
 *     responses:
 *       201:
 *         description: Pedido creado
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/PublicOrder'
 *       400:
 *         description: Body inválido
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
 *       404:
 *         description: Algún productId no existe o no está activo
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ProductNotFoundError'
 *       409:
 *         description: Alguna línea pide más de lo disponible
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/InsufficientStockError'
 *       500:
 *         description: Fallo no previsto
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/InternalError'
 */

/**
 * @swagger
 * /api/orders:
 *   get:
 *     summary: Pedidos del cliente autenticado
 *     description: >
 *       Devuelve los pedidos del cliente autenticado con su último estado,
 *       ordenados por createdAt descendente.
 *     tags: [Orders]
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
 *           maximum: 50
 *           default: 20
 *         description: Tamaño de página (1-50)
 *     responses:
 *       200:
 *         description: Lista de pedidos del cliente
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 items:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/PublicOrder'
 *                 total:
 *                   type: integer
 *                 page:
 *                   type: integer
 *                 pageSize:
 *                   type: integer
 *       400:
 *         description: page o pageSize fuera de rango o parámetro desconocido
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
 *       500:
 *         description: Fallo no previsto
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/InternalError'
 */

/**
 * @swagger
 * /api/orders/{id}:
 *   get:
 *     summary: Detalle de un pedido del cliente autenticado
 *     tags: [Orders]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: ObjectId de 24 caracteres hexadecimales
 *     responses:
 *       200:
 *         description: Detalle del pedido
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/PublicOrder'
 *       400:
 *         description: id sin formato ObjectId
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/InvalidOrderIdError'
 *       401:
 *         description: Sin token válido
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/UnauthorizedError'
 *       403:
 *         description: El pedido es de otro cliente
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/OrderForbiddenError'
 *       404:
 *         description: No existe el pedido
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/OrderNotFoundError'
 *       500:
 *         description: Fallo no previsto
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/InternalError'
 */

/**
 * @swagger
 * /api/orders/{id}/confirm:
 *   post:
 *     summary: Confirma un pedido pendiente del cliente
 *     description: >
 *       Confirma un pedido pending_confirmation y descuenta la disponibilidad de forma atómica.
 *       No lleva cuerpo. Es idempotente: confirmar un pedido ya confirmado devuelve 200
 *       con el pedido, sin volver a descontar.
 *     tags: [Orders]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: ObjectId de 24 caracteres hexadecimales
 *     responses:
 *       200:
 *         description: Pedido confirmado (o ya estaba confirmado)
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/PublicOrder'
 *       400:
 *         description: id sin formato ObjectId
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/InvalidOrderIdError'
 *       401:
 *         description: Sin token válido
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/UnauthorizedError'
 *       403:
 *         description: El pedido es de otro cliente
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/OrderForbiddenError'
 *       404:
 *         description: No existe el pedido
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/OrderNotFoundError'
 *       409:
 *         description: Stock insuficiente
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/InsufficientStockError'
 *       500:
 *         description: Fallo no previsto
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/InternalError'
 */
export class OrderController {
  constructor(private readonly orderService: OrderService) {}

  createOrder = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const customerId = req.customerId!;
      const { items } = req.body as { items: Array<{ productId: string; quantity: number }> };
      const order = await this.orderService.create({ customerId, items });
      res.status(201).json(order);
    } catch (err) {
      next(err);
    }
  };

  listOrders = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const customerId = req.customerId!;
      const page =
        req.query['page'] !== undefined ? parseInt(req.query['page'] as string, 10) : 1;
      const pageSize =
        req.query['pageSize'] !== undefined
          ? parseInt(req.query['pageSize'] as string, 10)
          : 20;
      const result = await this.orderService.list({ customerId, page, pageSize });
      res.status(200).json(result);
    } catch (err) {
      next(err);
    }
  };

  getOrderById = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const customerId = req.customerId!;
      const { id } = req.params;
      if (!id || !mongoose.Types.ObjectId.isValid(id)) {
        return next(new InvalidOrderIdError());
      }
      const order = await this.orderService.getById(id, customerId);
      res.status(200).json(order);
    } catch (err) {
      next(err);
    }
  };

  confirmOrder = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const customerId = req.customerId!;
      const { id } = req.params;
      if (!id || !mongoose.Types.ObjectId.isValid(id)) {
        return next(new InvalidOrderIdError());
      }
      const order = await this.orderService.confirm(id, customerId);
      res.status(200).json(order);
    } catch (err) {
      next(err);
    }
  };
}
