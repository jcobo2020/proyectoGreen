import { inject, Injectable } from '@angular/core';
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Observable, catchError, throwError } from 'rxjs';
import { environment } from '../../../../environments/environment';
import { ReportsPage, ReportsQuery } from '../domain/models/report.model';
import { ReportRepositoryPort } from '../domain/ports/report-repository.port';
import {
  InvalidReportInputError,
  ReportInfrastructureError,
  ReportUnauthorizedError
} from '../domain/errors/report.errors';

@Injectable()
export class HttpReportRepository implements ReportRepositoryPort {
  private readonly http = inject(HttpClient);
  private readonly base = environment.apiBaseUrl;

  /** GET /api/reports — carga la lista de reportes (§2 de GREEN-H2-UX-REPORTES-001). */
  listReports(query: ReportsQuery): Observable<ReportsPage> {
    const url = `${this.base}/api/reports`;
    const params: Record<string, string> = {};
    if (query.page !== undefined) params['page'] = String(query.page);
    if (query.pageSize !== undefined) params['pageSize'] = String(query.pageSize);

    return this.http
      .get<ReportsPage>(url, { params })
      .pipe(catchError((err: HttpErrorResponse) => throwError(() => this.traducir(err, url))));
  }

  /**
   * Traduce el código HTTP a un error de dominio (§2: 400, 401).
   * El log lleva el código y la ruta, nunca el cuerpo ni el token (§4-bis seguridad).
   */
  private traducir(err: HttpErrorResponse, path: string): Error {
    console.error(`[HTTP Error] ${err.status} · ${path}`);

    switch (err.status) {
      case 400:
        return new InvalidReportInputError(err.error?.details);
      case 401:
        return new ReportUnauthorizedError();
      default:
        return new ReportInfrastructureError(err.status, path);
    }
  }
}
