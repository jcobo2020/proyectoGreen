import { Request, Response, NextFunction } from 'express';
import { CustomerService, CreateCustomerInput, UpdateCustomerInput } from '../services/CustomerService';

/**
 * @swagger
 * tags:
 *   name: Customers
 *   description: Clientes del CRM (personas jurídicas y naturales) — contrato GREEN-H2-API-CLIENTES-001 v6
 */

/**
 * @swagger
 * components:
 *   schemas:
 *     PublicCustomer:
 *       type: object
 *       description: El cliente completo, tal como lo devuelven PUT /api/customers/{id} (200)
 *       properties:
 *         id: { type: string, description: Identificador del cliente }
 *         code: { type: string, description: 'Código legible PRO-AAAA-NNN', example: PRO-2026-001 }
 *         personType: { type: string, enum: [legal, natural], description: Tipo de persona (jurídica o natural) }
 *         idType: { type: string, enum: [cedula, ruc, passport], description: Tipo de identificación }
 *         idNumber: { type: string, description: 'Número de identificación (único), sin espacios y en mayúsculas (RN-02)' }
 *         legalName: { type: string, description: Razón social (persona jurídica) }
 *         firstNames: { type: string, description: Nombres (persona natural) }
 *         lastNames: { type: string, description: Apellidos (persona natural) }
 *         email: { type: string, format: email, description: 'Correo electrónico, en minúsculas y sin espacios alrededor (RN-11)' }
 *         mobilePhone: { type: string, description: Teléfono celular }
 *         city: { type: string, description: Ciudad }
 *         address: { type: string, description: Dirección }
 *         sourceChannel: { type: string, description: Canal de origen }
 *         accountExecutiveId: { type: string, description: _id del ejecutivo asignado }
 *         notes: { type: string, description: Observaciones }
 *         contactName: { type: string, description: 'Contacto principal: nombre' }
 *         contactTitle: { type: string, description: 'Contacto principal: cargo' }
 *         contactEmail: { type: string, format: email, description: 'Contacto principal: correo, en minúsculas (RN-11)' }
 *         createdAt: { type: string, format: date-time }
 *         updatedAt: { type: string, format: date-time }
 *       required: [id, code, personType, idType, idNumber, email, sourceChannel, createdAt, updatedAt]
 *     CreatedCustomer:
 *       type: object
 *       description: 'El cliente creado (201): {id, code, ...los datos enviados, createdAt}'
 *       properties:
 *         id: { type: string }
 *         code: { type: string, description: 'PRO-AAAA-NNN: año de creación en UTC y secuencia anual de al menos 3 dígitos (RN-06)', example: PRO-2026-001 }
 *         idType: { type: string, enum: [cedula, ruc, passport], description: Tipo de identificación }
 *         idNumber: { type: string, description: 'Número de identificación, sin espacios y en mayúsculas (RN-02)' }
 *         legalName: { type: string, description: Razón social }
 *         firstNames: { type: string, description: Nombres }
 *         lastNames: { type: string, description: Apellidos }
 *         email: { type: string, format: email, description: 'Correo electrónico, en minúsculas (RN-11)' }
 *         mobilePhone: { type: string, description: Teléfono celular }
 *         city: { type: string, description: Ciudad }
 *         address: { type: string, description: Dirección }
 *         sourceChannel: { type: string, description: Canal de origen }
 *         accountExecutiveId: { type: string, description: Ejecutivo asignado }
 *         notes: { type: string, description: Observaciones }
 *         contactName: { type: string, description: Nombre }
 *         contactTitle: { type: string, description: Cargo }
 *         contactEmail: { type: string, format: email, description: 'Correo, en minúsculas (RN-11)' }
 *         personType: { type: string, enum: [legal, natural], description: Tipo de persona }
 *         createdAt: { type: string, format: date-time, description: fecha ISO }
 *       required: [id, code, personType, idType, idNumber, email, sourceChannel, createdAt]
 *     CustomerDetail:
 *       description: La ficha (GET /api/customers/{id}) — el cliente completo más el nombre de su ejecutivo
 *       allOf:
 *         - $ref: '#/components/schemas/PublicCustomer'
 *         - type: object
 *           required: [accountExecutive]
 *           properties:
 *             accountExecutive:
 *               type: string
 *               description: 'name del ejecutivo asignado, aunque esté inactivo (RN-10); vacío si no tiene'
 *     CustomerListItem:
 *       type: object
 *       description: Una fila del listado «Clientes»
 *       properties:
 *         id: { type: string, description: 'Abre /prospectos/:id' }
 *         name: { type: string, description: 'legalName, o firstNames + lastNames si es persona natural' }
 *         idNumber: { type: string, description: Identificación }
 *         city: { type: string, description: Ciudad }
 *         primaryContact: { type: string, description: contactName del alta }
 *         accountExecutive: { type: string, description: 'name del ejecutivo asignado; vacío si no tiene. Se conserva aunque se desactive (RN-10)' }
 *         openOpportunities: { type: integer, description: 'Número de oportunidades abiertas (0 si no tiene)' }
 *         openValue: { type: number, description: 'Suma del valor de sus oportunidades abiertas, redondeada a 2 decimales (0 si no tiene)' }
 *       required: [id, name, idNumber, accountExecutive, openOpportunities, openValue]
 *     CustomerWriteFields:
 *       type: object
 *       properties:
 *         legalName: { type: string, description: Razón social }
 *         firstNames: { type: string, description: Nombres }
 *         lastNames: { type: string, description: Apellidos }
 *         email: { type: string, format: email, description: 'Correo electrónico; se guarda en minúsculas y sin espacios (RN-11)' }
 *         mobilePhone: { type: string, description: Teléfono celular }
 *         city: { type: string, description: Ciudad }
 *         address: { type: string, description: Dirección }
 *         sourceChannel: { type: string, description: Canal de origen }
 *         accountExecutiveId: { type: string, description: '_id de un ejecutivo activo (RN-09)' }
 *         notes: { type: string, description: Observaciones }
 *         contactName: { type: string, description: 'Contacto principal: nombre' }
 *         contactTitle: { type: string, description: 'Contacto principal: cargo' }
 *         contactEmail: { type: string, format: email, description: 'Contacto principal: correo; se guarda en minúsculas (RN-11)' }
 *     CreateCustomerCommon:
 *       allOf:
 *         - $ref: '#/components/schemas/CustomerWriteFields'
 *         - type: object
 *           required: [personType, idType, idNumber, email, sourceChannel]
 *           properties:
 *             personType: { type: string, enum: [legal, natural], description: Tipo de persona }
 *             idType: { type: string, enum: [cedula, ruc, passport], description: Tipo de identificación }
 *             idNumber: { type: string, description: 'RUC: 13 dígitos terminados en 001 · cédula: 10 dígitos · pasaporte: 5 a 20 letras o dígitos (RN-02). Se valida y se guarda sin espacios y en mayúsculas: «ab12345» y «AB12345» son la misma identificación (RN-01)' }
 *     CreateLegalCustomerBody:
 *       description: Persona jurídica — la razón social (legalName) es obligatoria (RN-03)
 *       allOf:
 *         - $ref: '#/components/schemas/CreateCustomerCommon'
 *         - type: object
 *           required: [legalName]
 *           properties:
 *             personType: { type: string, enum: [legal] }
 *     CreateNaturalCustomerBody:
 *       description: Persona natural — nombres y apellidos (firstNames, lastNames) son obligatorios (RN-03)
 *       allOf:
 *         - $ref: '#/components/schemas/CreateCustomerCommon'
 *         - type: object
 *           required: [firstNames, lastNames]
 *           properties:
 *             personType: { type: string, enum: [natural] }
 *     CreateCustomerBody:
 *       description: >
 *         Obligatorios: personType, idType, idNumber, email y sourceChannel; además, según el tipo de
 *         persona, legalName (legal) o firstNames y lastNames (natural).
 *       oneOf:
 *         - $ref: '#/components/schemas/CreateLegalCustomerBody'
 *         - $ref: '#/components/schemas/CreateNaturalCustomerBody'
 *       discriminator:
 *         propertyName: personType
 *         mapping:
 *           legal: '#/components/schemas/CreateLegalCustomerBody'
 *           natural: '#/components/schemas/CreateNaturalCustomerBody'
 *     UpdateCustomerBody:
 *       description: >
 *         idType, idNumber y personType no cambian tras el alta y se ignoran si se envían (RN-05).
 *         El nombre se exige según el tipo de persona GUARDADO: legalName de una jurídica, firstNames
 *         y lastNames de una natural no pueden quedar vacíos (RN-03); los nombres del otro tipo de
 *         persona se ignoran (firstNames y lastNames en una jurídica, legalName en una natural).
 *         sourceChannel es opcional, pero si viene no puede ir vacío (RN-03). Un campo que no se envía
 *         no cambia; un texto opcional enviado como «» o null se vacía y deja de venir en la respuesta
 *         (RN-13). accountExecutiveId ausente, «» o null conserva el ejecutivo que el cliente tiene;
 *         cambiarlo exige uno activo, y reenviar el que ya tiene vale aunque esté inactivo (RN-09, RN-10).
 *       allOf:
 *         - $ref: '#/components/schemas/CustomerWriteFields'
 *         - type: object
 *           required: [email]
 *     CustomerFieldError:
 *       type: object
 *       properties:
 *         field: { type: string, example: idNumber }
 *         message: { type: string, example: La cédula debe tener 10 dígitos. }
 *       required: [field, message]
 *     CustomerValidationError:
 *       type: object
 *       description: >
 *         400 de /api/customers. details lista cada campo con su mensaje literal: «Tipo de persona es obligatorio.»,
 *         «Tipo de identificación es obligatorio.», «Número de identificación es obligatorio.», «Correo electrónico es obligatorio.»,
 *         «El valor de <etiqueta> no es válido.» (tipo o valor fuera de su lista, p. ej. «El valor de Ciudad no es válido.»),
 *         «El RUC debe tener 13 dígitos y terminar en 001.»,
 *         «La cédula debe tener 10 dígitos.», «Número no válido.», «Completa el nombre.», «Ingresa un correo válido.»,
 *         «Selecciona el canal de origen.», «Selecciona un ejecutivo válido.», «La página no es válida.»,
 *         «El tamaño de página no es válido.». Un cuerpo que no es un JSON válido responde con el mensaje
 *         «El cuerpo de la petición no es un JSON válido.» y details vacío (RN-12).
 *       properties:
 *         code: { type: string, enum: [VALIDATION_ERROR] }
 *         message: { type: string }
 *         details:
 *           type: array
 *           items: { $ref: '#/components/schemas/CustomerFieldError' }
 *       required: [code, message, details]
 *     CustomerUnauthorizedError:
 *       type: object
 *       description: '401 de /api/customers: sin token o con uno inválido o caducado; details siempre viaja (vacío)'
 *       properties:
 *         code: { type: string, enum: [UNAUTHORIZED] }
 *         message: { type: string }
 *         details: { type: array, maxItems: 0, items: {} }
 *       required: [code, message, details]
 *     CustomerNotFoundError:
 *       type: object
 *       properties:
 *         code: { type: string, enum: [CUSTOMER_NOT_FOUND] }
 *         message: { type: string, example: No existe un cliente con ese id }
 *         details: { type: array, maxItems: 0, items: {} }
 *       required: [code, message, details]
 *     CustomerDuplicateError:
 *       type: object
 *       properties:
 *         code: { type: string, enum: [CUSTOMER_DUPLICATE] }
 *         message: { type: string, example: Ya existe un cliente con esta identificación. }
 *         details:
 *           type: array
 *           items: { $ref: '#/components/schemas/CustomerFieldError' }
 *       required: [code, message, details]
 *     CustomerInternalError:
 *       type: object
 *       description: '500 de /api/customers: un error no previsto (p. ej. un fallo de la base) hace fallar la petición entera, nunca una página a medias (R4-ARQ-4); se registra sin el cuerpo de la petición (R4-OBS-3)'
 *       properties:
 *         code: { type: string, enum: [INTERNAL_ERROR] }
 *         message: { type: string }
 *         details: { type: array, maxItems: 0, items: {} }
 *       required: [code, message, details]
 */

/**
 * @swagger
 * /api/customers:
 *   get:
 *     summary: Listado paginado de clientes
 *     description: >
 *       Ordenado por fecha de creación descendente y _id descendente (RN-07). Cada fila trae el nombre
 *       de su ejecutivo y sus oportunidades abiertas (número y suma de su valor).
 *     tags: [Customers]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: page
 *         description: 'Entero de 1 a 100000; fuera de rango o no entero: 400 «La página no es válida.»'
 *         schema: { type: integer, minimum: 1, maximum: 100000, default: 1 }
 *       - in: query
 *         name: pageSize
 *         description: 'Entero de 1 a 100; fuera de rango o no entero: 400 «El tamaño de página no es válido.»'
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
 *                   items: { $ref: '#/components/schemas/CustomerListItem' }
 *                 total: { type: integer }
 *                 page: { type: integer }
 *                 pageSize: { type: integer }
 *               required: [items, total, page, pageSize]
 *       400:
 *         description: page o pageSize fuera de rango o no enteros
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/CustomerValidationError' }
 *       401:
 *         description: Sin un token válido
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/CustomerUnauthorizedError' }
 *       500:
 *         description: Fallo de la base; nunca una página a medias
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/CustomerInternalError' }
 *   post:
 *     summary: Alta de un cliente
 *     description: >
 *       Genera su código PRO-AAAA-NNN con un contador anual atómico (RN-06). La identificación es única:
 *       repetirla, también en un doble envío, responde 409 (RN-01, RN-08). No hay cabecera de idempotencia.
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
 *             schema: { $ref: '#/components/schemas/CreatedCustomer' }
 *       400:
 *         description: Entrada inválida (details lista cada campo con su mensaje literal) o un cuerpo que no es un JSON válido (details vacío)
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/CustomerValidationError' }
 *       401:
 *         description: Sin un token válido
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/CustomerUnauthorizedError' }
 *       409:
 *         description: Ya existe un cliente con esta identificación.
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/CustomerDuplicateError' }
 *       500:
 *         description: Error no previsto (p. ej. un fallo de la base)
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/CustomerInternalError' }
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
 *         description: El cliente completo con el nombre de su ejecutivo
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/CustomerDetail' }
 *       401:
 *         description: Sin un token válido
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/CustomerUnauthorizedError' }
 *       404:
 *         description: No existe un cliente con ese id
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/CustomerNotFoundError' }
 *       500:
 *         description: Error no previsto (p. ej. un fallo de la base)
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/CustomerInternalError' }
 *   put:
 *     summary: Edición de un cliente
 *     description: >
 *       Actualiza la razón social o el nombre, el contacto y los datos comerciales (RN-05). Los nombres
 *       del otro tipo de persona se ignoran; lo que no se envía no cambia y un texto opcional «» o null
 *       se vacía (RN-13).
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
 *         description: Entrada inválida (details lista cada campo con su mensaje literal) o un cuerpo que no es un JSON válido (details vacío)
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/CustomerValidationError' }
 *       401:
 *         description: Sin un token válido
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/CustomerUnauthorizedError' }
 *       404:
 *         description: No existe un cliente con ese id
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/CustomerNotFoundError' }
 *       500:
 *         description: Error no previsto (p. ej. un fallo de la base)
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/CustomerInternalError' }
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
