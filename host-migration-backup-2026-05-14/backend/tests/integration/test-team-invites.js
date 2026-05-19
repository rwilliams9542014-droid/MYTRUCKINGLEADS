import assert from "node:assert/strict";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import dotenv from "dotenv";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

dotenv.config({ path: join(__dirname, "..", "..", ".env") });

if (!process.env.JWT_SECRET) {
  process.env.JWT_SECRET = "test-team-invite-secret";
}

const { query } = await import("../../config/db.js");
const {
  inviteTeamMember,
  getTeamInvite,
  acceptTeamInvite,
  removeTeamMember
} = await import("../../controllers/teamController.js");

const createdUserIds = [];
const createdMemberIds = [];

function randomHandle(prefix) {
  return `${prefix}-${Date.now()}-${crypto.randomBytes(4).toString("hex")}`;
}

function createMockResponse() {
  return {
    statusCode: 200,
    body: null,
    cookies: {},
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      this.body = payload;
      return this;
    },
    cookie(name, value, options) {
      this.cookies[name] = { value, options };
      return this;
    }
  };
}

async function callController(controller, req) {
  const res = createMockResponse();
  let nextError = null;

  await controller(req, res, (err) => {
    if (err) nextError = err;
  });

  if (nextError) throw nextError;
  return res;
}

async function ensureTeamInviteSchema() {
  await query(`
    ALTER TABLE users
      ADD COLUMN IF NOT EXISTS team_owner_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
      ADD COLUMN IF NOT EXISTS team_member_role TEXT,
      ADD COLUMN IF NOT EXISTS monthly_export_rows INTEGER NOT NULL DEFAULT 0,
      ADD COLUMN IF NOT EXISTS monthly_export_reset_at TIMESTAMPTZ DEFAULT NOW(),
      ADD COLUMN IF NOT EXISTS last_usage_reset_at TIMESTAMPTZ DEFAULT NOW()
  `);

  await query(`
    CREATE TABLE IF NOT EXISTS team_members (
      id SERIAL PRIMARY KEY,
      owner_user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      email TEXT NOT NULL,
      name TEXT,
      role TEXT NOT NULL DEFAULT 'member',
      status TEXT NOT NULL DEFAULT 'invited',
      linked_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
      invite_token TEXT,
      invite_expires_at TIMESTAMPTZ,
      accepted_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW(),
      UNIQUE(owner_user_id, email)
    )
  `);

  await query(`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_team_members_invite_token
      ON team_members (invite_token)
      WHERE invite_token IS NOT NULL
  `);
}

async function createOwnerUser() {
  const handle = randomHandle("team-owner");
  const result = await query(
    `INSERT INTO users (
       name, username, email, password_hash, plan, subscription_status,
       business_name, role, monthly_export_rows, monthly_export_reset_at, last_usage_reset_at
     )
     VALUES ($1, $2, $3, $4, 'premium', 'active', $5, 'owner', 0, NOW(), NOW())
     RETURNING id, name, username, email, plan, subscription_status, business_name, role,
               monthly_export_rows, monthly_export_reset_at, last_usage_reset_at`,
    [
      "Agency Owner",
      handle,
      `${handle}@example.com`,
      "test-password-hash",
      "Agency Test Group"
    ]
  );

  const owner = result.rows[0];
  createdUserIds.push(owner.id);
  return owner;
}

async function findTeamMember(ownerUserId, email) {
  const result = await query(
    `SELECT id, owner_user_id, email, role, status, linked_user_id, invite_token, invite_expires_at, accepted_at
     FROM team_members
     WHERE owner_user_id = $1 AND email = $2`,
    [ownerUserId, email]
  );

  return result.rows[0] || null;
}

async function findUserByEmail(email) {
  const result = await query(
    `SELECT id, email, username, team_owner_user_id, team_member_role, subscription_status
     FROM users
     WHERE email = $1`,
    [email]
  );

  return result.rows[0] || null;
}

async function cleanup() {
  if (createdMemberIds.length) {
    await query("DELETE FROM team_members WHERE id = ANY($1::int[])", [createdMemberIds]).catch(() => {});
  }

  if (createdUserIds.length) {
    await query("DELETE FROM users WHERE id = ANY($1::int[])", [createdUserIds]).catch(() => {});
  }
}

async function main() {
  console.log("Team invite regression test");

  try {
    await ensureTeamInviteSchema();

    const owner = await createOwnerUser();
    const inviteEmail = `${randomHandle("team-user")}@example.com`;

    const inviteResponse = await callController(inviteTeamMember, {
      user: owner,
      body: {
        name: "Team Producer",
        email: inviteEmail
      },
      headers: {
        host: "www.mytruckingleads.com",
        "x-forwarded-proto": "https"
      },
      protocol: "https",
      get(name) {
        return name === "host" ? "www.mytruckingleads.com" : "";
      }
    });

    assert.ok([201, 202].includes(inviteResponse.statusCode));
    assert.equal(inviteResponse.body.member.email, inviteEmail);
    assert.ok(inviteResponse.body.inviteUrl.includes("signup.html?invite="));

    const invitedMember = await findTeamMember(owner.id, inviteEmail);
    assert.ok(invitedMember, "expected invited team member row");
    assert.equal(invitedMember.status, "invited");
    assert.ok(invitedMember.invite_token, "expected invite token to be stored");
    createdMemberIds.push(invitedMember.id);

    const inviteLookupResponse = await callController(getTeamInvite, {
      params: {
        token: invitedMember.invite_token
      }
    });

    assert.equal(inviteLookupResponse.statusCode, 200);
    assert.equal(inviteLookupResponse.body.invite.email, inviteEmail);
    assert.equal(inviteLookupResponse.body.invite.plan, "premium");

    const acceptedUsername = randomHandle("teammember");
    const acceptResponse = await callController(acceptTeamInvite, {
      body: {
        token: invitedMember.invite_token,
        firstName: "Taylor",
        lastName: "Producer",
        username: acceptedUsername,
        email: inviteEmail,
        phone: "555-555-1212",
        password: "StrongPass1"
      }
    });

    assert.equal(acceptResponse.statusCode, 201);
    assert.equal(acceptResponse.body.user.email, inviteEmail);
    assert.equal(acceptResponse.body.user.isTeamMember, true);
    assert.equal(acceptResponse.body.user.teamOwnerUserId, owner.id);
    assert.ok(acceptResponse.cookies.auth_token?.value, "expected auth cookie on invite acceptance");

    const createdTeamUser = await findUserByEmail(inviteEmail);
    assert.ok(createdTeamUser, "expected team user account to be created");
    assert.equal(createdTeamUser.team_owner_user_id, owner.id);
    createdUserIds.push(createdTeamUser.id);

    const acceptedMember = await findTeamMember(owner.id, inviteEmail);
    assert.ok(acceptedMember, "expected team member row after acceptance");
    assert.equal(acceptedMember.status, "active");
    assert.equal(acceptedMember.linked_user_id, createdTeamUser.id);
    assert.equal(acceptedMember.invite_token, null);
    assert.ok(acceptedMember.accepted_at, "expected accepted timestamp");

    const removeResponse = await callController(removeTeamMember, {
      user: owner,
      params: {
        id: acceptedMember.id
      }
    });

    assert.equal(removeResponse.statusCode, 200);

    const removedMember = await findTeamMember(owner.id, inviteEmail);
    assert.equal(removedMember, null, "expected team member row to be removed");

    const removedUser = await findUserByEmail(inviteEmail);
    assert.ok(removedUser, "expected invited user record to remain for login history");
    assert.equal(removedUser.team_owner_user_id, null);
    assert.equal(removedUser.subscription_status, "inactive");

    console.log("PASS unlimited team invite flow creates, accepts, and removes logins correctly");
  } finally {
    await cleanup();
  }
}

main().catch((err) => {
  console.error("Team invite regression test failed:", err);
  process.exit(1);
});
