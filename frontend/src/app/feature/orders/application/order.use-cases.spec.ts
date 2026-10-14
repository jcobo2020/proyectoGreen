import { TestBed } from '@angular/core/testing';
import { of, throwError } from 'rxjs';
import { createSpyObj } from '../../../../testing/spy-obj';
import { ListOrdersUseCase } from './order.use-cases';
import { OrderRepositoryPort, ORDER_REPOSITORY } from '../domain/ports/order-repository.port';
import { OrdersPage } from '../domain/models/order.model';
import { InvalidOrderInputError, OrderUnauthorizedError } from '../domain/errors/order.errors';

function crear() {
  const repoSpy = createSpyObj<OrderRepositoryPort>('OrderRepositoryPort', ['listOrders']);
  TestBed.configureTestingModule({
    providers: [
      ListOrdersUseCase,
      { provide: ORDER_REPOSITORY, useValue: repoSpy }
    ]
  });
  return { useCase: TestBed.inject(ListOrdersUseCase), repoSpy };
}

describe('ListOrdersUseCase', () => {
  const paginaEjemplo: OrdersPage = {
    items: [{ code: 'ORD-001', createdAt: '2024-01-01T00:00:00Z', total: 100, status: 'confirmed' }],
    total: 1,
    page: 1,
    pageSize: 20
  };

  it('llama al puerto con la página dada y pageSize 20', () => {
    const { useCase, repoSpy } = crear();
    repoSpy.listOrders.mockReturnValue(of(paginaEjemplo));

    useCase.execute(1).subscribe();

    expect(repoSpy.listOrders).toHaveBeenCalledWith(1, 20);
  });

  it('devuelve los pedidos que retorna el puerto', () => {
    const { useCase, repoSpy } = crear();
    repoSpy.listOrders.mockReturnValue(of(paginaEjemplo));

    let resultado: OrdersPage | undefined;
    useCase.execute(1).subscribe(p => resultado = p);

    expect(resultado).toEqual(paginaEjemplo);
  });

  it('usa page 1 por defecto', () => {
    const { useCase, repoSpy } = crear();
    repoSpy.listOrders.mockReturnValue(of(paginaEjemplo));

    useCase.execute().subscribe();

    expect(repoSpy.listOrders).toHaveBeenCalledWith(1, 20);
  });

  it('propaga el error de dominio InvalidOrderInputError', () => {
    const { useCase, repoSpy } = crear();
    const error = new InvalidOrderInputError();
    repoSpy.listOrders.mockReturnValue(throwError(() => error));

    let capturado: unknown;
    useCase.execute(0).subscribe({ error: e => capturado = e });

    expect(capturado).toBeInstanceOf(InvalidOrderInputError);
  });

  it('propaga el error de dominio OrderUnauthorizedError', () => {
    const { useCase, repoSpy } = crear();
    const error = new OrderUnauthorizedError();
    repoSpy.listOrders.mockReturnValue(throwError(() => error));

    let capturado: unknown;
    useCase.execute(1).subscribe({ error: e => capturado = e });

    expect(capturado).toBeInstanceOf(OrderUnauthorizedError);
  });
});
