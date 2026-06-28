import { IsArray, IsIn, IsISO8601, IsNotEmpty, IsNumber, IsOptional, IsString, Min, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';

class OrderItemDto {
  @IsString()
  @IsNotEmpty()
  catalogItemId: string;

  @IsNumber()
  @Min(1)
  quantity: number;
}

export class PlaceOrderDto {
  // Optional: omit for personal (non-project) purchases
  @IsOptional()
  @IsString()
  projectId?: string;

  @IsString()
  @IsNotEmpty()
  supplierId: string;

  // Required when projectId is omitted (personal-purchase shipping target)
  @IsOptional()
  @IsString()
  shippingAddress?: string;

  @IsOptional()
  @IsString()
  recipientName?: string;

  @IsOptional()
  @IsString()
  recipientPhone?: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => OrderItemDto)
  items: OrderItemDto[];

  @IsOptional()
  @IsISO8601()
  deliveryDate?: string;

  @IsOptional()
  @IsString()
  deliveryType?: string;

  // PICKUP = contractor collects from supplier; DELIVERY = supplier ships
  @IsOptional()
  @IsIn(['PICKUP', 'DELIVERY'])
  fulfillmentType?: 'PICKUP' | 'DELIVERY';

  @IsOptional()
  @IsString()
  notes?: string;

  @IsOptional()
  @IsString()
  driverId?: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  driverFee?: number;
}
