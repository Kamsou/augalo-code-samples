import { IsNotEmpty, IsNumber, IsString, IsBoolean, IsOptional, IsDate, Min } from 'class-validator';
import { Type } from 'class-transformer';

export class CreatePackDto {
  @IsNotEmpty()
  @IsNumber()
  year: number;

  @IsNotEmpty()
  @Type(() => Date)
  @IsDate()
  startDate: Date;

  @IsNotEmpty()
  @Type(() => Date)
  @IsDate()
  endDate: Date;

  @IsNotEmpty()
  @IsString()
  name: string;

  @IsNotEmpty()
  @IsNumber()
  @Min(0)
  price: number;

  @IsNotEmpty()
  @IsString()
  stripeProductId: string;

  @IsNotEmpty()
  @IsString()
  stripePriceId: string;

  @IsNotEmpty()
  @IsString()
  appleProductId: string;

  @IsNotEmpty()
  @IsString()
  androidProductId: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @IsOptional()
  @IsBoolean()
  isLegacy?: boolean;
}
