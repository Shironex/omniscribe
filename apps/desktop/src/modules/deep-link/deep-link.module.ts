import { Module, forwardRef } from '@nestjs/common';
import { SessionModule } from '../session';
import { WorkspaceModule } from '../workspace';
import { DeepLinkService } from './deep-link.service';

@Module({
  imports: [SessionModule, forwardRef(() => WorkspaceModule)],
  providers: [DeepLinkService],
  exports: [DeepLinkService],
})
export class DeepLinkModule {}
