import { inject, Injectable } from '@angular/core';
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Observable, catchError, throwError } from 'rxjs';
import { environment } from '../../../../environments/environment';
import { ExecutiveOption } from '../domain/models/executive.model';
import { ExecutiveRepositoryPort } from '../domain/ports/executive-repository.port';
import {
  ExecutiveInfrastructureError,
  ExecutiveUnauthorizedError
} from '../domain/errors/executive.errors';

@Injectable()
export class HttpExecutiveRepository implements ExecutiveRepositoryPort {
  private readonly http = inject(HttpClient);
  private readonly base = environment.apiBaseUrl;

  /** GET /api/executives — los ejecutivos activos como [{value, label}] (GREEN-H2-API-EJECUTIVOS-001) */
  listExecutives(): Observable<ExecutiveOption[]> {
    const url = `${this.base}/api/executives`;
    return this.http
      .get<ExecutiveOption[]>(url)
      .pipe(catchError((err: HttpErrorResponse) => throwError(() => this.traducir(err, url))));
  }

  /** El contrato declara 200 y 401; cualquier otro código es de infraestructura. */
  private traducir(err: HttpErrorResponse, path: string): Error {
    console.error(`[HTTP Error] ${err.status} · ${path}`);

    if (err.status === 401) {
      return new ExecutiveUnauthorizedError();
    }
    return new ExecutiveInfrastructureError(err.status, path);
  }
}
