import { Controller, Get } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { Public } from '../../common/decorators/public.decorator';
import { SWAGGER_TAGS } from '../../common/constants/swagger.constants';
import { TestimonialsService } from './testimonials.service';
import { TestimonialResponseDto } from './dto/testimonials.dto';

@Public()
@ApiTags(SWAGGER_TAGS.TESTIMONIALS)
@Controller({ version: '1', path: 'testimonials' })
export class TestimonialsController {
  constructor(private readonly testimonialsService: TestimonialsService) {}

  @Get()
  @ApiOperation({
    summary: 'List published testimonials',
    description: 'Returns published video and image testimonials sorted by sortOrder.',
  })
  @ApiResponse({ status: 200, type: [TestimonialResponseDto] })
  async findAll(): Promise<{
    success: boolean;
    message: string;
    data: TestimonialResponseDto[];
  }> {
    const data = await this.testimonialsService.findPublished();
    return {
      success: true,
      message: 'Testimonials fetched successfully',
      data,
    };
  }
}
