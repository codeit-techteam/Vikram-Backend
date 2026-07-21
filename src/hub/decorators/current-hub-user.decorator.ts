import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import type { AuthenticatedHubUser } from '../auth/hub-jwt.strategy';

export const CurrentHubUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): AuthenticatedHubUser => {
    const request = ctx.switchToHttp().getRequest<{ user: AuthenticatedHubUser }>();
    return request.user;
  },
);
