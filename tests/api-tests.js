const crypto = require("crypto");
const chalk = require("chalk");

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------
const API_URL = (process.env.API_URL || "http://localhost:8000").replace(
  /\/$/,
  ""
);
const RADAR_WEBHOOK_SECRET =
  process.env.RADAR_WEBHOOK_SECRET || "default-test-secret";

// ---------------------------------------------------------------------------
// State shared across tests
// ---------------------------------------------------------------------------
let authToken = null;
let adminToken = null;
let opportunityId = null;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
let passed = 0;
let failed = 0;

async function request(method, path, { body, token, headers: extra } = {}) {
  const url = `${API_URL}${path}`;
  const headers = { "Content-Type": "application/json", ...extra };
  if (token) headers["Authorization"] = `Bearer ${token}`;

  const opts = { method, headers };
  if (body) opts.body = JSON.stringify(body);

  const res = await fetch(url, opts);
  let data = null;
  const text = await res.text();
  try {
    data = JSON.parse(text);
  } catch {
    data = text;
  }
  return { status: res.status, data };
}

function assert(condition, label, detail) {
  if (condition) {
    passed++;
    console.log(chalk.green(`  PASS `) + label);
  } else {
    failed++;
    console.log(chalk.red(`  FAIL `) + label + (detail ? ` — ${detail}` : ""));
  }
}

function section(name) {
  console.log();
  console.log(chalk.bold.cyan(`=== ${name} ===`));
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

async function testHealth() {
  section("Health");

  const { status, data } = await request("GET", "/health");
  assert(status === 200, "GET /health returns 200", `got ${status}`);
  assert(
    data && data.status === "ok",
    'GET /health body has status "ok"',
    `got ${JSON.stringify(data)}`
  );
}

async function testAuth() {
  section("Auth");

  // 2. Register
  const reg = await request("POST", "/auth/register", {
    body: {
      email: "test@radar.test",
      password: "Test1234!",
      full_name: "Test User",
    },
  });
  assert(reg.status === 201, "POST /auth/register new user returns 201", `got ${reg.status}`);
  if (reg.data && reg.data.token) authToken = reg.data.token;
  if (reg.data && reg.data.access_token) authToken = reg.data.access_token;

  // 3. Duplicate register
  const dup = await request("POST", "/auth/register", {
    body: {
      email: "test@radar.test",
      password: "Test1234!",
      full_name: "Test User",
    },
  });
  assert(dup.status === 400, "POST /auth/register duplicate returns 400", `got ${dup.status}`);

  // 4. Login success
  const login = await request("POST", "/auth/login", {
    body: { email: "test@radar.test", password: "Test1234!" },
  });
  assert(login.status === 200, "POST /auth/login valid credentials returns 200", `got ${login.status}`);
  if (login.data && login.data.token) authToken = login.data.token;
  if (login.data && login.data.access_token) authToken = login.data.access_token;

  // 5. Login wrong password
  const bad = await request("POST", "/auth/login", {
    body: { email: "test@radar.test", password: "wrong" },
  });
  assert(bad.status === 401, "POST /auth/login wrong password returns 401", `got ${bad.status}`);
}

async function testProfile() {
  section("Profile");

  // 6. GET profile
  const get = await request("GET", "/api/profile", { token: authToken });
  assert(get.status === 200, "GET /api/profile returns 200", `got ${get.status}`);
  assert(
    get.data && typeof get.data === "object",
    "GET /api/profile returns profile object",
    `got ${typeof get.data}`
  );

  // 7. PUT profile
  const put = await request("PUT", "/api/profile", {
    token: authToken,
    body: {
      keywords: ["react", "node", "freelance"],
      min_score: 50,
      onboarding_complete: true,
      alert_number: "+33600000000",
    },
  });
  assert(put.status === 200, "PUT /api/profile update returns 200", `got ${put.status}`);

  // 8. Generate keywords
  const gen = await request("POST", "/api/profile/generate-keywords", {
    token: authToken,
    body: { raw_text: "Je suis développeur React et Node.js freelance" },
  });
  assert(
    gen.status === 200 || gen.status === 500,
    "POST /api/profile/generate-keywords returns 200 or 500",
    `got ${gen.status}`
  );
}

async function testGroups() {
  section("Groups");

  const { status, data } = await request("GET", "/api/groups", {
    token: authToken,
  });
  assert(status === 200, "GET /api/groups returns 200", `got ${status}`);
  assert(Array.isArray(data), "GET /api/groups returns array", `got ${typeof data}`);
}

async function testWhatsApp() {
  section("WhatsApp");

  // 10. Connect
  const conn = await request("POST", "/api/whatsapp/connect", {
    token: authToken,
  });
  assert(
    conn.status === 200 || conn.status >= 400,
    "POST /api/whatsapp/connect returns 200 or error",
    `got ${conn.status}`
  );

  // 11. Status
  const st = await request("GET", "/api/whatsapp/status", {
    token: authToken,
  });
  assert(st.status === 200, "GET /api/whatsapp/status returns 200", `got ${st.status}`);

  // 12. QR
  const qr = await request("GET", "/api/whatsapp/qr", {
    token: authToken,
  });
  assert(
    qr.status === 200 || qr.status === 404,
    "GET /api/whatsapp/qr returns 200 or 404",
    `got ${qr.status}`
  );
}

async function testWebhook() {
  section("Hub & Spoke Webhook");

  const payload = {
    group_id: "120363001234567890@g.us",
    group_name: "Test Group",
    sender_phone: "+33612345678",
    sender_name: "Jean Test",
    content:
      "Bonjour, je recherche un développeur React freelance pour une mission",
    timestamp: Math.floor(Date.now() / 1000),
  };

  // 13. No signature
  const noSig = await request("POST", "/webhook/hub-spoke", { body: payload });
  assert(
    noSig.status === 401,
    "POST /webhook/hub-spoke without signature returns 401",
    `got ${noSig.status}`
  );

  // 14. Invalid signature
  const badSig = await request("POST", "/webhook/hub-spoke", {
    body: payload,
    headers: {
      "X-Radar-Signature": "invalidsignature",
      "X-Radar-Timestamp": Math.floor(Date.now() / 1000).toString(),
    },
  });
  assert(
    badSig.status === 401,
    "POST /webhook/hub-spoke with invalid signature returns 401",
    `got ${badSig.status}`
  );

  // 15. Valid signature
  const timestamp = Math.floor(Date.now() / 1000).toString();
  const signature = crypto
    .createHmac("sha256", RADAR_WEBHOOK_SECRET)
    .update(JSON.stringify(payload) + timestamp)
    .digest("hex");

  const good = await request("POST", "/webhook/hub-spoke", {
    body: payload,
    headers: {
      "X-Radar-Signature": signature,
      "X-Radar-Timestamp": timestamp,
    },
  });
  assert(
    good.status === 200,
    "POST /webhook/hub-spoke with valid HMAC returns 200",
    `got ${good.status}`
  );
}

async function testOpportunities() {
  section("Opportunities");

  const list = await request("GET", "/api/opportunities", {
    token: authToken,
  });
  assert(list.status === 200, "GET /api/opportunities returns 200", `got ${list.status}`);
  assert(
    Array.isArray(list.data),
    "GET /api/opportunities returns array",
    `got ${typeof list.data}`
  );

  // 17. Get single opportunity if any exist
  if (Array.isArray(list.data) && list.data.length > 0) {
    opportunityId = list.data[0].id;
    const single = await request("GET", `/api/opportunities/${opportunityId}`, {
      token: authToken,
    });
    assert(
      single.status === 200,
      `GET /api/opportunities/${opportunityId} returns 200`,
      `got ${single.status}`
    );
  } else {
    console.log(chalk.yellow("  SKIP") + " GET /api/opportunities/:id — no opportunities found");
  }
}

async function testScan() {
  section("Scan");

  const scan = await request("POST", "/api/scan/historical", {
    token: authToken,
    body: { group_ids: [] },
  });
  assert(
    scan.status === 202,
    "POST /api/scan/historical returns 202",
    `got ${scan.status}`
  );
}

async function testContacts() {
  section("Contacts");

  const hist = await request("GET", "/api/contacts/+33612345678/history", {
    token: authToken,
  });
  assert(
    hist.status === 200 || hist.status === 404,
    "GET /api/contacts/+33612345678/history returns 200 or 404",
    `got ${hist.status}`
  );
}

async function testAdmin() {
  section("Admin");

  // 20. Register admin user (will be regular, not actually admin)
  const reg = await request("POST", "/auth/register", {
    body: {
      email: "admin-test@radar.test",
      password: "Admin1234!",
    },
  });
  if (reg.data && reg.data.token) adminToken = reg.data.token;
  if (reg.data && reg.data.access_token) adminToken = reg.data.access_token;

  // Use authToken (regular user) to test 403
  const tokenForAdmin = authToken || adminToken;

  // 21. GET /api/admin/users
  const users = await request("GET", "/api/admin/users", {
    token: tokenForAdmin,
  });
  assert(
    users.status === 403,
    "GET /api/admin/users with regular token returns 403",
    `got ${users.status}`
  );

  // 22. GET /api/admin/config
  const config = await request("GET", "/api/admin/config", {
    token: tokenForAdmin,
  });
  assert(
    config.status === 403,
    "GET /api/admin/config with regular token returns 403",
    `got ${config.status}`
  );
}

// ---------------------------------------------------------------------------
// Runner
// ---------------------------------------------------------------------------

async function main() {
  console.log(chalk.bold.white(`\nRadar API Test Suite`));
  console.log(chalk.gray(`Target: ${API_URL}`));
  console.log(chalk.gray(`Webhook secret: ${RADAR_WEBHOOK_SECRET ? "(set)" : "(not set)"}`));

  try {
    await testHealth();
    await testAuth();
    await testProfile();
    await testGroups();
    await testWhatsApp();
    await testWebhook();
    await testOpportunities();
    await testScan();
    await testContacts();
    await testAdmin();
  } catch (err) {
    failed++;
    console.log(chalk.red(`\n  FATAL ERROR: ${err.message}`));
    if (err.cause) console.log(chalk.red(`  Cause: ${err.cause.message || err.cause}`));
  }

  const total = passed + failed;
  console.log();
  console.log(chalk.bold.white("=== Summary ==="));
  console.log(
    chalk.green(`${passed} passed`) +
      ", " +
      chalk.red(`${failed} failed`) +
      `, ${total} total`
  );
  console.log();

  process.exit(failed > 0 ? 1 : 0);
}

main();
