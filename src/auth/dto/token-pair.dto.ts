import { ApiProperty } from '@nestjs/swagger';

export class TokenPairDto {
  @ApiProperty({
    description: 'Short lived token. Send it on every authenticated request',
  })
  accessToken!: string;

  @ApiProperty({
    description:
      'Long lived token. Send it only to renew the pair or to log out',
  })
  refreshToken!: string;
}
