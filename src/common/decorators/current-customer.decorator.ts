import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { AuthenticatedCustomer } from '../../auth/jwt/jwt-payload.interface';

/**
 * Alias for {@link CurrentUser} — use for customer-facing routes.
 */
export const CurrentCustomer = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): AuthenticatedCustomer => {
    const request = ctx
      .switchToHttp()
      .getRequest<{ user: AuthenticatedCustomer }>();
    return request.user;
  },
);
