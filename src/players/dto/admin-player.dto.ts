import {
  IsBoolean,
  IsEmail,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Min,
  MinLength,
} from 'class-validator';

const MEMBER_TYPES = ['socio', 'hijo_socio', 'profe'];
const ADMIN_ROLES = ['escalerilla', 'reservas', 'all'];

export class CreatePlayerDto {
  @IsString() @IsNotEmpty() username: string;
  @IsEmail() email: string;
  @IsString() @MinLength(6) password: string;
  @IsString() @IsNotEmpty() name: string;
  @IsOptional() @IsString() phone?: string;
  @IsOptional() @IsInt() @Min(0) position?: number;
  @IsOptional() @IsIn(MEMBER_TYPES) member_type?: string;
  @IsOptional() @IsString() parent_id?: string;
  @IsOptional() @IsBoolean() has_debt?: boolean;
  @IsOptional() @IsIn(ADMIN_ROLES) admin_role?: string | null;
  @IsOptional() @IsString({ each: true }) school_names?: string[];
}

export class UpdatePlayerDto {
  @IsOptional() @IsString() @IsNotEmpty() name?: string;
  @IsOptional() @IsEmail() email?: string;
  @IsOptional() @IsString() phone?: string;
  @IsOptional() @IsInt() @Min(0) position?: number | null;
  @IsOptional() @IsInt() @Min(0) wins?: number;
  @IsOptional() @IsInt() @Min(0) losses?: number;
  @IsOptional() @IsInt() @Min(0) total_matches?: number;
  @IsOptional() @IsString() immune_until?: string | null;
  @IsOptional() @IsString() vulnerable_until?: string | null;
  @IsOptional() @IsIn(MEMBER_TYPES) member_type?: string;
  @IsOptional() @IsString() parent_id?: string | null;
  @IsOptional() @IsBoolean() has_debt?: boolean;
  @IsOptional() @IsIn(ADMIN_ROLES) admin_role?: string | null;
  @IsOptional() @IsInt() @Min(0) extra_high_demand_slots?: number;
  @IsOptional() @IsString({ each: true }) school_names?: string[];
}
