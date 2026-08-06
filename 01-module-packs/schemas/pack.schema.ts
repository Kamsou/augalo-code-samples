import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type PackDocument = Pack & Document;

@Schema({ timestamps: true })
export class Pack {
  // Pas unique : plusieurs packs par an (global + paliers).
  @Prop({ required: true })
  year: number;

  @Prop({ required: true })
  startDate: Date; // Sept 2024

  @Prop({ required: true })
  endDate: Date; // Août 2025

  @Prop({ required: true })
  name: string; // "Pack Premium 2024-2025"

  @Prop({ required: true })
  price: number; // 19.99

  @Prop({ required: true })
  stripeProductId: string;

  @Prop({ required: true })
  stripePriceId: string;

  @Prop({ required: true })
  appleProductId: string; // com.ionic.augalo.com.premium.2024

  @Prop({ required: true })
  androidProductId: string;

  @Prop({ default: true })
  isActive: boolean; // Pack actuellement en vente

  @Prop({ default: false })
  isLegacy: boolean; // Ancien système (isPremium = true)

  // Galops couverts par un pack PALIER (ex. [3, 4] pour G3/4). Absent sur le pack
  // global. Sa présence marque le pack comme "palier" (scope au lieu de tout).
  @Prop({ type: [Number] })
  gallops?: number[];
}

export const PackSchema = SchemaFactory.createForClass(Pack);
