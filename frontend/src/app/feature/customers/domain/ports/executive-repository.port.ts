import { InjectionToken } from '@angular/core';
import { Observable } from 'rxjs';
import { ExecutiveOption } from '../models/executive.model';

/**
 * Puerto del repositorio de ejecutivos.
 * La implementación HTTP está en infrastructure/http-executive.repository.ts.
 */
export interface ExecutiveRepositoryPort {
  /** GET /api/executives — los ejecutivos activos como opciones */
  listExecutives(): Observable<ExecutiveOption[]>;
}

export const EXECUTIVE_REPOSITORY = new InjectionToken<ExecutiveRepositoryPort>(
  'EXECUTIVE_REPOSITORY'
);
