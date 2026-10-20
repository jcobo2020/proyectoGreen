import { customersRoutes } from './customers.routes';
import { authGuard } from '../../@core/guards/auth.guard';
import { CUSTOMER_REPOSITORY } from './domain/ports/customer-repository.port';
import { EXECUTIVE_REPOSITORY } from './domain/ports/executive-repository.port';
import { HttpCustomerRepository } from './infrastructure/http-customer.repository';
import { HttpExecutiveRepository } from './infrastructure/http-executive.repository';
import { CreateCustomerUseCase } from './application/customer.use-cases';
import { ListExecutivesUseCase } from './application/executive.use-cases';
import { CustomerNewComponent } from './ui/customer-new/customer-new.component';

describe('customersRoutes (customers.routes.ts)', () => {
  const raiz = customersRoutes[0];
  const providers = raiz.providers as Array<{ provide?: unknown; useClass?: unknown }>;

  it('la ruta raíz está protegida por authGuard', () => {
    expect(raiz.canActivate).toContain(authGuard);
  });

  it('provee CUSTOMER_REPOSITORY → HttpCustomerRepository y EXECUTIVE_REPOSITORY → HttpExecutiveRepository', () => {
    expect(providers.find(p => p.provide === CUSTOMER_REPOSITORY)?.useClass).toBe(HttpCustomerRepository);
    expect(providers.find(p => p.provide === EXECUTIVE_REPOSITORY)?.useClass).toBe(HttpExecutiveRepository);
  });

  it('provee los casos de uso de la pantalla', () => {
    expect(providers).toContain(CreateCustomerUseCase);
    expect(providers).toContain(ListExecutivesUseCase);
  });

  it('la ruta hija vacía carga CustomerNewComponent de forma lazy', async () => {
    const hija = raiz.children?.find(r => r.path === '');
    const componente = await (hija?.loadComponent as () => Promise<unknown>)();
    expect(componente).toBe(CustomerNewComponent);
  });
});
