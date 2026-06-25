import {
  IsBoolean,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
} from 'class-validator';

const SLOT_REGEX = /^\d{2}:\d{2}$/;
const DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;

export class CreateReservationDto {
  @IsString()
  @IsNotEmpty()
  court_id: string;

  @Matches(DATE_REGEX, { message: 'date debe ser YYYY-MM-DD' })
  date: string;

  @Matches(SLOT_REGEX, { message: 'time_slot debe ser HH:MM' })
  time_slot: string;

  @IsOptional()
  @IsBoolean()
  has_guest?: boolean;

  @IsOptional()
  @IsString()
  guest_name?: string;

  @IsOptional()
  @IsString()
  partner_name?: string;

  @IsOptional()
  @IsString()
  school_name?: string;
}
