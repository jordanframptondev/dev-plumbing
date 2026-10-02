/** A readable failure from the service, with its HTTP status. 503 means it couldn't be reached. */
export class ServiceError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}
