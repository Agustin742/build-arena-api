import { ApiProperty } from '@nestjs/swagger';

export class HealthStatusDto {
  @ApiProperty({ example: 'ok' })
  status!: string;

  @ApiProperty({ example: '0.1.0' })
  version!: string;

  @ApiProperty({
    example: 44,
    description: 'Seconds since the process started',
  })
  uptime!: number;

  @ApiProperty({ format: 'date-time' })
  timestamp!: string;
}
