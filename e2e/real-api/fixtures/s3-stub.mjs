#!/usr/bin/env node
/*
 * A local S3-compatible stand-in for the real-backend journeys (SF-115), for
 * machines without an S3 emulator. NOT S3: it does not check signatures,
 * policies or expiry. It only does what the API's path-style presigned
 * operations need: PUT stores the bytes and their content type, HEAD
 * reports them (the API's server-side check), GET returns them, DELETE
 * removes them, and OPTIONS answers the browser's CORS preflight for the
 * web origin. Objects live in memory and vanish with the process.
 *
 *   node e2e/real-api/fixtures/s3-stub.mjs            # 127.0.0.1:4566
 *   S3_STUB_PORT=4567 node e2e/real-api/fixtures/s3-stub.mjs
 *
 * Start the API with AWS_S3_ENDPOINT=http://127.0.0.1:4566, any bucket name
 * and placeholder keys (they are never verified here). Nothing is logged
 * except the method, the status and the path without its query (the query
 * carries the signature).
 */
import { createServer } from "node:http";

const port = Number(process.env.S3_STUB_PORT ?? 4566);
const objects = new Map();

function cors(request, response) {
  const origin = request.headers.origin;
  if (origin !== undefined) {
    response.setHeader("access-control-allow-origin", origin);
    response.setHeader("vary", "origin");
  }
  response.setHeader("access-control-allow-methods", "GET, HEAD, PUT, DELETE, OPTIONS");
  response.setHeader(
    "access-control-allow-headers",
    request.headers["access-control-request-headers"] ?? "content-type",
  );
  response.setHeader("access-control-expose-headers", "etag");
  response.setHeader("access-control-max-age", "600");
}

const server = createServer((request, response) => {
  const path = new URL(request.url ?? "/", "http://stub").pathname;
  cors(request, response);
  const done = (status, body) => {
    console.warn(`${request.method} ${status} ${path}`);
    response.statusCode = status;
    response.end(body);
  };

  switch (request.method) {
    case "OPTIONS":
      return done(204);
    case "PUT": {
      const chunks = [];
      request.on("data", (chunk) => chunks.push(chunk));
      request.on("end", () => {
        const body = Buffer.concat(chunks);
        objects.set(path, {
          body,
          type: request.headers["content-type"] ?? "application/octet-stream",
        });
        response.setHeader("etag", `"${body.length}"`);
        done(200);
      });
      return;
    }
    case "HEAD":
    case "GET": {
      const object = objects.get(path);
      if (object === undefined) return done(404);
      response.setHeader("content-type", object.type);
      response.setHeader("content-length", String(object.body.length));
      response.setHeader("etag", `"${object.body.length}"`);
      return done(200, request.method === "GET" ? object.body : undefined);
    }
    case "DELETE":
      objects.delete(path);
      return done(204);
    default:
      return done(405);
  }
});

server.listen(port, "127.0.0.1", () => {
  console.warn(`s3-stub listening on http://127.0.0.1:${port}`);
});
