import { Global, Module } from '@nestjs/common';
import { PortfolioAccessService } from './portfolio-access.service';

@Global()
@Module({
  providers: [PortfolioAccessService],
  exports: [PortfolioAccessService],
})
export class AccessModule {}
