import { Controller, Get } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { AppService } from './app.service';
import { SWAGGER_TAGS } from './common/constants/swagger.constants';

@ApiTags(SWAGGER_TAGS.ROOT)
@Controller({ version: '1' })
export class AppController {
  constructor(private readonly appService: AppService) {}

  @Get()
  @ApiOperation({ summary: 'Root endpoint placeholder' })
  @ApiOkResponse({ description: 'Welcome message', type: String })
  getHello(): string {
    return this.appService.getHello();
  }
}
