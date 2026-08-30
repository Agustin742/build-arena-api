import { ApiProperty } from '@nestjs/swagger';
import {
  IsEmail,
  IsString,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';

export class RegisterDto {
  @ApiProperty({ format: 'email', example: 'sylas@buildarena.dev' })
  @IsEmail()
  @MaxLength(254)
  email!: string;

  @ApiProperty({
    example: 'sylas',
    minLength: 3,
    maxLength: 20,
    description: 'Letters, numbers and underscores only',
  })
  @IsString()
  @MinLength(3)
  @MaxLength(20)
  @Matches(/^[a-zA-Z0-9_]+$/, {
    message: 'username may only contain letters, numbers and underscores',
  })
  username!: string;

  @ApiProperty({
    minLength: 8,
    maxLength: 72,
    description: 'Capped at 72 bytes because bcrypt truncates beyond that',
  })
  @IsString()
  @MinLength(8)
  @MaxLength(72)
  password!: string;
}
