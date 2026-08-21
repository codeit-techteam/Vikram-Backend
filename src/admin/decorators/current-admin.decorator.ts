import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import type { AuthenticatedAdmin } from '../auth/admin-jwt.strategy';

export const CurrentAdmin = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): AuthenticatedAdmin => {
    const request = ctx
      .switchToHttp()
      .getRequest<{ user: AuthenticatedAdmin }>();
    return request.user;
  },
);
