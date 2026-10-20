import { Component } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { Observable, Subject, of, throwError } from 'rxjs';
import { createSpyObj } from '../../../../../testing/spy-obj';
import { CustomerNewComponent } from './customer-new.component';
import { CreateCustomerUseCase } from '../../application/customer.use-cases';
import { ListExecutivesUseCase } from '../../application/executive.use-cases';
import { CUSTOMER_REPOSITORY, CustomerRepositoryPort } from '../../domain/ports/customer-repository.port';
import { EXECUTIVE_REPOSITORY, ExecutiveRepositoryPort } from '../../domain/ports/executive-repository.port';
import { Customer } from '../../domain/models/customer.model';
import { ExecutiveOption } from '../../domain/models/executive.model';
import {
  CustomerInfrastructureError,
  CustomerUnauthorizedError,
  DuplicateCustomerError,
  InvalidCustomerInputError
} from '../../domain/errors/customer.errors';
import {
  ExecutiveInfrastructureError,
  ExecutiveUnauthorizedError
} from '../../domain/errors/executive.errors';
import { environment } from '../../../../../environments/environment';

/**
 * /nuevo-prospecto («Nuevo cliente»). Se doblan los REPOSITORIOS por su puerto; el componente
 * usa los casos de uso reales y el router real (con pantallas de relleno en los destinos).
 * Cada prueba cita el id de §8 del pack o el criterio (AC-…) que demuestra.
 */
@Component({ standalone: true, template: '' })
class PantallaDeRelleno {}

const EJECUTIVOS: ExecutiveOption[] = [
  { value: '665f1c2a9b1e8a0000000001', label: 'Daniela Ríos' },
  { value: '665f1c2a9b1e8a0000000002', label: 'Mauricio León' }
];

function crear(ejecutivos: Observable<ExecutiveOption[]> = of(EJECUTIVOS)) {
  const customerRepo = createSpyObj<CustomerRepositoryPort>('CustomerRepositoryPort', ['createCustomer']);
  const executiveRepo = createSpyObj<ExecutiveRepositoryPort>('ExecutiveRepositoryPort', ['listExecutives']);
  executiveRepo.listExecutives.mockReturnValue(ejecutivos);

  TestBed.configureTestingModule({
    imports: [CustomerNewComponent],
    providers: [
      CreateCustomerUseCase,
      ListExecutivesUseCase,
      { provide: CUSTOMER_REPOSITORY, useValue: customerRepo },
      { provide: EXECUTIVE_REPOSITORY, useValue: executiveRepo },
      provideRouter([
        { path: 'prospectos', component: PantallaDeRelleno },
        { path: 'prospectos/:id', component: PantallaDeRelleno }
      ])
    ]
  });

  const fixture = TestBed.createComponent(CustomerNewComponent);
  fixture.detectChanges();
  return { fixture, customerRepo, executiveRepo, router: TestBed.inject(Router) };
}

// ─── Utilidades de interacción ───────────────────────────────────────────────

/** El paso del asistente (0 a 3) donde vive cada campo. */
const PASO_DE: Record<string, number> = {
  personType: 0, idType: 0, idNumber: 0, legalName: 0, firstNames: 0, lastNames: 0,
  email: 1, mobilePhone: 1, city: 1, address: 1,
  sourceChannel: 2, accountExecutiveId: 2, notes: 2,
  contactName: 3, contactTitle: 3, contactEmail: 3
};

function raiz(fixture: ComponentFixture<CustomerNewComponent>): HTMLElement {
  return fixture.nativeElement as HTMLElement;
}

function texto(fixture: ComponentFixture<CustomerNewComponent>): string {
  return raiz(fixture).textContent ?? '';
}

function boton(fixture: ComponentFixture<CustomerNewComponent>, clase: string): HTMLButtonElement | null {
  return raiz(fixture).querySelector<HTMLButtonElement>(`.${clase}`);
}

function pasoActual(fixture: ComponentFixture<CustomerNewComponent>): string {
  return raiz(fixture).querySelector('[aria-current="step"]')?.textContent?.replace(/\s+/g, ' ').trim() ?? '';
}

/** Va al paso pedido pulsando «Siguiente» o «Anterior», como la persona. */
function irAlPaso(fixture: ComponentFixture<CustomerNewComponent>, destino: number): void {
  for (let vueltas = 0; vueltas < 4 && fixture.componentInstance.paso() !== destino; vueltas++) {
    const clase = fixture.componentInstance.paso() < destino ? 'btn-siguiente' : 'btn-anterior';
    boton(fixture, clase)?.click();
    fixture.detectChanges();
  }
}

function campo<T extends HTMLElement>(fixture: ComponentFixture<CustomerNewComponent>, id: string): T {
  irAlPaso(fixture, PASO_DE[id]);
  const el = raiz(fixture).querySelector<T>(`#${id}`);
  if (!el) throw new Error(`No existe el campo #${id}`);
  return el;
}

function escribir(fixture: ComponentFixture<CustomerNewComponent>, id: string, valor: string): void {
  const el = campo<HTMLInputElement | HTMLTextAreaElement>(fixture, id);
  el.value = valor;
  el.dispatchEvent(new Event('input'));
  el.dispatchEvent(new Event('blur'));
  fixture.detectChanges();
}

function elegir(fixture: ComponentFixture<CustomerNewComponent>, id: string, valor: string): void {
  const el = campo<HTMLSelectElement>(fixture, id);
  el.value = valor;
  el.dispatchEvent(new Event('change'));
  el.dispatchEvent(new Event('blur'));
  fixture.detectChanges();
}

function valorDe(fixture: ComponentFixture<CustomerNewComponent>, id: string): string {
  return campo<HTMLInputElement>(fixture, id).value;
}

function tipoDePersona(fixture: ComponentFixture<CustomerNewComponent>, valor: 'legal' | 'natural'): void {
  irAlPaso(fixture, 0);
  const radio = Array.from(raiz(fixture).querySelectorAll<HTMLInputElement>('input[type="radio"]')).find(
    r => r.value === valor
  );
  if (!radio) throw new Error(`No existe la opción ${valor} de «Tipo de persona»`);
  radio.click();
  fixture.detectChanges();
}

/** «Guardar cliente» está en el último paso. */
function guardar(fixture: ComponentFixture<CustomerNewComponent>): void {
  irAlPaso(fixture, 3);
  boton(fixture, 'btn-guardar')?.click();
  fixture.detectChanges();
}

/** El mensaje bajo un campo, yendo a su paso. */
function errorDe(fixture: ComponentFixture<CustomerNewComponent>, id: string): string | null {
  irAlPaso(fixture, PASO_DE[id]);
  return raiz(fixture).querySelector(`#err-${id}`)?.textContent?.trim() ?? null;
}

function existe(fixture: ComponentFixture<CustomerNewComponent>, id: string): boolean {
  irAlPaso(fixture, PASO_DE[id]);
  return raiz(fixture).querySelector(`#${id}`) !== null;
}

function opcionesDe(fixture: ComponentFixture<CustomerNewComponent>, id: string): string[][] {
  return Array.from(campo<HTMLSelectElement>(fixture, id).querySelectorAll('option')).map(o => [
    o.value,
    o.textContent?.trim() ?? ''
  ]);
}

/** Un alta válida de persona natural con cédula. */
function llenarValido(fixture: ComponentFixture<CustomerNewComponent>): void {
  tipoDePersona(fixture, 'natural');
  elegir(fixture, 'idType', 'cedula');
  escribir(fixture, 'idNumber', '0912345678');
  escribir(fixture, 'firstNames', 'Ana María');
  escribir(fixture, 'lastNames', 'Pérez Ruiz');
  escribir(fixture, 'email', 'ana@example.com');
  elegir(fixture, 'sourceChannel', 'cartera_propia');
}

const CLIENTE_CREADO: Customer = {
  id: 'c-123',
  code: 'PRO-2026-001',
  personType: 'natural',
  idType: 'cedula',
  idNumber: '0912345678',
  firstNames: 'Ana María',
  lastNames: 'Pérez Ruiz',
  email: 'ana@example.com',
  sourceChannel: 'cartera_propia',
  createdAt: '2026-10-19T10:00:00.000Z'
};

describe('CustomerNewComponent (/nuevo-prospecto)', () => {
  beforeEach(() => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
    TestBed.resetTestingModule();
  });

  // ─── Estados de vista de la carga (GET /api/executives) ────────────────────

  describe('estados de la pantalla', () => {
    it('AC-15 — mientras GET /api/executives está en vuelo muestra «Cargando…»', () => {
      const enVuelo = new Subject<ExecutiveOption[]>();
      const { fixture } = crear(enVuelo.asObservable());

      expect(raiz(fixture).querySelector('.estado-cargando')?.textContent?.trim()).toBe('Cargando…');

      enVuelo.next(EJECUTIVOS);
      fixture.detectChanges();
      expect(raiz(fixture).querySelector('.estado-cargando')).toBeNull();
    });

    it('AC-16 — con 200 y una lista vacía muestra «No hay datos que mostrar.» y el formulario sigue usable', () => {
      const { fixture } = crear(of([]));

      expect(raiz(fixture).querySelector('.estado-vacio')?.textContent?.trim()).toBe('No hay datos que mostrar.');
      expect(raiz(fixture).querySelector('.estado-al-dia')).toBeNull();
      expect(raiz(fixture).querySelector('form')).not.toBeNull();
    });

    it('AC-17 — si la carga falla muestra «No se pudo cargar. Vuelve a intentarlo.» y «Reintentar» vuelve a pedir', () => {
      const { fixture, executiveRepo } = crear(throwError(() => new ExecutiveInfrastructureError(500, '/api/executives')));

      expect(raiz(fixture).querySelector('.estado-error p')?.textContent?.trim()).toBe(
        'No se pudo cargar. Vuelve a intentarlo.'
      );

      executiveRepo.listExecutives.mockReturnValue(of(EJECUTIVOS));
      boton(fixture, 'btn-reintentar')?.click();
      fixture.detectChanges();

      expect(executiveRepo.listExecutives).toHaveBeenCalledTimes(2);
      expect(raiz(fixture).querySelector('.estado-error')).toBeNull();
      expect(raiz(fixture).querySelector('.estado-al-dia')?.textContent?.trim()).toBe('Datos al día.');
    });

    it('AC-18 · act_opc_e5075456ce:llama — con 200 pide GET /api/executives, muestra «Datos al día.» y ofrece los ejecutivos', () => {
      const { fixture, executiveRepo } = crear();

      expect(executiveRepo.listExecutives).toHaveBeenCalledTimes(1);
      expect(raiz(fixture).querySelector('.estado-al-dia')?.textContent?.trim()).toBe('Datos al día.');
      expect(opcionesDe(fixture, 'accountExecutiveId')).toEqual([
        ['', ''],
        ['665f1c2a9b1e8a0000000001', 'Daniela Ríos'],
        ['665f1c2a9b1e8a0000000002', 'Mauricio León']
      ]);
    });

    it('«Datos al día.» deja de verse en cuanto la persona empieza a escribir', () => {
      const { fixture } = crear();
      escribir(fixture, 'idNumber', '0');
      expect(raiz(fixture).querySelector('.estado-al-dia')).toBeNull();
    });

    it('AC-21 · sin permiso: con 401 en GET /api/executives dice «Tu sesión terminó: vuelve a entrar.» y «vuelve a entrar» lleva al inicio de sesión', () => {
      const { fixture } = crear(throwError(() => new ExecutiveUnauthorizedError()));

      const aviso = raiz(fixture).querySelector('.estado-sin-sesion');
      expect(aviso?.textContent?.trim()).toBe('Tu sesión terminó: vuelve a entrar.');
      expect(aviso?.querySelector<HTMLAnchorElement>('a.enlace-entrar')?.getAttribute('href')).toBe(
        `${environment.identityProviderUrl}?returnUrl=%2Fnuevo-prospecto`
      );
      expect(raiz(fixture).querySelector('form')).toBeNull();
    });
  });

  // ─── El asistente de 4 pasos y sus controles ──────────────────────────────

  describe('asistente', () => {
    it('empieza en «Identificación» y solo enseña los campos de ese paso', () => {
      const { fixture } = crear();
      expect(pasoActual(fixture)).toBe('1 Identificación');
      expect(raiz(fixture).querySelector('#idNumber')).not.toBeNull();
      expect(raiz(fixture).querySelector('#email')).toBeNull();
      expect(raiz(fixture).querySelector('#sourceChannel')).toBeNull();
      expect(raiz(fixture).querySelector('#contactName')).toBeNull();
    });

    it('ctl_9f3ce694c5:control · ctl_09c796ca67:control — «Siguiente» y «Anterior» solo cambian de paso y conservan lo escrito', () => {
      const { fixture, customerRepo } = crear();
      expect(boton(fixture, 'btn-anterior')?.disabled).toBe(true);
      escribir(fixture, 'idNumber', '0912345678');

      boton(fixture, 'btn-siguiente')?.click();
      fixture.detectChanges();
      expect(pasoActual(fixture)).toBe('2 Contacto y ubicación');
      boton(fixture, 'btn-siguiente')?.click();
      fixture.detectChanges();
      expect(pasoActual(fixture)).toBe('3 Información comercial');
      boton(fixture, 'btn-siguiente')?.click();
      fixture.detectChanges();
      expect(pasoActual(fixture)).toBe('4 Contactos');
      expect(boton(fixture, 'btn-siguiente')).toBeNull();
      expect(boton(fixture, 'btn-guardar')?.textContent?.trim()).toBe('Guardar cliente');

      boton(fixture, 'btn-anterior')?.click();
      fixture.detectChanges();
      expect(pasoActual(fixture)).toBe('3 Información comercial');
      expect(valorDe(fixture, 'idNumber')).toBe('0912345678');
      expect(customerRepo.createCustomer).not.toHaveBeenCalled();
      expect(raiz(fixture).querySelectorAll('.mensaje-error').length).toBe(0);
    });

    it('«Guardar cliente» solo está en el último paso', () => {
      const { fixture } = crear();
      for (const paso of [0, 1, 2]) {
        irAlPaso(fixture, paso);
        expect(boton(fixture, 'btn-guardar')).toBeNull();
      }
    });

    it('los controles tienen su énfasis e icono: «Siguiente» principal con arrow-right, «Anterior» secundario con arrow-left, «Cancelar» discreto al pie', () => {
      const { fixture } = crear();
      const siguiente = boton(fixture, 'btn-siguiente');
      const anterior = boton(fixture, 'btn-anterior');
      expect(siguiente?.classList).toContain('btn-principal');
      expect(siguiente?.querySelector('[data-icon="arrow-right"]')).not.toBeNull();
      expect(siguiente?.textContent?.replace(/\s+/g, ' ').trim()).toContain('Siguiente');
      expect(anterior?.classList).toContain('btn-secundario');
      expect(anterior?.querySelector('[data-icon="arrow-left"]')).not.toBeNull();
      const cancelar = raiz(fixture).querySelector<HTMLButtonElement>('footer .btn-cancelar');
      expect(cancelar?.classList).toContain('btn-discreto');
      expect(cancelar?.textContent?.trim()).toBe('Cancelar');
    });

    it('ctl_6374a15df9:control — «Agregar contacto» está en «Contactos», secundario con user-add, y desactivado: el contrato admite un solo contacto', () => {
      const { fixture } = crear();
      irAlPaso(fixture, 3);
      const agregar = raiz(fixture).querySelector<HTMLButtonElement>('fieldset .btn-agregar-contacto');
      expect(agregar?.textContent?.replace(/\s+/g, ' ').trim()).toContain('Agregar contacto');
      expect(agregar?.classList).toContain('btn-secundario');
      expect(agregar?.querySelector('[data-icon="user-add"]')).not.toBeNull();
      expect(agregar?.disabled).toBe(true);
      expect(raiz(fixture).querySelectorAll('#contactName').length).toBe(1);
    });

    it('ctl_ac849da96b:control — «Cancelar» devuelve el formulario a su estado de partida y vuelve al primer paso', () => {
      const { fixture, customerRepo } = crear();
      llenarValido(fixture);
      escribir(fixture, 'contactName', 'Luis Mora');

      boton(fixture, 'btn-cancelar')?.click();
      fixture.detectChanges();

      expect(pasoActual(fixture)).toBe('1 Identificación');
      expect(valorDe(fixture, 'idNumber')).toBe('');
      expect(existe(fixture, 'firstNames')).toBe(false);
      expect(valorDe(fixture, 'email')).toBe('');
      expect(valorDe(fixture, 'contactName')).toBe('');
      expect(raiz(fixture).querySelectorAll('.mensaje-error').length).toBe(0);
      expect(customerRepo.createCustomer).not.toHaveBeenCalled();
    });

    it('al guardar con datos que faltan, lleva al primer paso que tiene un error', () => {
      const { fixture, customerRepo } = crear();
      tipoDePersona(fixture, 'natural');
      elegir(fixture, 'idType', 'cedula');
      escribir(fixture, 'idNumber', '0912345678');
      escribir(fixture, 'firstNames', 'Ana');
      escribir(fixture, 'lastNames', 'Pérez');

      guardar(fixture);

      expect(customerRepo.createCustomer).not.toHaveBeenCalled();
      expect(pasoActual(fixture)).toBe('2 Contacto y ubicación');
      expect(raiz(fixture).querySelector('#err-email')?.textContent?.trim()).toBe('Correo electrónico es obligatorio.');
    });
  });

  // ─── Listas cerradas: value del contrato y etiqueta de la spec ─────────────

  describe('listas cerradas', () => {
    it('«Tipo de persona»: Persona jurídica → legal, Persona natural → natural', () => {
      const { fixture } = crear();
      const radios = Array.from(raiz(fixture).querySelectorAll<HTMLInputElement>('input[type="radio"]')).map(r => [
        r.value,
        r.parentElement?.textContent?.trim() ?? ''
      ]);
      expect(radios).toEqual([
        ['legal', 'Persona jurídica'],
        ['natural', 'Persona natural']
      ]);
    });

    it('«Tipo de identificación»: Cédula → cedula, RUC → ruc, Pasaporte → passport', () => {
      const { fixture } = crear();
      expect(opcionesDe(fixture, 'idType')).toEqual([
        ['', ''],
        ['cedula', 'Cédula'],
        ['ruc', 'RUC'],
        ['passport', 'Pasaporte']
      ]);
    });

    it('«Ciudad»: las 8 ciudades con su value del contrato', () => {
      const { fixture } = crear();
      expect(opcionesDe(fixture, 'city')).toEqual([
        ['', 'Selecciona…'],
        ['guayaquil', 'Guayaquil'],
        ['quito', 'Quito'],
        ['manta', 'Manta'],
        ['cuenca', 'Cuenca'],
        ['duran', 'Durán'],
        ['ambato', 'Ambato'],
        ['machala', 'Machala'],
        ['riobamba', 'Riobamba']
      ]);
    });

    it('«Canal de origen»: los 5 canales con su value del contrato', () => {
      const { fixture } = crear();
      expect(opcionesDe(fixture, 'sourceChannel')).toEqual([
        ['', 'Selecciona…'],
        ['referido_de_cliente', 'Referido de cliente'],
        ['cartera_propia', 'Cartera propia'],
        ['campana_digital', 'Campaña digital'],
        ['alianza_bancaria', 'Alianza bancaria'],
        ['cuenta_estrategica', 'Cuenta estratégica']
      ]);
    });
  });

  // ─── Obligatorios ──────────────────────────────────────────────────────────

  describe('obligatorios', () => {
    it('fld_98e5c2bf7a · fld_2def6e5353 · fld_10bed3f3b1 · fld_b779dfd9c9 · fld_3a61e63ab6 :required — sin ellos no se envía y aparece cada mensaje literal', () => {
      const { fixture, customerRepo } = crear();

      guardar(fixture);

      expect(customerRepo.createCustomer).not.toHaveBeenCalled();
      expect(pasoActual(fixture)).toBe('1 Identificación');
      expect(errorDe(fixture, 'personType')).toBe('Tipo de persona es obligatorio.');
      expect(errorDe(fixture, 'idType')).toBe('Tipo de identificación es obligatorio.');
      expect(errorDe(fixture, 'idNumber')).toBe('Número de identificación es obligatorio.');
      expect(errorDe(fixture, 'email')).toBe('Correo electrónico es obligatorio.');
      expect(errorDe(fixture, 'sourceChannel')).toBe('Selecciona el canal de origen.');
    });

    it('los opcionales no dicen nada al guardar vacíos', () => {
      const { fixture } = crear();
      guardar(fixture);
      for (const id of ['mobilePhone', 'city', 'address', 'accountExecutiveId', 'notes', 'contactName', 'contactTitle', 'contactEmail']) {
        expect(errorDe(fixture, id)).toBeNull();
      }
    });

    it('los mensajes no aparecen antes de tocar el campo o de intentar guardar', () => {
      const { fixture } = crear();
      expect(raiz(fixture).querySelectorAll('.mensaje-error').length).toBe(0);
    });
  });

  // ─── Validaciones custom ───────────────────────────────────────────────────

  describe('Número de identificación', () => {
    it('fld_10bed3f3b1:custom-1 — un RUC que no tiene 13 dígitos o no termina en 001 dice «El RUC debe tener 13 dígitos y terminar en 001.»', () => {
      const { fixture } = crear();
      elegir(fixture, 'idType', 'ruc');
      escribir(fixture, 'idNumber', '0912345678002');
      expect(errorDe(fixture, 'idNumber')).toBe('El RUC debe tener 13 dígitos y terminar en 001.');

      escribir(fixture, 'idNumber', '0912345678001');
      expect(errorDe(fixture, 'idNumber')).toBeNull();
    });

    it('fld_10bed3f3b1:custom-2 — una cédula que no tiene 10 dígitos dice «La cédula debe tener 10 dígitos.»', () => {
      const { fixture } = crear();
      elegir(fixture, 'idType', 'cedula');
      escribir(fixture, 'idNumber', '091234');
      expect(errorDe(fixture, 'idNumber')).toBe('La cédula debe tener 10 dígitos.');

      escribir(fixture, 'idNumber', '09123 45678');
      expect(errorDe(fixture, 'idNumber')).toBeNull();
    });

    it('fld_10bed3f3b1:custom-3 — un pasaporte fuera de 5 a 20 letras o dígitos dice «Número no válido.»', () => {
      const { fixture } = crear();
      elegir(fixture, 'idType', 'passport');
      escribir(fixture, 'idNumber', 'AB-1');
      expect(errorDe(fixture, 'idNumber')).toBe('Número no válido.');

      escribir(fixture, 'idNumber', 'ab12345');
      expect(errorDe(fixture, 'idNumber')).toBeNull();
    });

    it('cambiar el tipo de identificación vuelve a validar el número ya escrito', () => {
      const { fixture } = crear();
      elegir(fixture, 'idType', 'cedula');
      escribir(fixture, 'idNumber', '0912345678');
      expect(errorDe(fixture, 'idNumber')).toBeNull();

      elegir(fixture, 'idType', 'ruc');
      expect(errorDe(fixture, 'idNumber')).toBe('El RUC debe tener 13 dígitos y terminar en 001.');
    });

    it('sin tipo de identificación, el formato no se juzga (solo lo obligatorio)', () => {
      const { fixture } = crear();
      escribir(fixture, 'idNumber', '12');
      expect(errorDe(fixture, 'idNumber')).toBeNull();
    });

    it('enseña la ayuda «Validamos el formato y que no esté registrado.»', () => {
      const { fixture } = crear();
      expect(raiz(fixture).querySelector('#ayuda-idNumber')?.textContent?.trim()).toBe(
        'Validamos el formato y que no esté registrado.'
      );
    });
  });

  describe('Correo electrónico', () => {
    it('fld_b779dfd9c9:custom-1 — un correo no válido dice «Ingresa un correo válido.» y no se envía', () => {
      const { fixture, customerRepo } = crear();
      escribir(fixture, 'email', 'ana@');
      expect(errorDe(fixture, 'email')).toBe('Ingresa un correo válido.');

      llenarValido(fixture);
      escribir(fixture, 'email', 'ana@');
      guardar(fixture);
      expect(customerRepo.createCustomer).not.toHaveBeenCalled();
      expect(pasoActual(fixture)).toBe('2 Contacto y ubicación');
    });
  });

  // ─── Reglas de «Tipo de persona» ───────────────────────────────────────────

  describe('reglas de «Tipo de persona»', () => {
    it('al empezar, Razón social, Nombres y Apellidos están ocultos', () => {
      const { fixture } = crear();
      expect(existe(fixture, 'legalName')).toBe(false);
      expect(existe(fixture, 'firstNames')).toBe(false);
      expect(existe(fixture, 'lastNames')).toBe(false);
    });

    it('int_40b0c02a2a:regla · fld_1118c50140:custom-1 — legal muestra y exige «Razón social» («Completa el nombre.»); al dejar de cumplirse vuelve a su estado de partida', () => {
      const { fixture } = crear();
      tipoDePersona(fixture, 'legal');
      expect(existe(fixture, 'legalName')).toBe(true);
      expect(existe(fixture, 'firstNames')).toBe(false);

      guardar(fixture);
      expect(errorDe(fixture, 'legalName')).toBe('Completa el nombre.');
      escribir(fixture, 'legalName', '   ');
      expect(errorDe(fixture, 'legalName')).toBe('Completa el nombre.');
      escribir(fixture, 'legalName', 'Acme S.A.');
      expect(errorDe(fixture, 'legalName')).toBeNull();

      tipoDePersona(fixture, 'natural');
      expect(existe(fixture, 'legalName')).toBe(false);
      tipoDePersona(fixture, 'legal');
      expect(valorDe(fixture, 'legalName')).toBe('');
    });

    it('int_b9ba60fca4:regla · fld_beb1e2651d:custom-1 · fld_6c68ba896d:custom-1 — natural muestra y exige «Nombres» y «Apellidos» («Completa el nombre.»); al dejar de cumplirse vuelven a su estado de partida', () => {
      const { fixture } = crear();
      tipoDePersona(fixture, 'natural');
      expect(existe(fixture, 'firstNames')).toBe(true);
      expect(existe(fixture, 'lastNames')).toBe(true);
      expect(existe(fixture, 'legalName')).toBe(false);

      guardar(fixture);
      expect(errorDe(fixture, 'firstNames')).toBe('Completa el nombre.');
      expect(errorDe(fixture, 'lastNames')).toBe('Completa el nombre.');

      escribir(fixture, 'firstNames', 'Ana');
      tipoDePersona(fixture, 'legal');
      expect(existe(fixture, 'firstNames')).toBe(false);
      expect(existe(fixture, 'lastNames')).toBe(false);
      tipoDePersona(fixture, 'natural');
      expect(valorDe(fixture, 'firstNames')).toBe('');
    });

    it('un nombre oculto no se exige ni se envía', () => {
      const { fixture, customerRepo } = crear();
      customerRepo.createCustomer.mockReturnValue(of(CLIENTE_CREADO));
      tipoDePersona(fixture, 'legal');
      escribir(fixture, 'legalName', 'Acme S.A.');
      tipoDePersona(fixture, 'natural');
      llenarValido(fixture);

      guardar(fixture);

      const cuerpo = customerRepo.createCustomer.mock.calls[0][0];
      expect(cuerpo).not.toHaveProperty('legalName');
    });
  });

  // ─── «Guardar cliente» (POST /api/customers) ───────────────────────────────

  describe('«Guardar cliente»', () => {
    it('act_wgdgtpkk:llama — llama a POST /api/customers con cada campo en su ruta del cuerpo', () => {
      const { fixture, customerRepo } = crear();
      customerRepo.createCustomer.mockReturnValue(of(CLIENTE_CREADO));

      llenarValido(fixture);
      escribir(fixture, 'mobilePhone', '+593 99 123 4567');
      elegir(fixture, 'city', 'duran');
      escribir(fixture, 'address', 'Av. 9 de Octubre 100');
      elegir(fixture, 'accountExecutiveId', '665f1c2a9b1e8a0000000002');
      escribir(fixture, 'notes', 'Llamar el lunes');
      escribir(fixture, 'contactName', 'Luis Mora');
      escribir(fixture, 'contactTitle', 'Gerente');
      escribir(fixture, 'contactEmail', 'luis@example.com');

      guardar(fixture);

      expect(customerRepo.createCustomer).toHaveBeenCalledTimes(1);
      expect(customerRepo.createCustomer).toHaveBeenCalledWith({
        personType: 'natural',
        idType: 'cedula',
        idNumber: '0912345678',
        firstNames: 'Ana María',
        lastNames: 'Pérez Ruiz',
        email: 'ana@example.com',
        mobilePhone: '+593 99 123 4567',
        city: 'duran',
        address: 'Av. 9 de Octubre 100',
        sourceChannel: 'cartera_propia',
        accountExecutiveId: '665f1c2a9b1e8a0000000002',
        notes: 'Llamar el lunes',
        contactName: 'Luis Mora',
        contactTitle: 'Gerente',
        contactEmail: 'luis@example.com'
      });
    });

    it('persona jurídica: envía legalName y no los nombres; los opcionales vacíos no viajan', () => {
      const { fixture, customerRepo } = crear();
      customerRepo.createCustomer.mockReturnValue(of(CLIENTE_CREADO));
      tipoDePersona(fixture, 'legal');
      elegir(fixture, 'idType', 'ruc');
      escribir(fixture, 'idNumber', '0912345678001');
      escribir(fixture, 'legalName', '  Acme S.A. ');
      escribir(fixture, 'email', 'info@acme.ec');
      elegir(fixture, 'sourceChannel', 'cuenta_estrategica');

      guardar(fixture);

      expect(customerRepo.createCustomer).toHaveBeenCalledWith({
        personType: 'legal',
        idType: 'ruc',
        idNumber: '0912345678001',
        legalName: 'Acme S.A.',
        email: 'info@acme.ec',
        sourceChannel: 'cuenta_estrategica'
      });
    });

    it('AC-19 · nav_e3aa3bac6a:navega — con 201 avisa «Se guardó correctamente.» y va a /prospectos/:id', async () => {
      const { fixture, customerRepo, router } = crear();
      customerRepo.createCustomer.mockReturnValue(of(CLIENTE_CREADO));
      llenarValido(fixture);

      guardar(fixture);
      await fixture.whenStable();

      expect(raiz(fixture).querySelector('.aviso-exito')?.textContent?.trim()).toBe('Se guardó correctamente.');
      expect(router.url).toBe('/prospectos/c-123');
      expect(router.lastSuccessfulNavigation()?.extras.state).toEqual({ aviso: 'Se guardó correctamente.' });
    });

    it('AC-20 — con 400 avisa «Revisa los datos marcados.», lleva al paso del primer campo marcado, conserva lo escrito y el aviso se va al corregir', () => {
      const { fixture, customerRepo } = crear();
      customerRepo.createCustomer.mockReturnValue(
        throwError(() => new InvalidCustomerInputError([
          { field: 'accountExecutiveId', message: 'Selecciona un ejecutivo válido.' },
          { field: 'city', message: 'El valor de Ciudad no es válido.' },
          { field: 'otroCampo', message: 'no se pinta' }
        ]))
      );
      llenarValido(fixture);

      guardar(fixture);

      expect(pasoActual(fixture)).toBe('2 Contacto y ubicación');
      expect(raiz(fixture).querySelector('.aviso-error')?.textContent?.trim()).toBe('Revisa los datos marcados.');
      expect(errorDe(fixture, 'city')).toBe('El valor de Ciudad no es válido.');
      expect(errorDe(fixture, 'accountExecutiveId')).toBe('Selecciona un ejecutivo válido.');
      expect(valorDe(fixture, 'idNumber')).toBe('0912345678');
      expect(valorDe(fixture, 'firstNames')).toBe('Ana María');
      expect(texto(fixture)).not.toContain('no se pinta');

      // Corregir un campo quita su mensaje; el aviso sigue mientras quede otro marcado.
      elegir(fixture, 'city', 'quito');
      expect(errorDe(fixture, 'city')).toBeNull();
      expect(raiz(fixture).querySelector('.aviso-error')).not.toBeNull();

      elegir(fixture, 'accountExecutiveId', '665f1c2a9b1e8a0000000001');
      expect(errorDe(fixture, 'accountExecutiveId')).toBeNull();
      expect(raiz(fixture).querySelector('.aviso-error')).toBeNull();
    });

    it('con 400 sin details por campo, el aviso se va con la primera corrección', () => {
      const { fixture, customerRepo } = crear();
      customerRepo.createCustomer.mockReturnValue(throwError(() => new InvalidCustomerInputError([])));
      llenarValido(fixture);

      guardar(fixture);
      expect(raiz(fixture).querySelector('.aviso-error')?.textContent?.trim()).toBe('Revisa los datos marcados.');

      escribir(fixture, 'notes', 'x');
      expect(raiz(fixture).querySelector('.aviso-error')).toBeNull();
    });

    it('AC-21 — con 401 al guardar dice «Tu sesión terminó: vuelve a entrar.» con el enlace al inicio de sesión', () => {
      const { fixture, customerRepo } = crear();
      customerRepo.createCustomer.mockReturnValue(throwError(() => new CustomerUnauthorizedError()));
      llenarValido(fixture);

      guardar(fixture);

      const aviso = raiz(fixture).querySelector('.estado-sin-sesion');
      expect(aviso?.textContent?.trim()).toBe('Tu sesión terminó: vuelve a entrar.');
      expect(aviso?.querySelector('a.enlace-entrar')?.getAttribute('href')).toBe(
        `${environment.identityProviderUrl}?returnUrl=%2Fnuevo-prospecto`
      );
    });

    it('AC-22 · fld_10bed3f3b1:custom-4 — con 409 dice «Ya existe un cliente con esta identificación.» en el número, conserva lo escrito y vuelve a cargar los ejecutivos', () => {
      const { fixture, customerRepo, executiveRepo } = crear();
      customerRepo.createCustomer.mockReturnValue(throwError(() => new DuplicateCustomerError()));
      llenarValido(fixture);
      elegir(fixture, 'accountExecutiveId', '665f1c2a9b1e8a0000000001');
      expect(executiveRepo.listExecutives).toHaveBeenCalledTimes(1);

      guardar(fixture);

      expect(pasoActual(fixture)).toBe('1 Identificación');
      expect(raiz(fixture).querySelector('#err-idNumber')?.textContent?.trim()).toBe(
        'Ya existe un cliente con esta identificación.'
      );
      expect(raiz(fixture).querySelector('.aviso-error')?.textContent?.trim()).toBe(
        'Ya existe un cliente con esta identificación.'
      );
      expect(executiveRepo.listExecutives).toHaveBeenCalledTimes(2);
      expect(valorDe(fixture, 'idNumber')).toBe('0912345678');
      expect(valorDe(fixture, 'email')).toBe('ana@example.com');
      expect(valorDe(fixture, 'accountExecutiveId')).toBe('665f1c2a9b1e8a0000000001');

      // Al cambiar el número se van el mensaje y el aviso (lo vuelve a decidir el servidor).
      escribir(fixture, 'idNumber', '0912345679');
      expect(errorDe(fixture, 'idNumber')).toBeNull();
      expect(raiz(fixture).querySelector('.aviso-error')).toBeNull();
    });

    it('con un error no previsto (500) no inventa un aviso: conserva lo escrito y deja volver a guardar', () => {
      const { fixture, customerRepo } = crear();
      customerRepo.createCustomer.mockReturnValue(
        throwError(() => new CustomerInfrastructureError(500, '/api/customers'))
      );
      llenarValido(fixture);

      guardar(fixture);

      expect(raiz(fixture).querySelector('.aviso')).toBeNull();
      expect(texto(fixture)).not.toContain('No se pudo cargar');
      expect(boton(fixture, 'btn-guardar')?.disabled).toBe(false);
      expect(valorDe(fixture, 'idNumber')).toBe('0912345678');
    });

    it('mientras se guarda, «Guardar cliente» está desactivado y un segundo clic no envía otra vez', () => {
      const { fixture, customerRepo } = crear();
      const enVuelo = new Subject<Customer>();
      customerRepo.createCustomer.mockReturnValue(enVuelo.asObservable());
      llenarValido(fixture);

      guardar(fixture);
      expect(boton(fixture, 'btn-guardar')?.disabled).toBe(true);
      fixture.componentInstance.guardar();
      expect(customerRepo.createCustomer).toHaveBeenCalledTimes(1);

      enVuelo.error(new CustomerInfrastructureError(500, '/api/customers'));
      fixture.detectChanges();
      expect(boton(fixture, 'btn-guardar')?.disabled).toBe(false);
    });
  });

  // ─── Navegación ────────────────────────────────────────────────────────────

  describe('navegación', () => {
    it('nav_a15f925b20:navega — «Clientes» va a /prospectos', async () => {
      const { fixture, router } = crear();
      const enlace = Array.from(raiz(fixture).querySelectorAll<HTMLAnchorElement>('a')).find(
        a => a.textContent?.trim() === 'Clientes'
      );
      expect(enlace).toBeDefined();

      enlace?.click();
      await fixture.whenStable();

      expect(router.url).toBe('/prospectos');
    });
  });

  // ─── Textos de la pantalla ─────────────────────────────────────────────────

  it('enseña el título, los cuatro pasos y las etiquetas de la spec', () => {
    const { fixture } = crear();
    expect(raiz(fixture).querySelector('h1')?.textContent?.trim()).toBe('Nuevo cliente');
    const pasos = Array.from(raiz(fixture).querySelectorAll('ol.pasos li')).map(li =>
      li.textContent?.replace(/\s+/g, ' ').trim()
    );
    expect(pasos).toEqual(['1 Identificación', '2 Contacto y ubicación', '3 Información comercial', '4 Contactos']);

    const etiquetas: string[] = [];
    for (const paso of [0, 1, 2, 3]) {
      irAlPaso(fixture, paso);
      etiquetas.push(...Array.from(raiz(fixture).querySelectorAll('fieldset label[for], fieldset .etiqueta')).map(
        l => l.textContent?.trim() ?? ''
      ));
    }
    expect(etiquetas).toEqual([
      'Tipo de persona', 'Tipo de identificación', 'Número de identificación',
      'Correo electrónico', 'Teléfono celular', 'Ciudad', 'Dirección',
      'Canal de origen', 'Ejecutivo asignado', 'Observaciones',
      'Nombre', 'Cargo', 'Correo'
    ]);
    expect(campo<HTMLInputElement>(fixture, 'mobilePhone').placeholder).toBe('+593 9…');
  });
});
