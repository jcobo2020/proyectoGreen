import { inject, Injectable } from '@angular/core';
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Observable, catchError, throwError } from 'rxjs';
import { environment } from '../../../../environments/environment';
import { ProductsPage } from '../domain/models/product.model';
import { ProductRepositoryPort } from '../domain/ports/product-repository.port';
import {
  InvalidOrderInputError,
  OrderUnauthorizedError,
  OrderInfrastructureError
} from '../domain/errors/order.errors';

@Injectable()
export class HttpProductRepository implements ProductRepositoryPort {
  private readonly http = inject(HttpClient);
  private readonly base = environment.apiBaseUrl;

  listProducts(page: number, pageSize: number): Observable<ProductsPage> {
    const url = `${this.base}/api/products`;
    return this.http
      .get<ProductsPage>(url, {
        params: { page: String(page), pageSize: String(pageSize) }
      })
      .pipe(catchError((err) => throwError(() => this.traducir(err, url))));
  }

  private traducir(err: HttpErrorResponse, path: string): Error {
    // R4-OBS-1: registrar error sin token ni datos del cliente
    console.error(`[HTTP Error] ${err.status} · ${path}`);

    switch (err.status) {
      case 400:
        return new InvalidOrderInputError(err.error?.details);
      case 401:
        return new OrderUnauthorizedError();
      default:
        return new OrderInfrastructureError(err.status, path);
    }
  }
}
