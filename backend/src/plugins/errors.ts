import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";

/** Map Zod / validation / unknown errors to safe JSON envelopes. Never leak stacks. */
export async function registerErrorHandling(app: FastifyInstance): Promise<void> {
  app.setErrorHandler((err: unknown, _req: FastifyRequest, reply: FastifyReply) => {
    const status = typeof (err as { statusCode?: unknown }).statusCode === "number"
      ? ((err as { statusCode: number }).statusCode as number)
      : 500;
    const message =
      typeof (err as { message?: unknown }).message === "string"
        ? ((err as { message: string }).message as string)
        : "Request failed.";
    if (status >= 500) {
      app.log.error({ err }, "unhandled error");
    }
    void reply.status(status >= 400 && status < 600 ? status : 500).send({
      error: status === 404 ? "notFound" : "internalError",
      message: status >= 500 ? "Unexpected server error." : message,
    });
  });

  app.setNotFoundHandler((_req: FastifyRequest, reply: FastifyReply) => {
    void reply.status(404).send({ error: "notFound", message: "Unknown endpoint." });
  });
}
