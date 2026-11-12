// 运行时自动迁移：部署后首个请求即把 migrations/ 下尚未执行的 SQL 应用到 D1，
// 无需在部署流程中单独执行 wrangler d1 migrations apply。
// 记录表沿用 Wrangler 的 d1_migrations，两种方式执行的结果互相认可。

const files = import.meta.glob<string>("../../migrations/*.sql", { query: "?raw", import: "default", eager: true });

const MIGRATIONS = Object.entries(files)
  .map(([path, sql]) => ({ name: path.slice(path.lastIndexOf("/") + 1), sql }))
  .sort((a, b) => a.name.localeCompare(b.name));

/** 按语句拆分 SQL；CREATE TRIGGER 的 BEGIN ... END; 块整体作为一条语句 */
export function splitStatements(sql: string) {
  const statements: string[] = [];
  let buffer: string[] = [];
  let inTrigger = false;
  for (const raw of sql.split("\n")) {
    const line = raw.replace(/--.*$/, "").trimEnd();
    if (!line.trim()) continue;
    if (!buffer.length && /^\s*CREATE\s+TRIGGER\b/i.test(line)) inTrigger = true;
    buffer.push(line);
    const ended = inTrigger ? /^\s*END;$/i.test(line) : line.endsWith(";");
    if (ended) {
      statements.push(buffer.join("\n"));
      buffer = [];
      inTrigger = false;
    }
  }
  if (buffer.length) statements.push(buffer.join("\n"));
  return statements;
}

async function appliedNames(db: D1Database) {
  const { results } = await db.prepare("SELECT name FROM d1_migrations").all<{ name: string }>();
  return new Set(results.map((r) => r.name));
}

async function migrate(db: D1Database) {
  await db
    .prepare(
      `CREATE TABLE IF NOT EXISTS d1_migrations (
         id INTEGER PRIMARY KEY AUTOINCREMENT,
         name TEXT UNIQUE,
         applied_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL
       )`,
    )
    .run();
  const applied = await appliedNames(db);
  for (const m of MIGRATIONS) {
    if (applied.has(m.name)) continue;
    try {
      // 迁移语句与记录写入同一批次，D1 批次为事务，失败时整体回滚
      await db.batch([
        ...splitStatements(m.sql).map((s) => db.prepare(s)),
        db.prepare("INSERT INTO d1_migrations (name) VALUES (?)").bind(m.name),
      ]);
      console.log(`[migrate] applied ${m.name}`);
    } catch (err) {
      // 多个实例同时冷启动时可能已由其他实例完成
      if ((await appliedNames(db)).has(m.name)) continue;
      throw err;
    }
  }
}

let pending: Promise<void> | null = null;

export function ensureSchema(db: D1Database) {
  pending ??= migrate(db).catch((err) => {
    pending = null;
    throw err;
  });
  return pending;
}
