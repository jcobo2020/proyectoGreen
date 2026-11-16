import { Routes } from '@angular/router';
import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { authGuard } from '../../@core/guards/auth.guard';
import { jwtInterceptor } from '../../@core/interceptors/jwt.interceptor';
import { reportsSessionInterceptor } from './infrastructure/session.interceptor';
import { REPORT_REPOSITORY } from './domain/ports/report-repository.port';
import { HttpReportRepository } from './infrastructure/http-report.repository';
import { ListReportsUseCase } from './application/report.use-cases';

/**
 * Rutas de la feature reports, montadas en /reportes desde app.routes.ts:
 * - authGuard protege la pantalla.
 * - HttpClient propio con jwtInterceptor + reportsSessionInterceptor (sin errorInterceptor
 *   global), para que el repositorio distinga el 400 y el 401.
 */
export const reportsRoutes: Routes = [
  {
    path: '',
    canActivate: [authGuard],
    providers: [
      provideHttpClient(withInterceptors([jwtInterceptor, reportsSessionInterceptor])),
      { provide: REPORT_REPOSITORY, useClass: HttpReportRepository },
      ListReportsUseCase
    ],
    children: [
      {
        path: '',
        loadComponent: () =>
          import('./ui/report-list/report-list.component').then(m => m.ReportListComponent)
      }
    ]
  }
];
