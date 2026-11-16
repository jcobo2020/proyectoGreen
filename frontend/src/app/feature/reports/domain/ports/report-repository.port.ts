import { InjectionToken } from '@angular/core';
import { Observable } from 'rxjs';
import { ReportsPage, ReportsQuery } from '../models/report.model';

/** Puerto de acceso a datos de reportes. */
export interface ReportRepositoryPort {
  listReports(query: ReportsQuery): Observable<ReportsPage>;
}

/** Token de inyección del puerto (§4 convenciones). */
export const REPORT_REPOSITORY = new InjectionToken<ReportRepositoryPort>('REPORT_REPOSITORY');
