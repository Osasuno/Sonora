"use strict";

/**
 * Utilitarios compartilhados pelas rotas: encapsula async/await, validacao de
 * entrada com zod e erros com status HTTP.
 */

class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.name = "HttpError";
    this.status = status;
  }
}

const badRequest = (message) => new HttpError(400, message);
const notFound = (message = "Nao encontrado.") => new HttpError(404, message);
const forbidden = (message = "Voce nao tem permissao para isso.") => new HttpError(403, message);
const conflict = (message) => new HttpError(409, message);

/** Envolve um handler async e manda qualquer erro para o middleware central. */
const asyncRoute = (handler) => (req, res, next) => {
  Promise.resolve(handler(req, res, next)).catch(next);
};

/** Valida `req.body` (ou outra fonte) e devolve o dado tipado. */
function parseOrThrow(schema, payload) {
  const result = schema.safeParse(payload);
  if (!result.success) {
    const first = result.error.issues[0];
    const field = first?.path?.join(".") || "campo";
    throw badRequest(`${field}: ${first?.message || "valor invalido"}`);
  }
  return result.data;
}

const viewerId = (req) => req.session?.user?.id || 0;

module.exports = {
  HttpError,
  badRequest,
  notFound,
  forbidden,
  conflict,
  asyncRoute,
  parseOrThrow,
  viewerId,
};
