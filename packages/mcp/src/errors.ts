/** A readable failure from the service, with its HTTP status. 503 means it couldn't be reached. retryable: waiting and trying again may work. */
export class ServiceError extends Error {
  constructor(
    readonly status: number,
    message: string,
    readonly retryable: boolean = false,
  ) {
    super(message);
  }
}
