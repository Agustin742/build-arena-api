import { ApiProperty } from '@nestjs/swagger';

export class UserProfileDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ format: 'email', example: 'sylas@buildarena.dev' })
  email!: string;

  @ApiProperty({ example: 'sylas' })
  username!: string;

  @ApiProperty({
    example: 1200,
    description: 'Elo rating. Every account starts at 1200',
  })
  rating!: number;

  @ApiProperty({ format: 'date-time' })
  createdAt!: Date;
}
