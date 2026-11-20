import { ArgumentMetadata, Injectable, PipeTransform } from '@nestjs/common';
import { ContentSecurityService } from './content-security.service';

@Injectable()
export class ContentSecurityPipe implements PipeTransform {
  constructor(
    private readonly contentSecurityService: ContentSecurityService,
  ) {}

  async transform(value: unknown, metadata: ArgumentMetadata): Promise<unknown> {
    if (
      metadata.type === 'body' ||
      metadata.type === 'query' ||
      metadata.type === 'param' ||
      metadata.type === 'custom'
    ) {
      await this.contentSecurityService.validatePayload(
        value,
        metadata.data || '',
      );
    }
    return value;
  }
}
