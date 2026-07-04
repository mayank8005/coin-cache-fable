/**
 * Emergency password reset (e.g. the admin forgot theirs).
 * Runs inside the web container, which has DATABASE_URL:
 *
 *   docker compose exec web node /opt/tools/reset-password.js you@example.com 'new-password'
 *
 * Updates the bcrypt hash and signs that user out everywhere.
 * Never deletes anything else — every user's data stays intact.
 */
const bcrypt = require("/opt/prisma/node_modules/bcryptjs");
const { Client } = require("/opt/prisma/node_modules/pg");

const [, , email, password] = process.argv;
if (!email || !password || password.length < 8) {
  console.error("usage: node reset-password.js <email> <new-password (min 8 chars)>");
  process.exit(1);
}

(async () => {
  const hash = await bcrypt.hash(password, 12);
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  try {
    const res = await client.query(
      'UPDATE "User" SET "passwordHash" = $1 WHERE lower(email) = lower($2) RETURNING id, email',
      [hash, email],
    );
    if (res.rowCount === 0) {
      console.error(`No user found with email ${email}`);
      process.exit(1);
    }
    await client.query('DELETE FROM "Session" WHERE "userId" = $1', [res.rows[0].id]);
    console.log(`Password updated for ${res.rows[0].email}; all their sessions were signed out.`);
  } finally {
    await client.end();
  }
})().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
