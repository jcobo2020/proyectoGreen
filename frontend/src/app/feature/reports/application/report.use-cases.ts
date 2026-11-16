import { inject, Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { ReportsPage, ReportsQuery } from '../domain/models/report.model';
import { REPORT_REPOSITORY } from '../domain/ports/report-repository.port';

/**
 * Caso de uso: «Cargar la lista» de reportes (GET /api/reports).
 * pageSize fijo a 20 por defecto (§2 del contrato).
 */
@Injectable()
export class ListReportsUseCase {
  private readonly repo = inject(REPORT_REPOSITORY);

  execute(query: ReportsQuery = { page: 1, pageSize: 20 }): Observable<ReportsPage> {
    return this.repo.listReports(query);
  }
}
