import mongoose, { Schema, Document, Model, Types } from 'mongoose';

export const PERSON_TYPES = ['legal', 'natural'] as const;
export type PersonType = (typeof PERSON_TYPES)[number];

export const ID_TYPES = ['cedula', 'ruc', 'passport'] as const;
export type IdType = (typeof ID_TYPES)[number];

/** Ciudades que admite el cliente: la lista de la pantalla (RN-12). */
export const CITIES = ['guayaquil', 'quito', 'manta', 'cuenca', 'duran', 'ambato', 'machala', 'riobamba'] as const;

/** Canales de origen que admite el cliente: la lista de la pantalla (RN-12). */
export const SOURCE_CHANNELS = [
  'referido_de_cliente',
  'cartera_propia',
  'campana_digital',
  'alianza_bancaria',
  'cuenta_estrategica',
] as const;

export type NameField = 'legalName' | 'firstNames' | 'lastNames';

/**
 * Los nombres de cada tipo de persona (RN-03): la razón social de una jurídica; nombres y
 * apellidos de una natural. Los del otro tipo se ignoran en el alta y en la edición.
 */
export const NAME_FIELDS_BY_PERSON_TYPE: Record<PersonType, readonly NameField[]> = {
  legal: ['legalName'],
  natural: ['firstNames', 'lastNames'],
};

/** Interfaz interna del cliente del CRM (nunca sale al exterior: ver toPublicCustomer). */
export interface ICustomer extends Document {
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

const customerSchema = new Schema<ICustomer>(
  {
    code: { type: String, required: true, unique: true },
    personType: { type: String, enum: PERSON_TYPES, required: true },
    idType: { type: String, enum: ID_TYPES, required: true },
    idNumber: { type: String, required: true, unique: true, trim: true },
    legalName: { type: String, trim: true },
    firstNames: { type: String, trim: true },
    lastNames: { type: String, trim: true },
    email: { type: String, required: true, trim: true },
    mobilePhone: { type: String, trim: true },
    city: { type: String, enum: CITIES, trim: true },
    address: { type: String, trim: true },
    sourceChannel: { type: String, enum: SOURCE_CHANNELS, required: true, trim: true },
    accountExecutiveId: { type: Schema.Types.ObjectId },
    notes: { type: String },
    contactName: { type: String, trim: true },
    contactTitle: { type: String, trim: true },
    contactEmail: { type: String, trim: true },
  },
  {
    collection: 'customers',
    timestamps: true,
    versionKey: false,
  }
);

// Índices únicos de code e idNumber: declarados en el schema (unique: true).
// Índice del listado (RN-07, R4-REND-1): fecha de creación descendente con desempate por _id.
customerSchema.index({ createdAt: -1, _id: -1 });

export const CustomerModel: Model<ICustomer> = mongoose.model<ICustomer>('Customer', customerSchema);
