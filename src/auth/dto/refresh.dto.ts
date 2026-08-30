import { ApiProperty } from '@nestjs/swagger';
import { IsJWT } from 'class-validator';

export class RefreshDto {
  @ApiProperty({ description: 'The refresh token returned by login' })
  @IsJWT()
  refreshToken!: string;
}
