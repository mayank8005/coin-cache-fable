import { Prisma, type PrismaClient } from "@prisma/client";

export type DescriptionSuggestionType = "EXPENSE" | "INCOME";

export async function findDescriptionSuggestions(
  db: PrismaClient,
  input: {
    userId: string;
    type: DescriptionSuggestionType;
    normalizedQuery: string;
  },
): Promise<string[]> {
  const rows = await db.$queryRaw<{ description: string }[]>(Prisma.sql`
    WITH normalized AS (
      SELECT
        BTRIM(REGEXP_REPLACE("note", '[[:space:]]+', ' ', 'g')) AS "description",
        LOWER(BTRIM(REGEXP_REPLACE("note", '[[:space:]]+', ' ', 'g')))
          AS "normalizedDescription",
        "createdAt"
      FROM "Record"
      WHERE "userId" = ${input.userId}
        AND "type" = CAST(${input.type} AS "EntryType")
    ), ranked AS (
      SELECT
        "normalizedDescription",
        (ARRAY_AGG("description" ORDER BY "createdAt" DESC, "description" ASC))[1]
          AS "description",
        COUNT(*) AS "usageCount",
        MAX("createdAt") AS "lastUsedAt"
      FROM normalized
      WHERE "description" <> ''
        AND (
          ${input.normalizedQuery} = ''
          OR STRPOS("normalizedDescription", ${input.normalizedQuery}) > 0
        )
        AND "normalizedDescription" <> ${input.normalizedQuery}
      GROUP BY "normalizedDescription"
    )
    SELECT "description"
    FROM ranked
    ORDER BY "usageCount" DESC, "lastUsedAt" DESC, "normalizedDescription" ASC
    LIMIT 2
  `);

  return rows.map((row) => row.description);
}
