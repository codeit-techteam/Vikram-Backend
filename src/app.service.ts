import { Injectable } from '@nestjs/common';

@Injectable()
export class AppService {
  getRoot() {
    return {
      name: 'Bajriwala ERP API',
      status: 'live',
      health: '/health',
      docs: '/api/docs',
    };
  }
}
