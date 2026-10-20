import { inject, Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { ExecutiveOption } from '../domain/models/executive.model';
import { EXECUTIVE_REPOSITORY } from '../domain/ports/executive-repository.port';

/**
 * Caso de uso: «Cargar las opciones de «Ejecutivo asignado»» (GET /api/executives).
 * Sin caché: cada llamada vuelve a pedir al servidor (R4-ARQ-7).
 */
@Injectable()
export class ListExecutivesUseCase {
  private readonly repo = inject(EXECUTIVE_REPOSITORY);

  execute(): Observable<ExecutiveOption[]> {
    return this.repo.listExecutives();
  }
}
