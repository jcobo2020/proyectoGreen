import mongoose, { Types } from 'mongoose';
import { CustomerModel, IdType, PersonType } from '../models/customer';
import { CounterModel } from '../models/counter';
import { CustomerDuplicateError, CustomerNotFoundError, ValidationError } from '../lib/errors';
import { CUSTOMER_MESSAGES } from '../validators/customer.validator';

// ─── Tipos públicos ───────────────────────────────────────────────────────────

export interface PublicCustomer {
  id: string;
  code: string;
  personType: PersonType;
  idType: IdType;
  idNumber: string;
  legalName?: string;
  firstNames?: string;
  lastNames?: string;
  email: string;
  mobilePhone?: string;
  city?: string;
  address?: string;
  sourceChannel: string;
  accountExecutiveId?: string;
  notes?: string;
  contactName?: string;
  contactTitle?: string;
  contactEmail?: string;
  createdAt: string;
  updatedAt: string;
}

/** Ficha y fila del listado: el cliente más el nombre de su ejecutivo (RN-10). */
export interface PublicCustomerWithExecutive extends PublicCustomer {
  accountExecutive: string;
}

/** Fila del listado: además, sus oportunidades abiertas (RN-07). */
export interface PublicCustomerListItem extends PublicCustomerWithExecutive {
  openOpportunities: number;
  openValue: number;
}

const EDITABLE_TEXT_FIELDS = [
  'email',
  'mobilePhone',
  'city',
  'address',
  'sourceChannel',
  'notes',
  'contactName',
  'contactTitle',
  'contactEmail',
] as const;

type EditableTextField = (typeof EDITABLE_TEXT_FIELDS)[number];

export type CreateCustomerInput = {
  personType: PersonType;
  idType: IdType;
  idNumber: string;
  email: string;
  sourceChannel: string;
  legalName?: string;
  firstNames?: string;
  lastNames?: string;
  accountExecutiveId?: string;
} & Partial<Record<EditableTextField, string>>;

/** Lo que PUT puede cambiar (RN-05): nunca la identificación, su tipo ni el tipo de persona. */
export type UpdateCustomerInput = {
  email: string;
  legalName?: string | null;
  firstNames?: string | null;
  lastNames?: string | null;
  accountExecutiveId?: string | null;
} & Partial<Record<EditableTextField, string | null>>;

export interface ListCustomersOptions {
  page: number;
  pageSize: number;
}

export interface ListCustomersResult {
  items: PublicCustomerListItem[];
  total: number;
  page: number;
  pageSize: number;
}

/** Documento plano del cliente (doc.toObject() o fila de una agregación). */
interface CustomerRecord {
  _id: Types.ObjectId;
  code: string;
  personType: PersonType;
  idType: IdType;
  idNumber: string;
  legalName?: string;
  firstNames?: string;
  lastNames?: string;
  email: string;
  mobilePhone?: string;
  city?: string;
  address?: string;
  sourceChannel: string;
  accountExecutiveId?: Types.ObjectId;
  notes?: string;
  contactName?: string;
  contactTitle?: string;
  contactEmail?: string;
  createdAt: Date;
  updatedAt: Date;
}

// ─── Proyección pública ───────────────────────────────────────────────────────

export function toPublicCustomer(obj: CustomerRecord): PublicCustomer {
  const result: PublicCustomer = {
    id: obj._id.toString(),
    code: obj.code,
    personType: obj.personType,
    idType: obj.idType,
    idNumber: obj.idNumber,
    email: obj.email,
    sourceChannel: obj.sourceChannel,
    createdAt: new Date(obj.createdAt).toISOString(),
    updatedAt: new Date(obj.updatedAt).toISOString(),
  };
  const optional = [
    'legalName',
    'firstNames',
    'lastNames',
    'mobilePhone',
    'city',
    'address',
    'notes',
    'contactName',
    'contactTitle',
    'contactEmail',
  ] as const;
  for (const key of optional) {
    if (obj[key] !== undefined && obj[key] !== null) {
      result[key] = obj[key];
    }
  }
  if (obj.accountExecutiveId) {
    result.accountExecutiveId = obj.accountExecutiveId.toString();
  }
  return result;
}

// ─── Normalización y reglas puras ─────────────────────────────────────────────

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export function normalizeIdNumber(idNumber: string): string {
  return idNumber.trim();
}

/** RN-06: PRO-AAAA-NNN, con la secuencia anual en al menos 3 dígitos. */
export function formatCustomerCode(year: number, seq: number): string {
  return `PRO-${year}-${String(seq).padStart(3, '0')}`;
}

function isDuplicateKeyError(err: unknown, field: string): boolean {
  return (
    typeof err === 'object' &&
    err !== null &&
    (err as { code?: number }).code === 11000 &&
    Object.prototype.hasOwnProperty.call((err as { keyPattern?: object }).keyPattern ?? {}, field)
  );
}

function isObjectIdText(id: string): boolean {
  return /^[0-9a-fA-F]{24}$/.test(id);
}

/** Etapas que resuelven el nombre del ejecutivo (R4-ARQ-2): vacío si no se encuentra (R4-ARQ-4). */
const EXECUTIVE_LOOKUP_STAGES = [
  {
    $lookup: {
      from: 'executives',
      localField: 'accountExecutiveId',
      foreignField: '_id',
      pipeline: [{ $project: { _id: 0, name: 1 } }],
      as: 'executive',
    },
  },
];

/** Etapa que cuenta y suma las oportunidades abiertas del cliente (R4-ARQ-2, R4-ARQ-3). */
const OPEN_OPPORTUNITIES_LOOKUP_STAGE = {
  $lookup: {
    from: 'opportunities',
    localField: '_id',
    foreignField: 'customerId',
    pipeline: [
      { $match: { status: 'open' } },
      { $group: { _id: null, count: { $sum: 1 }, value: { $sum: '$value' } } },
    ],
    as: 'openOpportunitiesSummary',
  },
};

/** Agregación del listado (RN-07): orden por el índice {createdAt, _id}, página, ejecutivo y oportunidades. */
export function listCustomersPipeline(page: number, pageSize: number): mongoose.PipelineStage[] {
  return [
    { $sort: { createdAt: -1, _id: -1 } },
    { $skip: (page - 1) * pageSize },
    { $limit: pageSize },
    ...EXECUTIVE_LOOKUP_STAGES,
    OPEN_OPPORTUNITIES_LOOKUP_STAGE,
  ] as mongoose.PipelineStage[];
}

type WithExecutive = CustomerRecord & { executive?: Array<{ name?: string }> };
type WithSummary = WithExecutive & { openOpportunitiesSummary?: Array<{ count: number; value: number }> };

function executiveName(row: WithExecutive): string {
  return row.executive?.[0]?.name ?? '';
}

// ─── Servicio ─────────────────────────────────────────────────────────────────

export class CustomerService {
  /** `now` se inyecta para poder fijar el año del código en las pruebas. */
  constructor(private readonly now: () => Date = () => new Date()) {}

  async create(input: CreateCustomerInput): Promise<PublicCustomer> {
    const idNumber = normalizeIdNumber(input.idNumber);

    // RN-01: unicidad comprobada en el servicio antes de persistir (el índice único cubre la carrera)
    if (await CustomerModel.exists({ idNumber })) {
      throw new CustomerDuplicateError();
    }
    // RN-09: el ejecutivo, si se envía, existe y está activo
    if (input.accountExecutiveId) {
      await this.assertActiveExecutive(input.accountExecutiveId);
    }

    const code = await this.nextCode();
    const data: Record<string, unknown> = {
      code,
      personType: input.personType,
      idType: input.idType,
      idNumber,
      email: normalizeEmail(input.email),
      sourceChannel: input.sourceChannel,
    };
    for (const key of ['legalName', 'firstNames', 'lastNames', ...EDITABLE_TEXT_FIELDS] as const) {
      if (key !== 'email' && key !== 'sourceChannel' && input[key] !== undefined) {
        data[key] = input[key];
      }
    }
    if (input.contactEmail) {
      data['contactEmail'] = normalizeEmail(input.contactEmail);
    }
    if (input.accountExecutiveId) {
      data['accountExecutiveId'] = new Types.ObjectId(input.accountExecutiveId);
    }

    let created;
    try {
      created = await CustomerModel.create(data);
    } catch (err) {
      if (isDuplicateKeyError(err, 'idNumber')) {
        throw new CustomerDuplicateError();
      }
      throw err;
    }

    // R4-OBS-2: evento de negocio con su código; nunca correo ni teléfono
    console.log(JSON.stringify({ event: 'cliente_creado', codigo: code }));

    return toPublicCustomer(created.toObject() as unknown as CustomerRecord);
  }

  async findById(id: string): Promise<PublicCustomerWithExecutive> {
    if (!isObjectIdText(id)) {
      throw new CustomerNotFoundError();
    }
    const rows = await CustomerModel.aggregate<WithExecutive>([
      { $match: { _id: new Types.ObjectId(id) } },
      ...EXECUTIVE_LOOKUP_STAGES,
    ]);
    if (rows.length === 0) {
      throw new CustomerNotFoundError();
    }
    return { ...toPublicCustomer(rows[0]), accountExecutive: executiveName(rows[0]) };
  }

  async update(id: string, input: UpdateCustomerInput): Promise<PublicCustomer> {
    if (!isObjectIdText(id)) {
      throw new CustomerNotFoundError();
    }
    const current = await CustomerModel.findById(id).lean<CustomerRecord>();
    if (!current) {
      throw new CustomerNotFoundError();
    }

    const set: Record<string, unknown> = {};
    const unset: Record<string, ''> = {};
    const apply = (key: string, value: string | null | undefined): void => {
      if (value === undefined) return;
      if (value === null) unset[key] = '';
      else set[key] = value;
    };

    for (const key of EDITABLE_TEXT_FIELDS) {
      apply(key, input[key]);
    }
    set['email'] = normalizeEmail(input.email);
    if (typeof input.contactEmail === 'string' && input.contactEmail.trim() !== '') {
      set['contactEmail'] = normalizeEmail(input.contactEmail);
    }

    // RN-05: solo la razón social (jurídica) o el nombre (natural), según el tipo guardado
    const nameFields = current.personType === 'legal' ? (['legalName'] as const) : (['firstNames', 'lastNames'] as const);
    for (const key of nameFields) {
      apply(key, input[key]);
    }
    // RN-03 sobre el cliente resultante: el nombre sigue completo
    const nameErrors = nameFields
      .filter((key) => {
        const next = key in set ? set[key] : key in unset ? undefined : current[key];
        return typeof next !== 'string' || next.trim() === '';
      })
      .map((field) => ({ field, message: CUSTOMER_MESSAGES.nameRequired }));
    if (nameErrors.length > 0) {
      throw new ValidationError('Entrada inválida', nameErrors);
    }

    // RN-09: el ejecutivo, si se envía, existe y está activo; vacío o null lo quita
    if (input.accountExecutiveId === null || input.accountExecutiveId === '') {
      unset['accountExecutiveId'] = '';
    } else if (input.accountExecutiveId !== undefined) {
      await this.assertActiveExecutive(input.accountExecutiveId);
      set['accountExecutiveId'] = new Types.ObjectId(input.accountExecutiveId);
    }

    const updated = await CustomerModel.findOneAndUpdate(
      { _id: current._id },
      { $set: set, ...(Object.keys(unset).length > 0 ? { $unset: unset } : {}) },
      { new: true, runValidators: true }
    ).lean<CustomerRecord>();
    if (!updated) {
      throw new CustomerNotFoundError();
    }
    return toPublicCustomer(updated);
  }

  /**
   * RN-07: fecha de creación descendente con desempate por _id (índice {createdAt, _id}),
   * con el nombre del ejecutivo y las oportunidades abiertas en la misma consulta paginada.
   * Un fallo de la base propaga el error: la petición entera falla (R4-ARQ-4).
   */
  async list(options: ListCustomersOptions): Promise<ListCustomersResult> {
    const { page, pageSize } = options;
    const [total, rows] = await Promise.all([
      CustomerModel.countDocuments({}),
      CustomerModel.aggregate<WithSummary>(listCustomersPipeline(page, pageSize)),
    ]);

    const items = rows.map((row) => {
      const summary = row.openOpportunitiesSummary?.[0];
      return {
        ...toPublicCustomer(row),
        accountExecutive: executiveName(row),
        openOpportunities: summary?.count ?? 0,
        openValue: summary ? Math.round(summary.value * 100) / 100 : 0,
      };
    });

    return { items, total, page, pageSize };
  }

  /** RN-09: consulta directa a la colección executives del mismo backend (R4-ARQ-2). */
  private async assertActiveExecutive(executiveId: string): Promise<void> {
    const executive = isObjectIdText(executiveId)
      ? await mongoose.connection
          .collection('executives')
          .findOne({ _id: new Types.ObjectId(executiveId), active: true }, { projection: { _id: 1 } })
      : null;
    if (!executive) {
      throw new ValidationError('Entrada inválida', [
        { field: 'accountExecutiveId', message: CUSTOMER_MESSAGES.executiveInvalid },
      ]);
    }
  }

  /** RN-06: contador atómico por año (findOneAndUpdate con $inc sobre counters, _id customers-AAAA). */
  private async nextCode(): Promise<string> {
    const year = this.now().getUTCFullYear();
    const counter = await CounterModel.findOneAndUpdate(
      { _id: `customers-${year}` },
      { $inc: { seq: 1 } },
      { upsert: true, new: true, setDefaultsOnInsert: false }
    ).lean();
    return formatCustomerCode(year, counter!.seq);
  }
}
