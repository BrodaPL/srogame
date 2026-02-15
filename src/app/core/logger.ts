export type LogMeta = Record<string, unknown>;

export class Logger {
  public static info(message: string, meta?: LogMeta): void {
    if (meta) {
      console.info(message, meta);
      return;
    }

    console.info(message);
  }

  public static warn(message: string, meta?: LogMeta): void {
    if (meta) {
      console.warn(message, meta);
      return;
    }

    console.warn(message);
  }

  public static error(message: string, meta?: LogMeta): void {
    if (meta) {
      console.error(message, meta);
      return;
    }

    console.error(message);
  }
}
