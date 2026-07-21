import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import type { AuthenticatedCustomer } from '../../auth/jwt/jwt-payload.interface';

export const OptionalUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): AuthenticatedCustomer | null => {
    const request = ctx.switchToHttp().getRequest<{ user?: AuthenticatedCustomer }>();
    return request.user ?? null;
  },
);
