import { Request, Response, NextFunction } from 'express';
import { ValidationError } from '../lib/errors';

export function validateListProductsQuery(req: Request, _res: Response, next: NextFunction): void {
  const details: Array<{ field: string; message: string }> = [];

  const rawPage = req.query['page'];
  const rawPageSize = req.query['pageSize'];

  // Validar page
  if (rawPage !== undefined) {
    const pageNum = Number(rawPage);
    if (!Number.isInteger(pageNum) || pageNum < 1) {
      details.push({ field: 'page', message: 'page debe ser un entero mayor o igual a 1' });
    }
  }

  // Validar pageSize
  if (rawPageSize !== undefined) {
    const pageSizeNum = Number(rawPageSize);
    if (!Number.isInteger(pageSizeNum) || pageSizeNum < 1 || pageSizeNum > 100) {
      details.push({ field: 'pageSize', message: 'pageSize debe ser un entero entre 1 y 100' });
    }
  }

  if (details.length > 0) {
    return next(new ValidationError('Entrada inválida', details));
  }

  next();
}
