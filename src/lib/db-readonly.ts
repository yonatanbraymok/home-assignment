import { db } from "./db";

// What MCP tools read through: the same connection, but every write is refused in code, so a bug
// in a tool can't change data. (A database role with SELECT rights only is the deploy-time layer
// on top of this; see DECISIONS §8.) Cost and audit rows are written by our own wrapper, not by tools.

const WRITES = new Set([
  "create",
  "createMany",
  "createManyAndReturn",
  "update",
  "updateMany",
  "updateManyAndReturn",
  "upsert",
  "delete",
  "deleteMany",
]);

export class ReadOnlyViolation extends Error {}

// A query extension changes behaviour, not the client's API, so it keeps the base client's type
// (Prisma's generic extension types don't line up with code written against PrismaClient).
export const readOnlyDb = db.$extends({
  name: "read-only",
  query: {
    $allModels: {
      $allOperations({ model, operation, args, query }) {
        if (WRITES.has(operation)) throw new ReadOnlyViolation(`Read-only client: ${model}.${operation} is not allowed`);
        return query(args);
      },
    },
  },
}) as unknown as typeof db;
