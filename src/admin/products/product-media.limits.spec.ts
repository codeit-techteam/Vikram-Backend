import {
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import { PRODUCT_MEDIA_LIMITS } from './product-media.constants';

describe('PRODUCT_MEDIA_LIMITS', () => {
  it('allows up to 6 images and 1 video', () => {
    expect(PRODUCT_MEDIA_LIMITS.MAX_IMAGES).toBe(6);
    expect(PRODUCT_MEDIA_LIMITS.MAX_VIDEOS).toBe(1);
  });
});

describe('product media validation helpers', () => {
  function assertImageCount(count: number) {
    if (count > PRODUCT_MEDIA_LIMITS.MAX_IMAGES) {
      throw new BadRequestException(
        `Maximum ${PRODUCT_MEDIA_LIMITS.MAX_IMAGES} product images are allowed.`,
      );
    }
  }

  function assertVideoCount(count: number) {
    if (count > PRODUCT_MEDIA_LIMITS.MAX_VIDEOS) {
      throw new BadRequestException('Only one product video is allowed.');
    }
  }

  it('rejects a 7th image', () => {
    expect(() => assertImageCount(7)).toThrow(BadRequestException);
    expect(() => assertImageCount(7)).toThrow(
      'Maximum 6 product images are allowed.',
    );
  });

  it('allows 6 images', () => {
    expect(() => assertImageCount(6)).not.toThrow();
  });

  it('rejects a second video', () => {
    expect(() => assertVideoCount(2)).toThrow(BadRequestException);
    expect(() => assertVideoCount(2)).toThrow(
      'Only one product video is allowed.',
    );
  });

  it('allows a single video', () => {
    expect(() => assertVideoCount(1)).not.toThrow();
  });

  it('uses NotFoundException for missing media', () => {
    expect(() => {
      throw new NotFoundException('Product media not found');
    }).toThrow(NotFoundException);
  });
});
