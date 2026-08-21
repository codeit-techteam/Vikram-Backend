import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { AuthenticatedCustomer } from '../../auth/jwt/jwt-payload.interface';

export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): AuthenticatedCustomer => {
    const request = ctx
      .switchToHttp()
      .getRequest<{ user: AuthenticatedCustomer }>();
    return request.user;
  },
);
