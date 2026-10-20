import { Component, computed, DestroyRef, inject, OnInit, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import {
  AbstractControl,
  FormControl,
  FormGroup,
  ReactiveFormsModule,
  ValidationErrors,
  ValidatorFn,
  Validators
} from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { ValidationService } from '../../../../@core/services/validation.service';
import { CreateCustomerUseCase } from '../../application/customer.use-cases';
import { ListExecutivesUseCase } from '../../application/executive.use-cases';
import { CreateCustomerPayload, CustomerFieldError } from '../../domain/models/customer.model';
import { ExecutiveOption } from '../../domain/models/executive.model';
import {
  CustomerUnauthorizedError,
  DuplicateCustomerError,
  InvalidCustomerInputError
} from '../../domain/errors/customer.errors';
import { ExecutiveUnauthorizedError } from '../../domain/errors/executive.errors';
import { environment } from '../../../../../environments/environment';

/** Los estados de vista de /nuevo-prospecto, con sus textos literales (GREEN-H2-UX-CLIENTES-001 v4). */
export const ESTADOS_DE_VISTA = {
  loading: 'Cargando…',
  empty: 'No hay datos que mostrar.',
  error: 'No se pudo cargar. Vuelve a intentarlo.',
  200: 'Datos al día.',
  201: 'Se guardó correctamente.',
  400: 'Revisa los datos marcados.',
  401: 'Tu sesión terminó: vuelve a entrar.',
  409: 'Ya existe un cliente con esta identificación.'
} as const;

/** Los mensajes literales de cada validación del formulario (§2 del pack). */
export const MENSAJES = {
  personTypeRequired: 'Tipo de persona es obligatorio.',
  idTypeRequired: 'Tipo de identificación es obligatorio.',
  idNumberRequired: 'Número de identificación es obligatorio.',
  rucInvalid: 'El RUC debe tener 13 dígitos y terminar en 001.',
  cedulaInvalid: 'La cédula debe tener 10 dígitos.',
  idNumberInvalid: 'Número no válido.',
  idNumberDuplicate: 'Ya existe un cliente con esta identificación.',
  nameRequired: 'Completa el nombre.',
  emailRequired: 'Correo electrónico es obligatorio.',
  emailInvalid: 'Ingresa un correo válido.',
  sourceChannelRequired: 'Selecciona el canal de origen.'
} as const;

/** El mensaje de «obligatorio» de cada campo que lo es desde el principio. */
const OBLIGATORIO: Partial<Record<CampoDelFormulario, string>> = {
  personType: MENSAJES.personTypeRequired,
  idType: MENSAJES.idTypeRequired,
  idNumber: MENSAJES.idNumberRequired,
  email: MENSAJES.emailRequired,
  sourceChannel: MENSAJES.sourceChannelRequired
};

export interface Opcion {
  value: string;
  label: string;
}

/** Las opciones de cada select y radio, con el value del contrato de POST /api/customers. */
export const OPCIONES: Record<'personType' | 'idType' | 'city' | 'sourceChannel', Opcion[]> = {
  personType: [
    { label: 'Persona jurídica', value: 'legal' },
    { label: 'Persona natural', value: 'natural' }
  ],
  idType: [
    { label: 'Cédula', value: 'cedula' },
    { label: 'RUC', value: 'ruc' },
    { label: 'Pasaporte', value: 'passport' }
  ],
  city: [
    { label: 'Guayaquil', value: 'guayaquil' },
    { label: 'Quito', value: 'quito' },
    { label: 'Manta', value: 'manta' },
    { label: 'Cuenca', value: 'cuenca' },
    { label: 'Durán', value: 'duran' },
    { label: 'Ambato', value: 'ambato' },
    { label: 'Machala', value: 'machala' },
    { label: 'Riobamba', value: 'riobamba' }
  ],
  sourceChannel: [
    { label: 'Referido de cliente', value: 'referido_de_cliente' },
    { label: 'Cartera propia', value: 'cartera_propia' },
    { label: 'Campaña digital', value: 'campana_digital' },
    { label: 'Alianza bancaria', value: 'alianza_bancaria' },
    { label: 'Cuenta estratégica', value: 'cuenta_estrategica' }
  ]
};

const CAMPOS = [
  'personType',
  'idType',
  'idNumber',
  'legalName',
  'firstNames',
  'lastNames',
  'email',
  'mobilePhone',
  'city',
  'address',
  'sourceChannel',
  'accountExecutiveId',
  'notes',
  'contactName',
  'contactTitle',
  'contactEmail'
] as const;

export type CampoDelFormulario = (typeof CAMPOS)[number];

/** Los nombres que se muestran (y se exigen) según el tipo de persona. */
const CAMPOS_DE_NOMBRE = ['legalName', 'firstNames', 'lastNames'] as const;

type EstadoDeCarga = 'loading' | 'empty' | 'error' | 'data';

interface Aviso {
  tipo: 'exito' | 'error';
  texto: string;
}

/**
 * «Completa el nombre.»: solo se aplica mientras el campo se muestra (oculto, está
 * desactivado y Angular no lo valida ni lo envía).
 */
const nombreCompleto: ValidatorFn = (control: AbstractControl): ValidationErrors | null =>
  typeof control.value === 'string' && control.value.trim() !== '' ? null : { nameRequired: true };

/**
 * El formato del número según el tipo de identificación, sobre el número sin espacios y en
 * mayúsculas. El servidor lo vuelve a validar (R4-SEG-4); que no esté registrado lo decide él (409).
 */
const formatoDeIdentificacion: ValidatorFn = (control: AbstractControl): ValidationErrors | null => {
  const idType = control.parent?.get('idType')?.value;
  const numero = typeof control.value === 'string' ? control.value.replace(/\s+/g, '').toUpperCase() : '';
  if (numero === '' || !idType) return null;
  switch (idType) {
    case 'ruc':
      return /^\d{10}001$/.test(numero) ? null : { idFormat: MENSAJES.rucInvalid };
    case 'cedula':
      return /^\d{10}$/.test(numero) ? null : { idFormat: MENSAJES.cedulaInvalid };
    default:
      return /^[A-Z0-9]{5,20}$/.test(numero) ? null : { idFormat: MENSAJES.idNumberInvalid };
  }
};

/** Los cuatro pasos del asistente (secciones kind: step), con los campos de cada uno. */
export const PASOS: ReadonlyArray<{ titulo: string; campos: readonly CampoDelFormulario[] }> = [
  { titulo: 'Identificación', campos: ['personType', 'idType', 'idNumber', 'legalName', 'firstNames', 'lastNames'] },
  { titulo: 'Contacto y ubicación', campos: ['email', 'mobilePhone', 'city', 'address'] },
  { titulo: 'Información comercial', campos: ['sourceChannel', 'accountExecutiveId', 'notes'] },
  { titulo: 'Contactos', campos: ['contactName', 'contactTitle', 'contactEmail'] }
];

/**
 * Pantalla /nuevo-prospecto («Nuevo cliente»): el alta de un cliente en un asistente de 4 pasos.
 * Carga las opciones de «Ejecutivo asignado» (GET /api/executives) y guarda con
 * «Guardar cliente» (POST /api/customers). Sin lógica de negocio: lo decide el backend.
 */
@Component({
  selector: 'app-customer-new',
  standalone: true,
  imports: [ReactiveFormsModule, RouterLink],
  templateUrl: './customer-new.component.html',
  styleUrl: './customer-new.component.css'
})
export class CustomerNewComponent implements OnInit {
  private readonly listExecutivesUseCase = inject(ListExecutivesUseCase);
  private readonly createCustomerUseCase = inject(CreateCustomerUseCase);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);
  private readonly validation = inject(ValidationService);

  readonly estados = ESTADOS_DE_VISTA;
  readonly opciones = OPCIONES;
  readonly pasos = PASOS;
  /** «vuelve a entrar» lleva al inicio de sesión y, al volver, a esta pantalla. */
  readonly urlDeEntrada = `${environment.identityProviderUrl}?returnUrl=${encodeURIComponent('/nuevo-prospecto')}`;

  readonly form = new FormGroup({
    personType: new FormControl('', { nonNullable: true, validators: [Validators.required] }),
    idType: new FormControl('', { nonNullable: true, validators: [Validators.required] }),
    idNumber: new FormControl('', {
      nonNullable: true,
      validators: [Validators.required, formatoDeIdentificacion]
    }),
    legalName: new FormControl({ value: '', disabled: true }, { nonNullable: true, validators: [nombreCompleto] }),
    firstNames: new FormControl({ value: '', disabled: true }, { nonNullable: true, validators: [nombreCompleto] }),
    lastNames: new FormControl({ value: '', disabled: true }, { nonNullable: true, validators: [nombreCompleto] }),
    email: new FormControl('', {
      nonNullable: true,
      validators: [Validators.required, this.validation.email()]
    }),
    mobilePhone: new FormControl('', { nonNullable: true }),
    city: new FormControl('', { nonNullable: true }),
    address: new FormControl('', { nonNullable: true }),
    sourceChannel: new FormControl('', { nonNullable: true, validators: [Validators.required] }),
    accountExecutiveId: new FormControl('', { nonNullable: true }),
    notes: new FormControl('', { nonNullable: true }),
    contactName: new FormControl('', { nonNullable: true }),
    contactTitle: new FormControl('', { nonNullable: true }),
    contactEmail: new FormControl('', { nonNullable: true })
  });

  /** El paso que se ve, de 0 a 3. */
  readonly paso = signal(0);
  readonly esPrimerPaso = computed(() => this.paso() === 0);
  readonly esUltimoPaso = computed(() => this.paso() === PASOS.length - 1);
  /** Estado de la carga de la pantalla (las opciones de «Ejecutivo asignado»). */
  readonly estadoCarga = signal<EstadoDeCarga>('loading');
  /** «Datos al día.» se ve tras cargar, hasta que la persona empieza a escribir. */
  readonly alDiaVisible = signal(false);
  readonly ejecutivos = signal<ExecutiveOption[]>([]);
  /** Qué nombres se muestran: lo dicen las reglas de «Tipo de persona». */
  readonly visibles = signal<Record<(typeof CAMPOS_DE_NOMBRE)[number], boolean>>({
    legalName: false,
    firstNames: false,
    lastNames: false
  });
  /** Se intentó guardar: los mensajes de validación se ven aunque el campo no se haya tocado. */
  readonly intentado = signal(false);
  readonly enviando = signal(false);
  /** El resultado de «Guardar cliente» (201, 400 o 409). */
  readonly aviso = signal<Aviso | null>(null);
  /** Los mensajes que devolvió el servidor por campo (400 details, 409 en idNumber). */
  readonly erroresServidor = signal<Partial<Record<CampoDelFormulario, string>>>({});
  /** 401 en cualquier llamada: la sesión terminó. */
  readonly sesionTerminada = signal(false);

  ngOnInit(): void {
    const c = this.form.controls;
    c.personType.valueChanges
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(tipo => this.aplicarReglas(tipo));
    c.idType.valueChanges
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(() => c.idNumber.updateValueAndValidity());
    for (const campo of CAMPOS) {
      c[campo].valueChanges
        .pipe(takeUntilDestroyed(this.destroyRef))
        .subscribe(() => this.alEditar(campo));
    }
    this.cargarEjecutivos();
  }

  /**
   * «Cargar las opciones de «Ejecutivo asignado»» (GET /api/executives), sin caché.
   * `anunciar` = false en la recarga tras un 409: «Datos al día.» no se vuelve a enseñar junto
   * al aviso del duplicado (pregunta abierta en el informe).
   */
  cargarEjecutivos(anunciar = true): void {
    this.estadoCarga.set('loading');
    this.alDiaVisible.set(false);
    this.listExecutivesUseCase.execute().subscribe({
      next: opciones => {
        this.ejecutivos.set(opciones);
        this.estadoCarga.set(opciones.length === 0 ? 'empty' : 'data');
        this.alDiaVisible.set(anunciar && opciones.length > 0);
      },
      error: (err: Error) => {
        if (err instanceof ExecutiveUnauthorizedError) {
          this.sesionTerminada.set(true);
        } else {
          this.estadoCarga.set('error');
        }
      }
    });
  }

  /** «Anterior» (ctl_09c796ca67): solo cambia la pantalla. */
  anterior(): void {
    if (!this.esPrimerPaso()) this.paso.update(p => p - 1);
  }

  /** «Siguiente» (ctl_9f3ce694c5): solo cambia la pantalla; lo obligatorio se juzga al guardar. */
  siguiente(): void {
    if (!this.esUltimoPaso()) this.paso.update(p => p + 1);
  }

  /**
   * «Cancelar» (ctl_ac849da96b): solo cambia la pantalla. Lo mínimo sin inventar una ruta:
   * el formulario vuelve a su estado de partida y el asistente, al primer paso.
   */
  cancelar(): void {
    // reset() emite el cambio de cada campo: alEditar() quita sus mensajes del servidor, y con el
    // último se va el aviso del 400/409, y «Datos al día.».
    this.form.reset();
    this.intentado.set(false);
    this.paso.set(0);
  }

  /** «Guardar cliente» (POST /api/customers). */
  guardar(): void {
    this.intentado.set(true);
    this.form.markAllAsTouched();
    if (this.form.invalid) {
      this.irAlPasoDe(CAMPOS.filter(campo => this.form.controls[campo].invalid));
      return;
    }
    if (this.enviando()) return;

    this.enviando.set(true);
    this.aviso.set(null);
    this.createCustomerUseCase.execute(this.cuerpo()).subscribe({
      next: cliente => {
        this.enviando.set(false);
        this.aviso.set({ tipo: 'exito', texto: ESTADOS_DE_VISTA[201] });
        this.router.navigate(['/prospectos', cliente.id], {
          state: { aviso: ESTADOS_DE_VISTA[201] }
        });
      },
      error: (err: Error) => {
        this.enviando.set(false);
        if (err instanceof InvalidCustomerInputError) {
          const errores = this.porCampo(err.details);
          this.erroresServidor.set(errores);
          this.aviso.set({ tipo: 'error', texto: ESTADOS_DE_VISTA[400] });
          this.irAlPasoDe(Object.keys(errores) as CampoDelFormulario[]);
        } else if (err instanceof DuplicateCustomerError) {
          // Con 409: conserva lo escrito y vuelve a cargar las opciones de «Ejecutivo asignado».
          this.erroresServidor.set({ idNumber: MENSAJES.idNumberDuplicate });
          this.aviso.set({ tipo: 'error', texto: ESTADOS_DE_VISTA[409] });
          this.irAlPasoDe(['idNumber']);
          this.cargarEjecutivos(false);
        } else if (err instanceof CustomerUnauthorizedError) {
          this.sesionTerminada.set(true);
        }
        // Cualquier otro error (500…): la spec no le da mensaje en esta pantalla. Lo escrito se
        // conserva y «Guardar cliente» se puede volver a pulsar (pregunta abierta en el informe).
      }
    });
  }

  /** El mensaje que se ve bajo un campo: primero el del servidor, luego el de la validación. */
  mensajeDe(campo: CampoDelFormulario): string | null {
    const delServidor = this.erroresServidor()[campo];
    if (delServidor) return delServidor;

    const control = this.form.controls[campo];
    if (control.disabled || !control.errors || !(control.touched || this.intentado())) return null;
    const errores = control.errors;
    if (errores['required']) return OBLIGATORIO[campo] ?? null;
    if (errores['idFormat']) return errores['idFormat'] as string;
    if (errores['nameRequired']) return MENSAJES.nameRequired;
    if (errores['email']) return MENSAJES.emailInvalid;
    return null;
  }

  /**
   * Reglas de «Tipo de persona» (int_40b0c02a2a, int_b9ba60fca4): legal muestra y exige
   * «Razón social»; otro valor, «Nombres» y «Apellidos». Al dejar de cumplirse, el campo vuelve
   * a su estado de partida: oculto, vacío y sin exigirse. Sin tipo (al empezar o tras «Cancelar»),
   * los tres siguen ocultos: las reglas se disparan al cambiarlo (trigger on change).
   */
  private aplicarReglas(tipo: string): void {
    const legal = tipo === 'legal';
    const hayTipo = tipo !== '';
    const visibles = { legalName: legal, firstNames: hayTipo && !legal, lastNames: hayTipo && !legal };
    for (const campo of CAMPOS_DE_NOMBRE) {
      const control = this.form.controls[campo];
      if (visibles[campo]) {
        control.enable({ emitEvent: false });
      } else {
        control.reset('', { emitEvent: false });
        control.disable({ emitEvent: false });
        this.olvidarErrorDelServidor(campo);
      }
    }
    this.visibles.set(visibles);
  }

  /** Lleva el asistente al primer paso que tiene alguno de estos campos. */
  private irAlPasoDe(campos: readonly CampoDelFormulario[]): void {
    const indice = PASOS.findIndex(p => p.campos.some(campo => campos.includes(campo)));
    if (indice >= 0) this.paso.set(indice);
  }

  /** Al escribir: «Datos al día.» deja de verse y el mensaje del servidor de ese campo se va. */
  private alEditar(campo: CampoDelFormulario): void {
    this.alDiaVisible.set(false);
    this.olvidarErrorDelServidor(campo);
  }

  /** El cuerpo de POST /api/customers: los campos visibles con valor (un campo oculto cuenta como vacío). */
  private cuerpo(): CreateCustomerPayload {
    const cuerpo: Record<string, string> = {};
    for (const [campo, valor] of Object.entries(this.form.value)) {
      const texto = typeof valor === 'string' ? valor.trim() : '';
      if (texto !== '') cuerpo[campo] = texto;
    }
    return cuerpo as unknown as CreateCustomerPayload;
  }

  private porCampo(details: CustomerFieldError[]): Partial<Record<CampoDelFormulario, string>> {
    const errores: Partial<Record<CampoDelFormulario, string>> = {};
    for (const { field, message } of details) {
      if ((CAMPOS as readonly string[]).includes(field)) {
        errores[field as CampoDelFormulario] ??= message;
      }
    }
    return errores;
  }

  /**
   * Quita el mensaje del servidor de un campo. El aviso del 400 o del 409 se va con el último
   * campo corregido (o con la primera edición, si el 400 no marcó ninguno).
   */
  private olvidarErrorDelServidor(campo: CampoDelFormulario): void {
    const errores = { ...this.erroresServidor() };
    delete errores[campo];
    this.erroresServidor.set(errores);
    if (this.aviso()?.tipo === 'error' && Object.keys(errores).length === 0) {
      this.aviso.set(null);
    }
  }
}
