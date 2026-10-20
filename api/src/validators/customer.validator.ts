import { Request, Response, NextFunction } from 'express';
import { ValidationError } from '../lib/errors';
import { ID_TYPES, PERSON_TYPES } from '../models/customer';
import { normalizeIdNumber } from '../lib/customerNormalization';

type FieldError = { field: string; message: string };
type Body = Record<string, unknown>;

// ─── Mensajes literales de la spec (GREEN-H2-API-CLIENTES-001 v6) ─────────────

export const CUSTOMER_MESSAGES = {
  rucInvalid: 'El RUC debe tener 13 dígitos y terminar en 001.', // RN-02
  cedulaInvalid: 'La cédula debe tener 10 dígitos.', // RN-02
  idNumberInvalid: 'Número no válido.', // RN-02 (pasaporte)
  nameRequired: 'Completa el nombre.', // RN-03
  emailInvalid: 'Ingresa un correo válido.', // RN-03
  sourceChannelRequired: 'Selecciona el canal de origen.', // RN-03
  executiveInvalid: 'Selecciona un ejecutivo válido.', // RN-09
  personTypeRequired: 'Tipo de persona es obligatorio.', // RN-12
  idTypeRequired: 'Tipo de identificación es obligatorio.', // RN-02, RN-12
  idNumberRequired: 'Número de identificación es obligatorio.', // RN-12
  emailRequired: 'Correo electrónico es obligatorio.', // RN-12
  pageInvalid: 'La página no es válida.', // RN-07
  pageSizeInvalid: 'El tamaño de página no es válido.', // RN-07
} as const;

/**
 * Etiqueta de cada campo del alta, la que da el contrato (respuesta 201 de POST /api/customers).
 * RN-12: un campo con un tipo que no es el suyo, o con un valor fuera de su lista, responde
 * «El valor de <etiqueta> no es válido.».
 */
export const CUSTOMER_FIELD_LABELS = {
  personType: 'Tipo de persona',
  idType: 'Tipo de identificación',
  idNumber: 'Número de identificación',
  legalName: 'Razón social',
  firstNames: 'Nombres',
  lastNames: 'Apellidos',
  email: 'Correo electrónico',
  mobilePhone: 'Teléfono celular',
  city: 'Ciudad',
  address: 'Dirección',
  sourceChannel: 'Canal de origen',
  accountExecutiveId: 'Ejecutivo asignado',
  notes: 'Observaciones',
  contactName: 'Nombre',
  contactTitle: 'Cargo',
  contactEmail: 'Correo',
} as const;

type CustomerField = keyof typeof CUSTOMER_FIELD_LABELS;

export function notValidMessage(field: CustomerField): string {
  return `El valor de ${CUSTOMER_FIELD_LABELS[field]} no es válido.`;
}

/** Campos de texto opcionales que no tienen otra regla que ser texto. */
const PLAIN_OPTIONAL_TEXT_FIELDS: CustomerField[] = ['mobilePhone', 'city', 'address', 'notes', 'contactName', 'contactTitle'];
const NAME_FIELDS: CustomerField[] = ['legalName', 'firstNames', 'lastNames'];

const OBJECT_ID_PATTERN = /^[0-9a-fA-F]{24}$/;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// ─── Reglas puras ─────────────────────────────────────────────────────────────

/** Ausente: no viene, viene null o es una cadena vacía o de espacios. */
function isMissing(value: unknown): boolean {
  return value === undefined || value === null || (typeof value === 'string' && value.trim() === '');
}

function isWrongType(value: unknown): boolean {
  return !isMissing(value) && typeof value !== 'string';
}

export function isValidEmail(value: unknown): boolean {
  return typeof value === 'string' && EMAIL_PATTERN.test(value.trim());
}

/**
 * RN-02: formato de la identificación según su tipo, sobre el número tal como se guardará (sin
 * espacios y en mayúsculas). Devuelve el mensaje literal o null.
 */
export function idNumberError(idType: string, idNumber: string): string | null {
  const value = normalizeIdNumber(idNumber);
  switch (idType) {
    case 'ruc':
      return /^\d{10}001$/.test(value) ? null : CUSTOMER_MESSAGES.rucInvalid;
    case 'cedula':
      return /^\d{10}$/.test(value) ? null : CUSTOMER_MESSAGES.cedulaInvalid;
    default: // passport: 5 a 20 letras o dígitos, sin otra validación
      return /^[A-Z0-9]{5,20}$/.test(value) ? null : CUSTOMER_MESSAGES.idNumberInvalid;
  }
}

/** Un campo de lista cerrada (personType, idType): obligatorio, texto y de su lista (RN-12). */
function enumFieldError(
  body: Body,
  field: 'personType' | 'idType',
  allowed: readonly string[],
  requiredMessage: string
): FieldError | null {
  const value = body[field];
  if (isMissing(value)) return { field, message: requiredMessage };
  if (typeof value !== 'string' || !allowed.includes(value)) return { field, message: notValidMessage(field) };
  return null;
}

/** El correo principal: obligatorio (mensaje del alta o de la edición), texto y con formato (RN-03, RN-12). */
function emailError(body: Body, requiredMessage: string): FieldError | null {
  const value = body['email'];
  if (isMissing(value)) return { field: 'email', message: requiredMessage };
  if (typeof value !== 'string') return { field: 'email', message: notValidMessage('email') };
  if (!isValidEmail(value)) return { field: 'email', message: CUSTOMER_MESSAGES.emailInvalid };
  return null;
}

/** Reglas comunes al alta y a la edición: contacto, ejecutivo, textos opcionales y tipo de los nombres. */
function optionalFieldErrors(body: Body): FieldError[] {
  const details: FieldError[] = [];

  const contactEmail = body['contactEmail'];
  if (isWrongType(contactEmail)) {
    details.push({ field: 'contactEmail', message: notValidMessage('contactEmail') });
  } else if (!isMissing(contactEmail) && !isValidEmail(contactEmail)) {
    details.push({ field: 'contactEmail', message: CUSTOMER_MESSAGES.emailInvalid });
  }

  // RN-09: la existencia y el estado del ejecutivo los comprueba el servicio; aquí, su forma
  const executiveId = body['accountExecutiveId'];
  if (isWrongType(executiveId)) {
    details.push({ field: 'accountExecutiveId', message: notValidMessage('accountExecutiveId') });
  } else if (!isMissing(executiveId) && !OBJECT_ID_PATTERN.test(executiveId as string)) {
    details.push({ field: 'accountExecutiveId', message: CUSTOMER_MESSAGES.executiveInvalid });
  }

  for (const field of [...NAME_FIELDS, ...PLAIN_OPTIONAL_TEXT_FIELDS]) {
    if (isWrongType(body[field])) {
      details.push({ field, message: notValidMessage(field) });
    }
  }
  return details;
}

function asBody(raw: unknown): Body {
  return (raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {}) as Body;
}

/** Errores de POST /api/customers (RN-02, RN-03, RN-12 y la forma de RN-09). */
export function createCustomerErrors(rawBody: unknown): FieldError[] {
  const body = asBody(rawBody);
  const details: FieldError[] = [];
  const push = (error: FieldError | null): void => {
    if (error) details.push(error);
  };

  push(enumFieldError(body, 'personType', PERSON_TYPES, CUSTOMER_MESSAGES.personTypeRequired));
  const idTypeError = enumFieldError(body, 'idType', ID_TYPES, CUSTOMER_MESSAGES.idTypeRequired);
  push(idTypeError);

  // RN-12 obligatorio y tipo; RN-02 formato, solo cuando se sabe el tipo de identificación
  const idNumber = body['idNumber'];
  if (isMissing(idNumber)) {
    push({ field: 'idNumber', message: CUSTOMER_MESSAGES.idNumberRequired });
  } else if (typeof idNumber !== 'string') {
    push({ field: 'idNumber', message: notValidMessage('idNumber') });
  } else if (!idTypeError) {
    const message = idNumberError(body['idType'] as string, idNumber);
    if (message) push({ field: 'idNumber', message });
  }

  push(emailError(body, CUSTOMER_MESSAGES.emailRequired));

  // RN-03: el canal de origen es obligatorio en el alta
  const sourceChannel = body['sourceChannel'];
  if (isMissing(sourceChannel)) {
    push({ field: 'sourceChannel', message: CUSTOMER_MESSAGES.sourceChannelRequired });
  } else if (typeof sourceChannel !== 'string') {
    push({ field: 'sourceChannel', message: notValidMessage('sourceChannel') });
  }

  // RN-03: el nombre según el tipo de persona (el tipo erróneo lo da optionalFieldErrors)
  const requiredNames: CustomerField[] =
    body['personType'] === 'legal' ? ['legalName'] : body['personType'] === 'natural' ? ['firstNames', 'lastNames'] : [];
  for (const field of requiredNames) {
    if (isMissing(body[field])) push({ field, message: CUSTOMER_MESSAGES.nameRequired });
  }

  return [...details, ...optionalFieldErrors(body)];
}

/**
 * Errores de forma de PUT /api/customers/:id. idType, idNumber y personType no se validan:
 * no cambian tras el alta y se ignoran (RN-05). Que el nombre quede completo según el tipo
 * de persona GUARDADO lo comprueba el servicio (RN-03). El canal es opcional, pero si viene
 * no puede ir vacío (RN-03). Un texto opcional «» o null vale: lo vacía (RN-13); un
 * accountExecutiveId «» o null también vale: conserva el ejecutivo (RN-13).
 */
export function updateCustomerErrors(rawBody: unknown): FieldError[] {
  const body = asBody(rawBody);
  const details: FieldError[] = [];

  const email = emailError(body, CUSTOMER_MESSAGES.emailRequired);
  if (email) details.push(email);

  const sourceChannel = body['sourceChannel'];
  if (sourceChannel !== undefined) {
    if (isMissing(sourceChannel)) {
      details.push({ field: 'sourceChannel', message: CUSTOMER_MESSAGES.sourceChannelRequired });
    } else if (typeof sourceChannel !== 'string') {
      details.push({ field: 'sourceChannel', message: notValidMessage('sourceChannel') });
    }
  }

  return [...details, ...optionalFieldErrors(body)];
}

/** RN-07: entero en [min, max]; un texto con otra cosa que dígitos (o repetido) no vale. */
function isIntegerInRange(raw: unknown, min: number, max: number): boolean {
  if (typeof raw !== 'string' || !/^\d+$/.test(raw)) return false;
  const value = Number(raw);
  return value >= min && value <= max;
}

export const PAGE_MAX = 100000;
export const PAGE_SIZE_MAX = 100;

/** Errores de la paginación de GET /api/customers (RN-07). */
export function listCustomersQueryErrors(query: Record<string, unknown>): FieldError[] {
  const details: FieldError[] = [];
  if (query['page'] !== undefined && !isIntegerInRange(query['page'], 1, PAGE_MAX)) {
    details.push({ field: 'page', message: CUSTOMER_MESSAGES.pageInvalid });
  }
  if (query['pageSize'] !== undefined && !isIntegerInRange(query['pageSize'], 1, PAGE_SIZE_MAX)) {
    details.push({ field: 'pageSize', message: CUSTOMER_MESSAGES.pageSizeInvalid });
  }
  return details;
}

// ─── Middlewares de validación ────────────────────────────────────────────────

function reject(details: FieldError[], next: NextFunction): void {
  if (details.length > 0) {
    return next(new ValidationError('Entrada inválida', details));
  }
  next();
}

export function validateCreateCustomerBody(req: Request, _res: Response, next: NextFunction): void {
  reject(createCustomerErrors(req.body), next);
}

export function validateUpdateCustomerBody(req: Request, _res: Response, next: NextFunction): void {
  reject(updateCustomerErrors(req.body), next);
}

export function validateListCustomersQuery(req: Request, _res: Response, next: NextFunction): void {
  reject(listCustomersQueryErrors(req.query as Record<string, unknown>), next);
}
