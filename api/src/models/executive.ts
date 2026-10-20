import mongoose, { Schema, Document, Model } from 'mongoose';

/** Ejecutivo comercial al que se asigna un cliente (colección executives). */
export interface IExecutive extends Document {
  name: string;
  active: boolean;
}

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

// Índice único en name: el nombre es el label de la opción y la clave del seed
executiveSchema.index({ name: 1 }, { unique: true });
// Índice de la lista: find({active: true}).sort({name: 1})
executiveSchema.index({ active: 1, name: 1 });

export const ExecutiveModel: Model<IExecutive> = mongoose.model<IExecutive>('Executive', executiveSchema);
