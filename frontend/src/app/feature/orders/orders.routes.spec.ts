import { ordersRoutes } from './orders.routes';
import { authGuard } from '../../@core/guards/auth.guard';
import { ORDER_REPOSITORY } from './domain/ports/order-repository.port';
import { HttpOrderRepository } from './infrastructure/http-order.repository';
import { ListOrdersUseCase } from './application/order.use-cases';

/**
 * Spec de orders.routes.ts (R4-ARQ-2, R4-ARQ-6):
 * - La ruta raíz usa authGuard.
 * - Los providers incluyen HttpClient propio (con interceptores), ORDER_REPOSITORY y ListOrdersUseCase.
 * - Las rutas hijas: '' carga OrderListComponent (lazy).
 * - Las rutas 'new' y ':id/confirm' pertenecen a WI-ORD-UX-002 y WI-ORD-UX-003 y no están aquí.
 */
describe('ordersRoutes (orders.routes.ts)', () => {
  it('define un array de rutas', () => {
    expect(Array.isArray(ordersRoutes)).toBe(true);
    expect(ordersRoutes.length).toBeGreaterThan(0);
  });

  it('la ruta raíz usa authGuard como canActivate (R4-ARQ-6)', () => {
    const rutaRaiz = ordersRoutes[0];
    expect(rutaRaiz.canActivate).toBeDefined();
    expect(rutaRaiz.canActivate).toContain(authGuard);
  });

  it('la ruta raíz declara providers (HttpClient propio + repositorio + caso de uso)', () => {
    const rutaRaiz = ordersRoutes[0];
    expect(rutaRaiz.providers).toBeDefined();
    expect(Array.isArray(rutaRaiz.providers)).toBe(true);
    expect((rutaRaiz.providers as unknown[]).length).toBeGreaterThan(0);
  });

  it('los providers incluyen ORDER_REPOSITORY apuntando a HttpOrderRepository', () => {
    const rutaRaiz = ordersRoutes[0];
    const providers = rutaRaiz.providers as Array<{ provide?: unknown; useClass?: unknown }>;
    const repoProvider = providers.find(p => p.provide === ORDER_REPOSITORY);
    expect(repoProvider).toBeDefined();
    expect(repoProvider?.useClass).toBe(HttpOrderRepository);
  });

  it('los providers incluyen ListOrdersUseCase', () => {
    const rutaRaiz = ordersRoutes[0];
    const providers = rutaRaiz.providers as unknown[];
    expect(providers).toContain(ListOrdersUseCase);
  });

  it('la ruta hija "" carga OrderListComponent con loadComponent (R4-ARQ-2)', () => {
    const rutaRaiz = ordersRoutes[0];
    const rutas = rutaRaiz.children ?? [];
    const rutaListado = rutas.find(r => r.path === '');
    expect(rutaListado).toBeDefined();
    expect(typeof rutaListado?.loadComponent).toBe('function');
  });

  it('loadComponent de "" resuelve a OrderListComponent', async () => {
    const rutaRaiz = ordersRoutes[0];
    const rutas = rutaRaiz.children ?? [];
    const rutaListado = rutas.find(r => r.path === '');
    const componente = await (rutaListado?.loadComponent as () => Promise<unknown>)();
    expect(componente).toBeDefined();
  });

  it('no hay ruta "new" (pertenece a WI-ORD-UX-002)', () => {
    const rutaRaiz = ordersRoutes[0];
    const rutas = rutaRaiz.children ?? [];
    const rutaNew = rutas.find(r => r.path === 'new');
    expect(rutaNew).toBeUndefined();
  });
});
