import mongoose, { Schema, Document, Model } from 'mongoose';

/** Ejecutivo comercial al que se asigna un cliente (colección executives). */
export interface IExecutive extends Document {
  name: string;
  active: boolean;
}

/**
 * Intercalación española de la colección (§3, RN-01, RN-03): ordena alfabéticamente en español
 * (las tildes y las mayúsculas no van al final, la ñ va tras la n) y, con strength 2, compara sin
 * distinguir mayúsculas: «daniela ríos» y «Daniela Ríos» son el mismo nombre. Las tildes sí
 * distinguen («Rios» ≠ «Ríos»): la spec solo pide no distinguir mayúsculas.
 * La usan los dos índices y las consultas: un índice solo sirve a la consulta con su misma intercalación.
 */
export const EXECUTIVE_COLLATION = { locale: 'es', strength: 2 } as const;

const executiveSchema = new Schema<IExecutive>(
  {
    name: {
      type: String,
      required: true,
      trim: true,
    },
    active: {
      type: Boolean,
      default: true,
    },
  },
  {
    collection: 'executives',
    timestamps: false,
    versionKey: false,
  }
);

// {name} único sin distinguir mayúsculas: el nombre es el label de la opción y la clave de la siembra
executiveSchema.index({ name: 1 }, { unique: true, collation: EXECUTIVE_COLLATION });
// Índice de la lista: find({active: true}).sort({name: 1}) con la misma intercalación (R4-REND-1)
executiveSchema.index({ active: 1, name: 1 }, { collation: EXECUTIVE_COLLATION });

export const ExecutiveModel: Model<IExecutive> = mongoose.model<IExecutive>('Executive', executiveSchema);
