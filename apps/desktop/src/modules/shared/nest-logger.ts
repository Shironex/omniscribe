import { LoggerService } from '@nestjs/common';
import { createLogger, Logger } from '@omniscribe/shared';
import { fileTransport } from '../../main/logger';

/**
 * NestJS LoggerService adapter that delegates to the shared logger.
 *
 * Replaces NestJS's default ConsoleLogger so all framework-level logs
 * (module loading, WebSocket subscriptions, etc.) use the same format
 * as our application-level logs.
 *
 * NestJS convention: the last string argument in optionalParams is the context.
 */
export class NestLoggerAdapter implements LoggerService {
  private readonly loggers = new Map<string, Logger>();

  private getLogger(context?: string): Logger {
    const key = context ?? 'Nest';
    let logger = this.loggers.get(key);
    if (!logger) {
      logger = createLogger(key, { fileTransport });
      this.loggers.set(key, logger);
    }
    return logger;
  }

  /**
   * Extract context from NestJS-style args (last string param is context)
   */
  private extractContext(args: unknown[]): { context?: string; rest: unknown[] } {
    if (args.length > 0 && typeof args[args.length - 1] === 'string') {
      return {
        context: args[args.length - 1] as string,
        rest: args.slice(0, -1),
      };
    }
    return { rest: args };
  }

  log(message: unknown, ...optionalParams: unknown[]): void {
    const { context, rest } = this.extractContext(optionalParams);
    this.getLogger(context).info(message, ...rest);
  }

  error(message: unknown, ...optionalParams: unknown[]): void {
    const { context, rest } = this.extractContext(optionalParams);
    this.getLogger(context).error(message, ...rest);
  }

  warn(message: unknown, ...optionalParams: unknown[]): void {
    const { context, rest } = this.extractContext(optionalParams);
    this.getLogger(context).warn(message, ...rest);
  }

  debug(message: unknown, ...optionalParams: unknown[]): void {
    const { context, rest } = this.extractContext(optionalParams);
    this.getLogger(context).debug(message, ...rest);
  }

  verbose(message: unknown, ...optionalParams: unknown[]): void {
    const { context, rest } = this.extractContext(optionalParams);
    this.getLogger(context).debug(message, ...rest);
  }

  fatal(message: unknown, ...optionalParams: unknown[]): void {
    const { context, rest } = this.extractContext(optionalParams);
    this.getLogger(context).error(message, ...rest);
  }
}
