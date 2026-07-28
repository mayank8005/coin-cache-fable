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
    WITH unicode_normalized AS (
      SELECT
        TRANSLATE(
          "note",
          CHR(160) || CHR(5760) ||
          CHR(8192) || CHR(8193) || CHR(8194) || CHR(8195) || CHR(8196) ||
          CHR(8197) || CHR(8198) || CHR(8199) || CHR(8200) || CHR(8201) ||
          CHR(8202) || CHR(8232) || CHR(8233) || CHR(8239) || CHR(8287) ||
          CHR(12288) || CHR(65279),
          REPEAT(' ', 19)
        ) AS "note",
        "createdAt"
      FROM "Record"
      WHERE "userId" = ${input.userId}
        AND "type" = CAST(${input.type} AS "EntryType")
    ), normalized AS (
      SELECT
        BTRIM(REGEXP_REPLACE("note", '[[:space:]]+', ' ', 'g')) AS "description",
        LOWER(BTRIM(REGEXP_REPLACE("note", '[[:space:]]+', ' ', 'g')))
          AS "normalizedDescription",
        "createdAt"
      FROM unicode_normalized
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
