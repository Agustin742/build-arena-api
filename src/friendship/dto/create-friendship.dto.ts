import { ApiProperty } from '@nestjs/swagger';
import { IsUUID } from 'class-validator';

export class CreateFriendshipDto {
  @ApiProperty({
    format: 'uuid',
    description: 'The player you want to befriend. Not yourself',
  })
  @IsUUID()
  addresseeId!: string;
}
