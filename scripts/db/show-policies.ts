import { adminClient, closeAdmin } from '../tests/helpers.ts';

const client = await adminClient();
const table = process.argv[2] ?? 'profiles';

const { rows } = await client.query(
  `select policyname, cmd, permissive, roles::text, qual, with_check
     from pg_policies
    where schemaname = 'public' and tablename = $1
    order by policyname`,
  [table],
);

for (const r of rows) {
  console.log(`--- ${r.policyname} [${r.cmd}] permissive=${r.permissive} roles=${r.roles}`);
  if (r.qual) console.log(`    USING      : ${r.qual}`);
  if (r.with_check) console.log(`    WITH CHECK : ${r.with_check}`);
}

const rel = await client.query(
  `select relrowsecurity, relforcerowsecurity from pg_class where relname = $1 and relnamespace = 'public'::regnamespace`,
  [table],
);
console.log('\nRLS enabled:', rel.rows[0]?.relrowsecurity, 'forced:', rel.rows[0]?.relforcerowsecurity);

const grants = await client.query(
  `select grantee, privilege_type from information_schema.role_table_grants
    where table_schema = 'public' and table_name = $1 and grantee in ('anon','authenticated','service_role')
    order by grantee, privilege_type`,
  [table],
);
console.log('grants:', grants.rows.map((g) => `${g.grantee}:${g.privilege_type}`).join(' '));

await closeAdmin();
