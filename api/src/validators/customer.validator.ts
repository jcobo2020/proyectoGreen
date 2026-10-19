import { Request, Response, NextFunction } from 'express';
import { ValidationError } from '../lib/errors';
import { ID_TYPES, PERSON_TYPES } from '../models/customer';

type FieldError = { field: string; message: string };

// ─── Mensajes literales de la spec (GREEN-H2-API-CLIENTES-001) ────────────────

export const CUSTOMER_MESSAGES = {
  rucInvalid: 'El RUC debe tener 13 dígitos y terminar en 001.', // RN-02
  cedulaInvalid: 'La cédula debe tener 10 dígitos.', // RN-02
  idNumberInvalid: 'Número no válido.', // RN-02
  nameRequired: 'Completa el nombre.', // RN-03
  emailInvalid: 'Ingresa un correo válido.', // RN-03
  sourceChannelRequired: 'Selecciona el canal de origen.', // RN-03
  executiveInvalid: 'Selecciona un ejecutivo válido.', // RN-09
  // Sin mensaje literal en la spec (declarado en clarificationRequests del informe):
  idTypeInvalid: 'Selecciona el tipo de identificación.',
  personTypeInvalid: 'Selecciona el tipo de persona.',
  valueInvalid: 'Valor no válido.',
  pageInvalid: 'page debe ser un entero mayor o igual a 1',
  pageSizeInvalid: 'pageSize debe ser un entero entre 1 y 100',
} as const;

/** Campos de texto opcionales que no tienen otra regla que ser texto. */
const PLAIN_OPTIONAL_TEXT_FIELDS = ['mobilePhone', 'city', 'address', 'notes', 'contactName', 'contactTitle'];

const OBJECT_ID_PATTERN = /^[0-9a-fA-F]{24}$/;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// ─── Reglas puras ─────────────────────────────────────────────────────────────

function isNonEmptyText(value: unknown): value is string {
  return typeof value === 'string' && value.trim() !== '';
}

/** Un campo opcional «se envía» cuando no es undefined, null ni una cadena vacía. */
function isSent(value: unknown): boolean {
  return value !== undefined && value !== null && !(typeof value === 'string' && value.trim() === '');
}

export function isValidEmail(value: unknown): boolean {
  return typeof value === 'string' && EMAIL_PATTERN.test(value.trim());
}

/** RN-02: formato de la identificación según su tipo. Devuelve el mensaje literal o null. */
export function idNumberError(idType: string, idNumber: unknown): string | null {
  const value = typeof idNumber === 'string' ? idNumber.trim() : '';
  switch (idType) {
    case 'ruc':
      return /^\d{10}001$/.test(value) ? null : CUSTOMER_MESSAGES.rucInvalid;
    case 'cedula':
      return /^\d{10}$/.test(value) ? null : CUSTOMER_MESSAGES.cedulaInvalid;
    case 'passport':
      return /^[A-Za-z0-9]{5,20}$/.test(value) ? null : CUSTOMER_MESSAGES.idNumberInvalid;
    default:
      return value !== '' ? null : CUSTOMER_MESSAGES.idNumberInvalid;
  }
}

/** Reglas comunes al alta y a la edición: correo, canal, contacto, ejecutivo y textos opcionales. */
function commonFieldErrors(body: Record<string, unknown>, sourceChannelRequired: boolean): FieldError[] {
  const details: FieldError[] = [];

  if (!isValidEmail(body['email'])) {
    details.push({ field: 'email', message: CUSTOMER_MESSAGES.emailInvalid });
  }

  const sourceChannel = body['sourceChannel'];
  if ((sourceChannelRequired || sourceChannel !== undefined) && !isNonEmptyText(sourceChannel)) {
    details.push({ field: 'sourceChannel', message: CUSTOMER_MESSAGES.sourceChannelRequired });
  }

  if (isSent(body['contactEmail']) && !isValidEmail(body['contactEmail'])) {
    details.push({ field: 'contactEmail', message: CUSTOMER_MESSAGES.emailInvalid });
  }

  const executiveId = body['accountExecutiveId'];
  if (
    isSent(executiveId) &&
    (typeof executiveId !== 'string' || !OBJECT_ID_PATTERN.test(executiveId))
  ) {
    details.push({ field: 'accountExecutiveId', message: CUSTOMER_MESSAGES.executiveInvalid });
  }

  for (const field of PLAIN_OPTIONAL_TEXT_FIELDS) {
    const value = body[field];
    if (value !== undefined && value !== null && typeof value !== 'string') {
      details.push({ field, message: CUSTOMER_MESSAGES.valueInvalid });
    }
  }

  return details;
}

/** Errores de POST /api/customers (RN-02, RN-03, forma de RN-09). */
export function createCustomerErrors(rawBody: unknown): FieldError[] {
  const body = (rawBody && typeof rawBody === 'object' ? rawBody : {}) as Record<string, unknown>;
  const details: FieldError[] = [];

  const personType = body['personType'];
  const personTypeOk = typeof personType === 'string' && (PERSON_TYPES as readonly string[]).includes(personType);
  if (!personTypeOk) {
    details.push({ field: 'personType', message: CUSTOMER_MESSAGES.personTypeInvalid });
  }

  const idType = body['idType'];
  const idTypeOk = typeof idType === 'string' && (ID_TYPES as readonly string[]).includes(idType);
  if (!idTypeOk) {
    details.push({ field: 'idType', message: CUSTOMER_MESSAGES.idTypeInvalid });
  }

  const idError = idNumberError(idTypeOk ? (idType as string) : '', body['idNumber']);
  if (idError) {
    details.push({ field: 'idNumber', message: idError });
  }

  if (personType === 'legal' && !isNonEmptyText(body['legalName'])) {
    details.push({ field: 'legalName', message: CUSTOMER_MESSAGES.nameRequired });
  }
  if (personType === 'natural') {
    if (!isNonEmptyText(body['firstNames'])) {
      details.push({ field: 'firstNames', message: CUSTOMER_MESSAGES.nameRequired });
    }
    if (!isNonEmptyText(body['lastNames'])) {
      details.push({ field: 'lastNames', message: CUSTOMER_MESSAGES.nameRequired });
    }
  }
  for (const field of ['legalName', 'firstNames', 'lastNames']) {
    const value = body[field];
    if (value !== undefined && value !== null && typeof value !== 'string') {
      if (!details.some((d) => d.field === field)) {
        details.push({ field, message: CUSTOMER_MESSAGES.valueInvalid });
      }
    }
  }

  return [...details, ...commonFieldErrors(body, true)];
}

/**
 * Errores de forma de PUT /api/customers/:id. idType, idNumber y personType no se validan:
 * no cambian tras el alta y se ignoran (RN-05). Que el nombre quede completo según el tipo
 * de persona guardado lo comprueba el servicio (RN-03 sobre el cliente resultante).
 */
export function updateCustomerErrors(rawBody: unknown): FieldError[] {
  const body = (rawBody && typeof rawBody === 'object' ? rawBody : {}) as Record<string, unknown>;
  const details: FieldError[] = [];
  for (const field of ['legalName', 'firstNames', 'lastNames']) {
    const value = body[field];
    if (value !== undefined && value !== null && typeof value !== 'string') {
      details.push({ field, message: CUSTOMER_MESSAGES.valueInvalid });
    }
  }
  return [...details, ...commonFieldErrors(body, false)];
}

/** Errores de la paginación de GET /api/customers (RN-07). */
export function listCustomersQueryErrors(query: Record<string, unknown>): FieldError[] {
  const details: FieldError[] = [];
  const isIntegerText = (raw: unknown): boolean => typeof raw === 'string' && /^\d+$/.test(raw);

  const rawPage = query['page'];
  if (rawPage !== undefined && (!isIntegerText(rawPage) || Number(rawPage) < 1)) {
    details.push({ field: 'page', message: CUSTOMER_MESSAGES.pageInvalid });
  }

  const rawPageSize = query['pageSize'];
  if (
    rawPageSize !== undefined &&
    (!isIntegerText(rawPageSize) || Number(rawPageSize) < 1 || Number(rawPageSize) > 100)
  ) {
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
