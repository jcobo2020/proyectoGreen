import { Request, Response, NextFunction } from 'express';
import { CustomerService, CreateCustomerInput, UpdateCustomerInput } from '../services/CustomerService';

/**
 * @swagger
 * tags:
 *   name: Customers
 *   description: Clientes del CRM (personas jurídicas y naturales)
 */

/**
 * @swagger
 * components:
 *   schemas:
 *     PublicCustomer:
 *       type: object
 *       properties:
 *         id: { type: string, description: Identificador del cliente }
 *         code: { type: string, description: 'Código legible PRO-AAAA-NNN', example: PRO-2026-001 }
 *         personType: { type: string, enum: [legal, natural], description: Persona jurídica o natural }
 *         idType: { type: string, enum: [cedula, ruc, passport], description: Tipo de identificación }
 *         idNumber: { type: string, description: Número de identificación (único) }
 *         legalName: { type: string, description: Razón social (persona jurídica) }
 *         firstNames: { type: string, description: Nombres (persona natural) }
 *         lastNames: { type: string, description: Apellidos (persona natural) }
 *         email: { type: string, format: email }
 *         mobilePhone: { type: string }
 *         city: { type: string }
 *         address: { type: string }
 *         sourceChannel: { type: string, description: Canal de origen }
 *         accountExecutiveId: { type: string, description: _id del ejecutivo asignado }
 *         notes: { type: string }
 *         contactName: { type: string, description: 'Contacto principal: nombre' }
 *         contactTitle: { type: string, description: 'Contacto principal: cargo' }
 *         contactEmail: { type: string, format: email, description: 'Contacto principal: correo' }
 *         createdAt: { type: string, format: date-time }
 *         updatedAt: { type: string, format: date-time }
 *       required: [id, code, personType, idType, idNumber, email, sourceChannel, createdAt, updatedAt]
 *     PublicCustomerDetail:
 *       allOf:
 *         - $ref: '#/components/schemas/PublicCustomer'
 *         - type: object
 *           properties:
 *             accountExecutive:
 *               type: string
 *               description: Nombre del ejecutivo asignado (vacío si no tiene); se conserva aunque el ejecutivo se desactive
 *     PublicCustomerListItem:
 *       allOf:
 *         - $ref: '#/components/schemas/PublicCustomerDetail'
 *         - type: object
 *           properties:
 *             openOpportunities: { type: integer, description: Número de oportunidades abiertas del cliente }
 *             openValue: { type: number, description: Suma del valor de sus oportunidades abiertas }
 *     CustomerWriteFields:
 *       type: object
 *       properties:
 *         legalName: { type: string }
 *         firstNames: { type: string }
 *         lastNames: { type: string }
 *         email: { type: string, format: email }
 *         mobilePhone: { type: string }
 *         city: { type: string }
 *         address: { type: string }
 *         sourceChannel: { type: string }
 *         accountExecutiveId: { type: string, description: _id de un ejecutivo activo }
 *         notes: { type: string }
 *         contactName: { type: string }
 *         contactTitle: { type: string }
 *         contactEmail: { type: string, format: email }
 *     CreateCustomerBody:
 *       allOf:
 *         - $ref: '#/components/schemas/CustomerWriteFields'
 *         - type: object
 *           required: [personType, idType, idNumber, email]
 *           properties:
 *             personType: { type: string, enum: [legal, natural] }
 *             idType: { type: string, enum: [cedula, ruc, passport] }
 *             idNumber: { type: string, description: 'RUC: 13 dígitos terminados en 001 · cédula: 10 dígitos · pasaporte: 5 a 20 letras o dígitos' }
 *     UpdateCustomerBody:
 *       allOf:
 *         - $ref: '#/components/schemas/CustomerWriteFields'
 *         - type: object
 *           required: [email]
 *           description: idType, idNumber y personType no cambian tras el alta y se ignoran si se envían
 *     CustomerNotFoundError:
 *       type: object
 *       properties:
 *         code: { type: string, example: CUSTOMER_NOT_FOUND }
 *         message: { type: string, example: No existe un cliente con ese id }
 *       required: [code, message]
 *     CustomerDuplicateError:
 *       type: object
 *       properties:
 *         code: { type: string, example: CUSTOMER_DUPLICATE }
 *         message: { type: string, example: Ya existe un cliente con esta identificación. }
 *         details:
 *           type: array
 *           items:
 *             type: object
 *             properties:
 *               field: { type: string, example: idNumber }
 *               message: { type: string }
 *       required: [code, message, details]
 */

/**
 * @swagger
 * /api/customers:
 *   get:
 *     summary: Listado paginado de clientes
 *     description: >
 *       Ordenado por fecha de creación descendente con desempate por id. Cada fila trae el nombre
 *       de su ejecutivo y sus oportunidades abiertas (número y suma de su valor).
 *     tags: [Customers]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: page
 *         schema: { type: integer, minimum: 1, default: 1 }
 *       - in: query
 *         name: pageSize
 *         schema: { type: integer, minimum: 1, maximum: 100, default: 20 }
 *     responses:
 *       200:
 *         description: '{items, total, page, pageSize}'
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 items:
 *                   type: array
 *                   items: { $ref: '#/components/schemas/PublicCustomerListItem' }
 *                 total: { type: integer }
 *                 page: { type: integer }
 *                 pageSize: { type: integer }
 *       400:
 *         description: page o pageSize fuera de rango
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/ValidationError' }
 *       401:
 *         description: Sin un token válido
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/UnauthorizedError' }
 *       500:
 *         description: Fallo de la base; nunca una página a medias
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/InternalError' }
 *   post:
 *     summary: Alta de un cliente
 *     description: Genera su código PRO-AAAA-NNN con un contador anual atómico.
 *     tags: [Customers]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema: { $ref: '#/components/schemas/CreateCustomerBody' }
 *     responses:
 *       201:
 *         description: El cliente creado
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/PublicCustomer' }
 *       400:
 *         description: Entrada inválida; details lista cada campo con su mensaje literal
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/ValidationError' }
 *       401:
 *         description: Sin un token válido
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/UnauthorizedError' }
 *       409:
 *         description: Ya existe un cliente con esta identificación.
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/CustomerDuplicateError' }
 * /api/customers/{id}:
 *   get:
 *     summary: Ficha de un cliente
 *     tags: [Customers]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: El cliente completo
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/PublicCustomerDetail' }
 *       401:
 *         description: Sin un token válido
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/UnauthorizedError' }
 *       404:
 *         description: No existe un cliente con ese id
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/CustomerNotFoundError' }
 *   put:
 *     summary: Edición de un cliente
 *     description: Actualiza la razón social o el nombre, el contacto y los datos comerciales.
 *     tags: [Customers]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema: { $ref: '#/components/schemas/UpdateCustomerBody' }
 *     responses:
 *       200:
 *         description: El cliente actualizado completo
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/PublicCustomer' }
 *       400:
 *         description: Entrada inválida; details lista cada campo con su mensaje literal
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/ValidationError' }
 *       401:
 *         description: Sin un token válido
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/UnauthorizedError' }
 *       404:
 *         description: No existe un cliente con ese id
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/CustomerNotFoundError' }
 */

const WRITE_FIELDS = [
  'legalName',
  'firstNames',
  'lastNames',
  'email',
  'mobilePhone',
  'city',
  'address',
  'sourceChannel',
  'accountExecutiveId',
  'notes',
  'contactName',
  'contactTitle',
  'contactEmail',
] as const;

/** Toma del cuerpo solo los campos que admite el contrato; el resto se ignora. */
function pick(body: Record<string, unknown>, fields: readonly string[]): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const field of fields) {
    if (body[field] !== undefined) result[field] = body[field];
  }
  return result;
}

export class CustomerController {
  constructor(private readonly customerService: CustomerService) {}

  list = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const page = req.query['page'] !== undefined ? Number(req.query['page']) : 1;
      const pageSize = req.query['pageSize'] !== undefined ? Number(req.query['pageSize']) : 20;
      res.status(200).json(await this.customerService.list({ page, pageSize }));
    } catch (err) {
      next(err);
    }
  };

  create = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const input = pick(req.body, ['personType', 'idType', 'idNumber', ...WRITE_FIELDS]) as CreateCustomerInput;
      res.status(201).json(await this.customerService.create(input));
    } catch (err) {
      next(err);
    }
  };

  getById = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      res.status(200).json(await this.customerService.findById(req.params['id']));
    } catch (err) {
      next(err);
    }
  };

  update = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      // RN-05: idType, idNumber y personType no se leen del cuerpo
      const input = pick(req.body, WRITE_FIELDS) as UpdateCustomerInput;
      res.status(200).json(await this.customerService.update(req.params['id'], input));
    } catch (err) {
      next(err);
    }
  };
}
