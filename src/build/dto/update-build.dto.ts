import { PartialType } from '@nestjs/swagger';

import { CreateBuildDto } from './create-build.dto';

/**
 * Every field is optional, but the build is validated as a whole: the service
 * merges the change into what is stored and checks the result. A build can
 * never be edited into an illegal state one field at a time.
 */
export class UpdateBuildDto extends PartialType(CreateBuildDto) {}
