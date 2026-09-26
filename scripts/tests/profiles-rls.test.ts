import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  adminClient,
  asUser,
  attempt,
  closeAdmin,
  createAuthUser,
  setLegacyRole,
  truncateAll,
  type TestUser,
} from './helpers.ts';

/**
 * PART 1 — profile / RLS privilege escalation.
 *
 * Every assertion describes the behaviour the product requires and runs
 * against the real schema with real row security enabled, so a pass is a real
 * pass. `asUser` opens a transaction and always rolls it back, so assertions
 * about the *persisted* result are made afterwards through the RLS-exempt
 * connection: "the attacker could not make this stick" is exactly the claim
 * under test, and it must be checked where the attacker has no read access.
 *
 * A missing USING clause and a violated WITH CHECK both "block" an update, but
 * in different ways (0 rows vs 42501), and both differ from a column-grant
 * refusal. `attempt()` reports the distinction so a test cannot pass for the
 * wrong reason.
 */

let ordinary: TestUser;
let other: TestUser;
let organizer: TestUser;
let superAdmin: TestUser;
let finance: TestUser;
let adminUser: TestUser;

let supportRoleId: string;

/** Reads a column through the RLS-exempt connection. */
async function field(userId: string, column: string): Promise<string | null> {
  const client = await adminClient();
  const { rows } = await client.query(
    `select ${column}::text as v from public.profiles where id = $1`,
    [userId],
  );
  return rows.length ? (rows[0].v ?? null) : null;
}

async function setField(userId: string, column: string, value: string) {
  const client = await adminClient();
  await client.query(`update public.profiles set ${column} = $2 where id = $1`, [userId, value]);
}

async function roleNames(userId: string): Promise<string[]> {
  const client = await adminClient();
  const { rows } = await client.query(
    `select r.name from public.user_roles ur
       join public.roles r on r.id = ur.role_id
      where ur.user_id = $1`,
    [userId],
  );
  return rows.map((r) => r.name).sort();
}

before(async () => {
  await truncateAll();
  ordinary = await createAuthUser('ordinary@example.com');
  other = await createAuthUser('other@example.com');
  organizer = await createAuthUser('host@example.com');
  superAdmin = await createAuthUser('root@example.com');
  finance = await createAuthUser('finance@example.com');
  adminUser = await createAuthUser('admin@example.com');
  await setLegacyRole(organizer.id, 'organizer');
  await setLegacyRole(superAdmin.id, 'super_admin');
  await setLegacyRole(finance.id, 'finance');
  await setLegacyRole(adminUser.id, 'admin');

  const client = await adminClient();
  const { rows } = await client.query(`select id from public.roles where name = 'support'`);
  supportRoleId = rows[0].id;
});

after(async () => {
  await closeAdmin();
});

describe('profiles: an ordinary user cannot escalate privileges', () => {
  it('cannot set is_admin on their own row', async () => {
    await asUser(ordinary.id, (c) =>
      attempt(c, `update public.profiles set is_admin = true where id = $1`, [ordinary.id]),
    );
    assert.equal(await field(ordinary.id, 'is_admin'), 'false', 'is_admin was self-writable');
  });

  it('cannot set role on their own row', async () => {
    await asUser(ordinary.id, (c) =>
      attempt(c, `update public.profiles set role = 'admin' where id = $1`, [ordinary.id]),
    );
    assert.equal(await field(ordinary.id, 'role'), 'viewer', 'role was self-writable');
  });

  it('cannot un-suspend themselves', async () => {
    await setField(ordinary.id, 'account_status', 'suspended');
    await asUser(ordinary.id, (c) =>
      attempt(c, `update public.profiles set account_status = 'active' where id = $1`, [
        ordinary.id,
      ]),
    );
    assert.equal(
      await field(ordinary.id, 'account_status'),
      'suspended',
      'a suspended user reactivated their own account',
    );
    await setField(ordinary.id, 'account_status', 'active');
  });

  it('cannot set kyc_status', async () => {
    await asUser(ordinary.id, (c) =>
      attempt(c, `update public.profiles set kyc_status = 'approved' where id = $1`, [
        ordinary.id,
      ]),
    );
    assert.equal(await field(ordinary.id, 'kyc_status'), 'none');
  });

  it('cannot set bank or payout fields', async () => {
    await asUser(ordinary.id, (c) =>
      attempt(
        c,
        `update public.profiles
            set bank_account_encrypted = 'x',
                payout_preferences = '{"bank":"evil"}'::jsonb
          where id = $1`,
        [ordinary.id],
      ),
    );
    assert.equal(await field(ordinary.id, 'bank_account_encrypted'), null);
    assert.equal(await field(ordinary.id, 'payout_preferences'), '{}');
  });

  it('cannot rewrite host verification fields', async () => {
    await asUser(ordinary.id, (c) =>
      attempt(
        c,
        `update public.profiles
            set host_verification_status = 'verified',
                host_verification_reviewed_by = auth.uid()
          where id = $1`,
        [ordinary.id],
      ),
    );
    assert.equal(await field(ordinary.id, 'host_verification_status'), 'unverified');
  });

  it('cannot escalate with a combined payload in one statement', async () => {
    await asUser(ordinary.id, (c) =>
      attempt(
        c,
        `update public.profiles
            set is_admin = true,
                account_status = 'active',
                role = 'admin',
                kyc_status = 'approved',
                bank_account_encrypted = 'x'
          where id = $1`,
        [ordinary.id],
      ),
    );
    assert.equal(await field(ordinary.id, 'is_admin'), 'false');
    assert.equal(await field(ordinary.id, 'role'), 'viewer');
    assert.equal(await field(ordinary.id, 'kyc_status'), 'none');
    assert.equal(await field(ordinary.id, 'bank_account_encrypted'), null);
  });

  it('cannot edit another user', async () => {
    const result = await asUser(ordinary.id, (c) =>
      attempt(c, `update public.profiles set name = 'hijacked' where id = $1`, [other.id]),
    );
    assert.equal(result.rowCount, 0, 'a cross-user update affected rows');
    assert.notEqual(await field(other.id, 'name'), 'hijacked');
  });

  it('cannot read another user', async () => {
    await asUser(ordinary.id, async (c) => {
      const { rows } = await c.query(`select * from public.profiles where id = $1`, [other.id]);
      assert.equal(rows.length, 0);
    });
  });

  it('cannot insert or delete profile rows', async () => {
    await asUser(ordinary.id, async (c) => {
      const ins = await attempt(
        c,
        `insert into public.profiles (id, name, email, role) values (gen_random_uuid(), 'x', 'x@x.com', 'admin')`,
      );
      const del = await attempt(c, `delete from public.profiles where id = $1`, [other.id]);
      assert.equal(ins.rowCount, 0, 'profile insert was permitted');
      assert.equal(del.rowCount, 0, 'profile delete was permitted');
    });
  });

  it('cannot grant itself a privileged role through user_roles', async () => {
    await asUser(ordinary.id, (c) =>
      attempt(
        c,
        `insert into public.user_roles (user_id, role_id)
         select $1, id from public.roles where name in ('super_admin','admin','finance')`,
        [ordinary.id],
      ),
    );
    assert.deepEqual(
      await roleNames(ordinary.id),
      ['viewer'],
      'an ordinary user holds a role beyond the default viewer',
    );
  });

  it('cannot forge audit rows through write_audit_log', async () => {
    const result = await asUser(ordinary.id, (c) =>
      attempt(
        c,
        `select public.write_audit_log('payout_status', 'payout', '1', '{"smuggled":true}'::jsonb)`,
      ),
    );
    assert.equal(result.ok, false, 'write_audit_log is callable by an ordinary user');
  });

  it('cannot probe another user permissions', async () => {
    await asUser(ordinary.id, async (c) => {
      const { rows } = await c.query(
        `select public.user_has_permission($1, 'staff.permissions') as v`,
        [superAdmin.id],
      );
      assert.equal(rows[0].v, false, 'permission probing leaked another user grants');
    });
  });
});

describe('profiles: approved self-service still works', () => {
  it('can update their own display name', async () => {
    const result = await asUser(ordinary.id, (c) =>
      attempt(c, `update public.profiles set name = 'Ada L' where id = $1`, [ordinary.id]),
    );
    assert.equal(result.ok, true, `name update blocked: ${result.error}`);
    assert.equal(result.rowCount, 1);
  });

  it('can update phone, bio and push preference', async () => {
    const result = await asUser(ordinary.id, (c) =>
      attempt(
        c,
        `update public.profiles
            set phone = '+2348000000000', bio = 'DJ', push_enabled = false
          where id = $1`,
        [ordinary.id],
      ),
    );
    assert.equal(result.ok, true, `safe-field update blocked: ${result.error}`);
  });

  it('can use the whitelisted update_my_profile rpc', async () => {
    const result = await asUser(ordinary.id, (c) =>
      attempt(c, `select public.update_my_profile('Grace H', '+2348111111111')`),
    );
    assert.equal(result.ok, true, `update_my_profile blocked: ${result.error}`);
    await asUser(ordinary.id, async (c) => {
      const { rows } = await c.query(
        `update public.profiles set name = 'Grace H' where id = $1 returning name`,
        [ordinary.id],
      );
      assert.equal(rows[0].name, 'Grace H');
    });
  });

  it('update_my_profile exposes no privileged parameter', async () => {
    const result = await asUser(ordinary.id, (c) =>
      attempt(
        c,
        `select public.update_my_profile('Mallory', null, 'admin', true, 'super_admin')`,
      ),
    );
    assert.equal(result.ok, false, 'update_my_profile accepted a 5th privileged argument');
    assert.equal(await field(ordinary.id, 'role'), 'viewer');
    assert.equal(await field(ordinary.id, 'is_admin'), 'false');
  });

  it('can still read their own profile', async () => {
    await asUser(ordinary.id, async (c) => {
      const { rows } = await c.query(
        `select id, name, role from public.profiles where id = $1`,
        [ordinary.id],
      );
      assert.equal(rows.length, 1);
    });
  });
});

describe('profiles: staff authority is preserved', () => {
  it('a super admin can assign a role through set_user_roles', async () => {
    const result = await asUser(
      superAdmin.id,
      (c) =>
        attempt(c, `select public.set_user_roles($1, array[$2::uuid])`, [other.id, supportRoleId]),
      { commit: true },
    );
    assert.equal(result.ok, true, `staff role assignment blocked: ${result.error}`);
    assert.ok((await roleNames(other.id)).includes('support'));
  });

  it('an ordinary user cannot assign roles', async () => {
    const result = await asUser(ordinary.id, (c) =>
      attempt(c, `select public.set_user_roles($1, array[$2::uuid])`, [ordinary.id, supportRoleId]),
    );
    assert.equal(result.ok, false, 'an ordinary user assigned themselves a role');
    assert.deepEqual(await roleNames(ordinary.id), ['viewer']);
  });

  it('an admin can suspend a host through the audited RPC', async () => {
    const result = await asUser(
      adminUser.id,
      (c) => attempt(c, `select public.set_user_account_status($1, 'suspended')`, [organizer.id]),
      { commit: true },
    );
    assert.equal(result.ok, true, `admin suspension blocked: ${result.error}`);
    assert.equal(await field(organizer.id, 'account_status'), 'suspended');
    await setField(organizer.id, 'account_status', 'active');
  });

  it('a finance user cannot suspend a host (no staff.suspend)', async () => {
    const result = await asUser(finance.id, (c) =>
      attempt(c, `select public.set_user_account_status($1, 'suspended')`, [organizer.id]),
    );
    assert.equal(result.ok, false, 'finance suspended a user without staff.suspend');
    assert.equal(await field(organizer.id, 'account_status'), 'active');
  });

  it('privileged columns are not directly writable even by staff', async () => {
    await asUser(superAdmin.id, async (c) => {
      const acc = await attempt(
        c,
        `update public.profiles set account_status = 'banned' where id = $1`,
        [organizer.id],
      );
      const adm = await attempt(
        c,
        `update public.profiles set is_admin = true where id = $1`,
        [organizer.id],
      );
      assert.equal(acc.ok, false, 'account_status was writable outside the RPC');
      assert.equal(adm.ok, false, 'is_admin was writable as a raw column');
    });
    assert.equal(await field(organizer.id, 'account_status'), 'active');
    assert.equal(await field(organizer.id, 'is_admin'), 'false');
  });

  it('is_admin can never diverge from role', async () => {
    const client = await adminClient();
    await client.query(`update public.profiles set role = 'admin' where id = $1`, [other.id]);
    assert.equal(await field(other.id, 'is_admin'), 'true', 'is_admin did not follow role');
    await client.query(`update public.profiles set role = 'viewer' where id = $1`, [other.id]);
    assert.equal(await field(other.id, 'is_admin'), 'false', 'is_admin did not follow role back');
  });

  it('super_admin is not assignable through a plain update', async () => {
    const result = await asUser(superAdmin.id, (c) =>
      attempt(c, `update public.profiles set role = 'super_admin' where id = $1`, [other.id]),
    );
    assert.equal(result.ok, false, 'super_admin was assignable via a raw update');
  });

  it('the last super admin cannot be demoted', async () => {
    const result = await asUser(superAdmin.id, (c) =>
      attempt(c, `update public.profiles set role = 'admin' where id = $1`, [superAdmin.id]),
    );
    assert.equal(result.ok, false, 'the last super admin was demotable');
    assert.equal(await field(superAdmin.id, 'role'), 'super_admin');
  });

  it('the last super admin cannot be suspended', async () => {
    const result = await asUser(superAdmin.id, (c) =>
      attempt(c, `select public.set_user_account_status($1, 'suspended')`, [superAdmin.id]),
    );
    assert.notEqual(result.ok, true, 'the last super admin was suspendable');
    assert.equal(await field(superAdmin.id, 'account_status'), 'active');
  });
});
