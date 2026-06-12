import { Module } from '@nestjs/common';
import { FsService } from './fs.service';
import { FsWatchService } from './fs-watch.service';
import { FsGateway } from './fs.gateway';

/**
 * FsModule — file explorer / editor backend.
 *
 * Exposes directory listing, stat, read/write, create/rename/delete (recycle),
 * fuzzy file search and content grep over a security boundary scoped to each
 * project root, plus a refcounted, debounce-batched recursive watcher that
 * broadcasts `fs:changed` to clients watching a project.
 */
@Module({
  providers: [FsService, FsWatchService, FsGateway],
  exports: [FsService, FsWatchService],
})
export class FsModule {}
