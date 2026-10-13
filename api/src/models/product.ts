import mongoose, { Schema, Document, Model } from 'mongoose';

export interface IProduct extends Document {
  sku: string;
  name: string;
  unitPrice: number;
  available: number;
  active: boolean;
}

const productSchema = new Schema<IProduct>(
  {
    sku: {
      type: String,
      required: true,
      unique: true,
      trim: true,
    },
    name: {
      type: String,
      required: true,
      trim: true,
    },
    unitPrice: {
      type: Number,
      required: true,
      min: 0,
    },
    available: {
      type: Number,
      required: true,
      min: 0,
      default: 0,
    },
    active: {
      type: Boolean,
      default: true,
    },
  },
  {
    timestamps: false,
    versionKey: false,
  }
);

// Índice único en sku (ya declarado en el schema con unique: true)
// Índice compuesto para el catálogo: active, name, sku
productSchema.index({ active: 1, name: 1, sku: 1 });

export const ProductModel: Model<IProduct> = mongoose.model<IProduct>('Product', productSchema);
