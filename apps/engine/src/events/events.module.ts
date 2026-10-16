import { Global, Module } from '@nestjs/common';
import { EventsGateway } from './events.gateway';
import { REALTIME } from './realtime';

@Global()
@Module({
  providers: [EventsGateway, { provide: REALTIME, useExisting: EventsGateway }],
  exports: [REALTIME],
})
export class EventsModule {}
