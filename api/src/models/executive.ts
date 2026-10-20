import mongoose, { Schema, Document, Model } from 'mongoose';

/** Ejecutivo comercial al que se asigna un cliente (colección executives). */
export interface IExecutive extends Document {
  name: string;
  active: boolean;
}

/**
 * Intercalación española del ORDEN (§3, RN-01): ordena alfabéticamente en español (las tildes y las
 * mayúsculas no van al final, la ñ es una letra propia que va tras la n). La usan el índice
 * {active, name} y la consulta de la lista: un índice solo sirve a la consulta con su misma intercalación.
 */
export const EXECUTIVE_COLLATION = { locale: 'es', strength: 2 } as const;

/**
 * Intercalación de la UNICIDAD del nombre (§3 y RN-03 de la v6): el nombre es único sin distinguir
 * mayúsculas, tildes ni la ñ («Ñaña Torres» = «Nana Torres» = «nana torres»).
 * No puede ser la es: la intercalación española hace de la ñ una letra propia (diferencia primaria),
 * y con ella «Nana» y «Ñaña» son distintos aunque se ignoren tildes y mayúsculas (fuerza 1).
 * La intercalación raíz de Unicode (CLDR), que es la de 'en' sin adaptaciones, trata la ñ como una n
 * con tilde (diferencia secundaria), y la fuerza 1 solo compara las letras base: ignora tildes
 * (secundaria) y mayúsculas (terciaria). Así el índice único {name} garantiza la regla en cualquier
 * escritura, sin un campo derivado que mantener.
 */
export const EXECUTIVE_NAME_COLLATION = { locale: 'en', strength: 1 } as const;

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
    // Los índices de executives solo los crea la siembra (R4-ARQ-2), después de comprobar que no hay
    // nombres repetidos (RN-03). Con autoIndex, arrancar la API sobre una base con repetidos intentaría
    // crear name_1 en cada arranque y MongoDB dejaría en su log la clave del nombre repetido
    // (constitución: ningún dato personal en los logs).
    autoIndex: false,
  }
);

// {name} único sin distinguir mayúsculas, tildes ni la ñ: el nombre es el label de la opción y la clave de la siembra
executiveSchema.index({ name: 1 }, { unique: true, collation: EXECUTIVE_NAME_COLLATION });
// Índice de la lista: find({active: true}).sort({name: 1}) con la misma intercalación (R4-REND-1)
executiveSchema.index({ active: 1, name: 1 }, { collation: EXECUTIVE_COLLATION });

export const ExecutiveModel: Model<IExecutive> = mongoose.model<IExecutive>('Executive', executiveSchema);
