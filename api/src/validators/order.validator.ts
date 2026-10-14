import { Request, Response, NextFunction } from 'express';
import mongoose from 'mongoose';
import { ValidationError } from '../lib/errors';

// ─── Validar query de POST /api/orders (no acepta query params) ───────────────

/**
 * POST /api/orders no acepta parámetros de query.
 * Cualquier parámetro desconocido → 400 VALIDATION_ERROR.
 */
export function validateCreateOrderQuery(req: Request, _res: Response, next: NextFunction): void {
  const unknownKeys = Object.keys(req.query);
  if (unknownKeys.length > 0) {
    const details = unknownKeys.map((key) => ({
      field: key,
      message: `El parámetro '${key}' no está permitido`,
    }));
    return next(new ValidationError('Entrada inválida', details));
  }
  next();
}

// ─── Validar body de POST /api/orders ────────────────────────────────────────

const ALLOWED_BODY_FIELDS = new Set(['items']);
const ALLOWED_ITEM_FIELDS = new Set(['productId', 'quantity']);

export function validateCreateOrderBody(req: Request, _res: Response, next: NextFunction): void {
  const details: Array<{ field: string; message: string }> = [];

  // Rechazar campos desconocidos en el body
  if (req.body && typeof req.body === 'object') {
    for (const key of Object.keys(req.body)) {
      if (!ALLOWED_BODY_FIELDS.has(key)) {
        details.push({ field: key, message: `El campo '${key}' no está permitido` });
      }
    }
  }

  const { items } = req.body ?? {};

  // items: requerido, array, 1 a 50 elementos
  if (!Array.isArray(items) || items.length === 0) {
    details.push({ field: 'items', message: 'items es requerido y debe ser un array no vacío' });
  } else if (items.length > 50) {
    details.push({ field: 'items', message: 'items no puede tener más de 50 líneas' });
  } else {
    // Validar unicidad de productId
    const seenIds = new Set<string>();
    const duplicateIds = new Set<string>();

    for (let i = 0; i < items.length; i++) {
      // Rechazar null y tipos primitivos en los ítems
      if (items[i] === null || typeof items[i] !== 'object') {
        details.push({ field: `items[${i}]`, message: `El ítem ${i} debe ser un objeto` });
        continue;
      }

      const item = items[i] as Record<string, unknown>;

      // Campos desconocidos en cada ítem
      for (const key of Object.keys(item)) {
        if (!ALLOWED_ITEM_FIELDS.has(key)) {
          details.push({ field: `items[${i}].${key}`, message: `El campo '${key}' no está permitido en items` });
        }
      }

      // productId: requerido, ObjectId válido
      const { productId, quantity } = item;
      if (typeof productId !== 'string' || !mongoose.Types.ObjectId.isValid(productId)) {
        details.push({ field: `items[${i}].productId`, message: 'productId debe ser un ObjectId válido' });
      } else {
        if (seenIds.has(productId)) {
          duplicateIds.add(productId);
        }
        seenIds.add(productId);
      }

      // quantity: requerido, entero de 1 a 99
      if (
        quantity === undefined ||
        !Number.isInteger(quantity) ||
        (quantity as number) < 1 ||
        (quantity as number) > 99
      ) {
        details.push({
          field: `items[${i}].quantity`,
          message: 'quantity debe ser un entero de 1 a 99',
        });
      }
    }

    // Notificar productIds duplicados
    for (const id of duplicateIds) {
      details.push({ field: 'items', message: `productId '${id}' aparece más de una vez` });
    }
  }

  if (details.length > 0) {
    return next(new ValidationError('Entrada inválida', details));
  }

  next();
}

// ─── Validar query de GET /api/orders/:id y POST /api/orders/:id/confirm ─────

/**
 * Los endpoints con :id no aceptan query params.
 * Cualquier query param desconocido → 400 VALIDATION_ERROR.
 */
export function validateOrderIdQuery(req: Request, _res: Response, next: NextFunction): void {
  const unknownKeys = Object.keys(req.query);
  if (unknownKeys.length > 0) {
    const details = unknownKeys.map((key) => ({
      field: key,
      message: `El parámetro '${key}' no está permitido`,
    }));
    return next(new ValidationError('Entrada inválida', details));
  }
  next();
}

// ─── Validar query de GET /api/orders ────────────────────────────────────────

const ALLOWED_LIST_QUERY_FIELDS = new Set(['page', 'pageSize']);

export function validateListOrdersQuery(req: Request, _res: Response, next: NextFunction): void {
  const details: Array<{ field: string; message: string }> = [];

  // Rechazar campos desconocidos en la query
  for (const key of Object.keys(req.query)) {
    if (!ALLOWED_LIST_QUERY_FIELDS.has(key)) {
      details.push({ field: key, message: `El parámetro '${key}' no está permitido` });
    }
  }

  const rawPage = req.query['page'];
  const rawPageSize = req.query['pageSize'];

  if (rawPage !== undefined) {
    const rawPageStr = String(rawPage);
    const pageNum = parseInt(rawPageStr, 10);
    // Rechazar si no es un entero decimal puro (p. ej. '0x1', '1.5', '1abc')
    if (isNaN(pageNum) || String(pageNum) !== rawPageStr || pageNum < 1) {
      details.push({ field: 'page', message: 'page debe ser un entero mayor o igual a 1' });
    }
  }

  if (rawPageSize !== undefined) {
    const rawPageSizeStr = String(rawPageSize);
    const pageSizeNum = parseInt(rawPageSizeStr, 10);
    // Rechazar si no es un entero decimal puro (p. ej. '0x10', '1.5', '1abc')
    if (isNaN(pageSizeNum) || String(pageSizeNum) !== rawPageSizeStr || pageSizeNum < 1 || pageSizeNum > 50) {
      details.push({ field: 'pageSize', message: 'pageSize debe ser un entero entre 1 y 50' });
    }
  }

  if (details.length > 0) {
    return next(new ValidationError('Entrada inválida', details));
  }

  next();
}
