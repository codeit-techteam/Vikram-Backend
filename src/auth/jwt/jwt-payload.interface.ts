export interface JwtPayload {
  sub: string;
  phone: string;
  type: 'access' | 'refresh';
}

export interface AuthenticatedCustomer {
  id: string;
  phone: string;
}
