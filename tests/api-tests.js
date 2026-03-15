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
const ADMIN_EMAIL =
  process.env.ADMIN_EMAIL || "admin@radar.jockaliaservices.fr";
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "Radar@2026!";

// ---------------------------------------------------------------------------
// State shared across tests
// ---------------------------------------------------------------------------
let authToken = null;
let adminToken = null;
let opportunityId = null;
let userId = null;
const TEST_EMAIL = `test_${Date.now()}@radar.test`;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
let passed = 0;
let failed = 0;
let skipped = 0;

async function request(method, path, { body, token, headers: extra, rawBody } = {}) {
  const url = `${API_URL}${path}`;
  const headers = { "Content-Type": "application/json", ...extra };
  if (token) headers["Authorization"] = `Bearer ${token}`;

  const opts = { method, headers };
  if (rawBody) {
    opts.body = rawBody;
  } else if (body) {
    opts.body = JSON.stringify(body);
  }

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

function skip(label, reason) {
  skipped++;
  console.log(chalk.yellow(`  SKIP `) + label + (reason ? ` — ${reason}` : ""));
}

function section(name) {
  console.log();
  console.log(chalk.bold.cyan(`=== ${name} ===`));
}

// ---------------------------------------------------------------------------
// SC-AUTH: Authentication Tests
// ---------------------------------------------------------------------------

async function testHealth() {
  section("SC-HEALTH: Health Check");

  const { status, data } = await request("GET", "/health");
  assert(status === 200, "GET /health returns 200", `got ${status}`);
  assert(data && data.status === "ok", 'health status is "ok"');
  assert(data && data.services, "health includes services object");
  assert(data && data.services && data.services.database && data.services.database.status === "ok", "database is healthy");
  assert(data && data.services && data.services.redis && data.services.redis.status === "ok", "redis is healthy");
  assert(data && typeof data.uptime_seconds === "number", "uptime_seconds is a number");
  assert(data && data.version, "version is present");
}

async function testAuth() {
  section("SC-AUTH: Authentication");

  // SC-AUTH-01: Register new user
  const reg = await request("POST", "/auth/register", {
    body: {
      email: TEST_EMAIL,
      password: "Test1234!",
      full_name: "Test User",
    },
  });
  assert(reg.status === 201, "SC-AUTH-01: Register new user returns 201", `got ${reg.status}`);
  assert(reg.data && (reg.data.token || reg.data.access_token), "SC-AUTH-01: Register returns a token");
  assert(reg.data && reg.data.user, "SC-AUTH-01: Register returns user object");
  if (reg.data) {
    authToken = reg.data.token || reg.data.access_token;
    if (reg.data.user) userId = reg.data.user.id;
  }

  // SC-AUTH-02: Register duplicate email
  const dup = await request("POST", "/auth/register", {
    body: {
      email: TEST_EMAIL,
      password: "Test1234!",
      full_name: "Test User",
    },
  });
  assert(dup.status === 400, "SC-AUTH-02: Duplicate email returns 400", `got ${dup.status}`);

  // SC-AUTH-03: Register with short password
  const shortPwd = await request("POST", "/auth/register", {
    body: {
      email: `short_${Date.now()}@test.com`,
      password: "abc",
      full_name: "Test",
    },
  });
  assert(
    shortPwd.status === 400 || shortPwd.status === 201,
    "SC-AUTH-03: Short password handled (400 or accepted)",
    `got ${shortPwd.status}`
  );

  // SC-AUTH-04: Login with valid credentials
  const login = await request("POST", "/auth/login", {
    body: { email: TEST_EMAIL, password: "Test1234!" },
  });
  assert(login.status === 200, "SC-AUTH-04: Login valid credentials returns 200", `got ${login.status}`);
  assert(login.data && (login.data.token || login.data.access_token), "SC-AUTH-04: Login returns token");
  if (login.data) authToken = login.data.token || login.data.access_token;

  // SC-AUTH-05: Login wrong password
  const bad = await request("POST", "/auth/login", {
    body: { email: TEST_EMAIL, password: "wrong" },
  });
  assert(bad.status === 401, "SC-AUTH-05: Wrong password returns 401", `got ${bad.status}`);

  // SC-AUTH-06: Login inexistent email
  const noUser = await request("POST", "/auth/login", {
    body: { email: "inexistant@nowhere.test", password: "whatever" },
  });
  assert(noUser.status === 401, "SC-AUTH-06: Unknown email returns 401", `got ${noUser.status}`);

  // SC-AUTH-07: Access protected route without token
  const noAuth = await request("GET", "/api/profile");
  assert(noAuth.status === 401, "SC-AUTH-07: No token returns 401", `got ${noAuth.status}`);

  // SC-AUTH-09: Access with invalid token
  const badToken = await request("GET", "/api/profile", {
    token: "invalid.token.here",
  });
  assert(badToken.status === 401, "SC-AUTH-09: Invalid token returns 401", `got ${badToken.status}`);

  // Login as admin
  const adminLogin = await request("POST", "/auth/login", {
    body: { email: ADMIN_EMAIL, password: ADMIN_PASSWORD },
  });
  if (adminLogin.status === 200 && adminLogin.data) {
    adminToken = adminLogin.data.token || adminLogin.data.access_token;
    assert(true, "Admin login successful");
  } else {
    skip("Admin login", `returned ${adminLogin.status}`);
  }
}

// ---------------------------------------------------------------------------
// SC-PROFILE: Profile Tests
// ---------------------------------------------------------------------------

async function testProfile() {
  section("SC-SET-01/02: Profile Management");

  if (!authToken) {
    skip("Profile tests", "no auth token");
    return;
  }

  // GET profile
  const get = await request("GET", "/api/profile", { token: authToken });
  assert(get.status === 200, "GET /api/profile returns 200", `got ${get.status}`);
  assert(get.data && typeof get.data === "object", "Profile is an object");

  if (get.status !== 200) return;

  // Verify profile structure
  const profile = get.data;
  assert(profile.user_id !== undefined, "Profile has user_id");
  assert(Array.isArray(profile.keywords), "Profile has keywords array");
  assert(typeof profile.min_score === "number", "Profile has min_score number");

  // PUT profile — update keywords and score
  const put = await request("PUT", "/api/profile", {
    token: authToken,
    body: {
      keywords: ["assurance", "mutuelle", "prévoyance", "épargne"],
      anti_keywords: ["spam", "pub"],
      intentions: ["recherche assurance", "besoin prévoyance"],
      sector: "Assurance / Finance",
      min_score: 75,
      alert_number: "+33600000000",
      onboarding_complete: true,
      raw_text: "Je suis courtier en assurance spécialisé dans l'assurance vie.",
    },
  });
  assert(put.status === 200, "PUT /api/profile update returns 200", `got ${put.status}`);

  // Verify update persisted
  const get2 = await request("GET", "/api/profile", { token: authToken });
  if (get2.status === 200) {
    assert(
      get2.data.min_score === 75,
      "Profile min_score updated to 75",
      `got ${get2.data.min_score}`
    );
    assert(
      get2.data.keywords && get2.data.keywords.includes("assurance"),
      "Profile keywords contain 'assurance'",
      `got ${JSON.stringify(get2.data.keywords)}`
    );
    assert(
      get2.data.onboarding_complete === true,
      "Profile onboarding_complete is true"
    );
  }

  // PUT profile — update name
  const putName = await request("PUT", "/api/profile", {
    token: authToken,
    body: { full_name: "Jean-Pierre Dupont" },
  });
  assert(putName.status === 200, "PUT /api/profile update name returns 200", `got ${putName.status}`);

  // PUT profile — slack_webhook_url
  const putSlack = await request("PUT", "/api/profile", {
    token: authToken,
    body: { slack_webhook_url: "https://hooks.slack.com/services/T.../B.../xxx" },
  });
  assert(putSlack.status === 200, "PUT /api/profile update slack_webhook_url returns 200", `got ${putSlack.status}`);

  // PUT profile — sharing toggle
  const putShare = await request("PUT", "/api/profile", {
    token: authToken,
    body: { sharing_enabled: true },
  });
  assert(putShare.status === 200, "PUT /api/profile toggle sharing returns 200", `got ${putShare.status}`);

  // Generate keywords via AI
  const gen = await request("POST", "/api/profile/generate-keywords", {
    token: authToken,
    body: { raw_text: "Je suis courtier en assurance spécialisé dans l'assurance vie et la prévoyance." },
  });
  assert(
    gen.status === 200 || gen.status === 500,
    "POST /api/profile/generate-keywords returns 200 or 500 (Gemini may not be configured)",
    `got ${gen.status}`
  );
  if (gen.status === 200) {
    assert(
      gen.data && Array.isArray(gen.data.keywords),
      "AI returns keywords array"
    );
    assert(
      gen.data && gen.data.sector,
      "AI returns sector"
    );
  }
}

// ---------------------------------------------------------------------------
// SC-GROUPS: Groups Tests
// ---------------------------------------------------------------------------

async function testGroups() {
  section("SC-SET-11: Groups Management");

  if (!authToken) {
    skip("Groups tests", "no auth token");
    return;
  }

  // GET groups
  const { status, data } = await request("GET", "/api/groups", {
    token: authToken,
  });
  assert(status === 200, "GET /api/groups returns 200", `got ${status}`);
  assert(Array.isArray(data), "GET /api/groups returns array");

  // Sync groups (may fail if no WhatsApp connection)
  const sync = await request("POST", "/api/groups/sync", {
    token: authToken,
  });
  assert(
    sync.status === 200 || sync.status === 400,
    "POST /api/groups/sync returns 200 or 400 (no connection)",
    `got ${sync.status}`
  );

  // Toggle group monitoring (only if groups exist)
  if (Array.isArray(data) && data.length > 0) {
    const groupId = data[0].id;
    const toggle = await request("PUT", `/api/groups/${groupId}/toggle`, {
      token: authToken,
    });
    assert(
      toggle.status === 200,
      `PUT /api/groups/${groupId}/toggle returns 200`,
      `got ${toggle.status}`
    );

    // Toggle back
    const toggleBack = await request("PUT", `/api/groups/${groupId}/toggle`, {
      token: authToken,
    });
    assert(
      toggleBack.status === 200,
      "Toggle back returns 200",
      `got ${toggleBack.status}`
    );
  } else {
    skip("Toggle group", "no groups available");
  }
}

// ---------------------------------------------------------------------------
// SC-WHATSAPP: WhatsApp Integration Tests
// ---------------------------------------------------------------------------

async function testWhatsApp() {
  section("SC-SET-04: WhatsApp Integration");

  if (!authToken) {
    skip("WhatsApp tests", "no auth token");
    return;
  }

  // Connect
  const conn = await request("POST", "/api/whatsapp/connect", {
    token: authToken,
  });
  assert(
    conn.status === 200 || conn.status >= 400,
    "POST /api/whatsapp/connect returns 200 or error",
    `got ${conn.status}`
  );

  // Status
  const st = await request("GET", "/api/whatsapp/status", {
    token: authToken,
  });
  assert(st.status === 200, "GET /api/whatsapp/status returns 200", `got ${st.status}`);
  if (st.status === 200) {
    assert(st.data && st.data.status, "Status response has status field");
  }

  // QR
  const qr = await request("GET", "/api/whatsapp/qr", {
    token: authToken,
  });
  assert(
    qr.status === 200 || qr.status === 404,
    "GET /api/whatsapp/qr returns 200 or 404",
    `got ${qr.status}`
  );

  // Instances list
  const instances = await request("GET", "/api/whatsapp/instances", {
    token: authToken,
  });
  assert(
    instances.status === 200 || instances.status === 400,
    "GET /api/whatsapp/instances returns 200 or 400",
    `got ${instances.status}`
  );

  // Test alert (will fail if no alert number but should not crash)
  const testAlert = await request("POST", "/api/whatsapp/test-alert", {
    token: authToken,
  });
  assert(
    testAlert.status === 200 || testAlert.status === 400 || testAlert.status === 500,
    "POST /api/whatsapp/test-alert returns 200, 400, or 500",
    `got ${testAlert.status}`
  );

  // Connect existing (invalid instance)
  const connExisting = await request("POST", "/api/whatsapp/connect-existing", {
    token: authToken,
    body: { instance_name: "nonexistent-instance-xyz" },
  });
  assert(
    connExisting.status === 200 || connExisting.status >= 400,
    "POST /api/whatsapp/connect-existing with bad name handled",
    `got ${connExisting.status}`
  );
}

// ---------------------------------------------------------------------------
// SC-WH: Webhook Tests
// ---------------------------------------------------------------------------

async function testWebhook() {
  section("SC-WH: Hub & Spoke Webhook");

  const payload = {
    group_id: "120363001234567890@g.us",
    group_name: "Test Group",
    sender_phone: "+33612345678",
    sender_name: "Jean Test",
    content:
      "Bonjour, je recherche une assurance vie pour ma famille et une mutuelle santé complète",
    timestamp: Math.floor(Date.now() / 1000),
  };

  // SC-WH-06: No signature → 401
  const noSig = await request("POST", "/webhook/hub-spoke", { body: payload });
  assert(
    noSig.status === 401,
    "SC-WH-06: No signature returns 401",
    `got ${noSig.status}`
  );

  // SC-WH-06: Invalid signature → 401
  const badSig = await request("POST", "/webhook/hub-spoke", {
    body: payload,
    headers: {
      "X-Radar-Signature": "invalidsignature",
      "X-Radar-Timestamp": Math.floor(Date.now() / 1000).toString(),
    },
  });
  assert(
    badSig.status === 401,
    "SC-WH-06: Invalid signature returns 401",
    `got ${badSig.status}`
  );

  // SC-WH-05: Valid HMAC signature
  // Serialize body once and use the same string for both signing and sending
  const bodyString = JSON.stringify(payload);
  const timestamp = Math.floor(Date.now() / 1000).toString();
  const signature = crypto
    .createHmac("sha256", RADAR_WEBHOOK_SECRET)
    .update(bodyString + timestamp)
    .digest("hex");

  const good = await request("POST", "/webhook/hub-spoke", {
    rawBody: bodyString,
    headers: {
      "X-Radar-Signature": signature,
      "X-Radar-Timestamp": timestamp,
    },
  });
  assert(
    good.status === 200,
    "SC-WH-05: Valid HMAC returns 200",
    `got ${good.status}`
  );

  // SC-ROB-01: Empty message webhook
  const emptyPayload = {
    group_id: "120363001234567890@g.us",
    sender_phone: "+33600000000",
    content: "",
    timestamp: Math.floor(Date.now() / 1000),
  };
  const emptyBody = JSON.stringify(emptyPayload);
  const emptyTs = Math.floor(Date.now() / 1000).toString();
  const emptySig = crypto
    .createHmac("sha256", RADAR_WEBHOOK_SECRET)
    .update(emptyBody + emptyTs)
    .digest("hex");

  const emptyMsg = await request("POST", "/webhook/hub-spoke", {
    rawBody: emptyBody,
    headers: {
      "X-Radar-Signature": emptySig,
      "X-Radar-Timestamp": emptyTs,
    },
  });
  assert(
    emptyMsg.status === 200,
    "SC-ROB-01: Empty message webhook returns 200 (no crash)",
    `got ${emptyMsg.status}`
  );

  // SC-ROB-02: Very long message
  const longContent = "A".repeat(6000) + " assurance mutuelle prévoyance";
  const longPayload = {
    group_id: "120363001234567890@g.us",
    sender_phone: "+33611111111",
    sender_name: "Long Message User",
    content: longContent,
    timestamp: Math.floor(Date.now() / 1000),
  };
  const longBody = JSON.stringify(longPayload);
  const longTs = Math.floor(Date.now() / 1000).toString();
  const longSig = crypto
    .createHmac("sha256", RADAR_WEBHOOK_SECRET)
    .update(longBody + longTs)
    .digest("hex");

  const longMsg = await request("POST", "/webhook/hub-spoke", {
    rawBody: longBody,
    headers: {
      "X-Radar-Signature": longSig,
      "X-Radar-Timestamp": longTs,
    },
  });
  assert(
    longMsg.status === 200,
    "SC-ROB-02: Very long message (6000+ chars) returns 200",
    `got ${longMsg.status}`
  );

  // SC-ROB-03: Special characters and emojis
  const specialPayload = {
    group_id: "120363001234567890@g.us",
    sender_phone: "+33622222222",
    sender_name: "Test Émojis 🏠",
    content: "Bonjour, je recherche une assurance 🏠💰 <script>alert('xss')</script> café résumé 你好 مرحبا",
    timestamp: Math.floor(Date.now() / 1000),
  };
  const specialBody = JSON.stringify(specialPayload);
  const specialTs = Math.floor(Date.now() / 1000).toString();
  const specialSig = crypto
    .createHmac("sha256", RADAR_WEBHOOK_SECRET)
    .update(specialBody + specialTs)
    .digest("hex");

  const specialMsg = await request("POST", "/webhook/hub-spoke", {
    rawBody: specialBody,
    headers: {
      "X-Radar-Signature": specialSig,
      "X-Radar-Timestamp": specialTs,
    },
  });
  assert(
    specialMsg.status === 200,
    "SC-ROB-03: Special chars / emojis / HTML returns 200",
    `got ${specialMsg.status}`
  );

  // SC-ROB-08: Invalid JSON body
  const invalidJson = await request("POST", "/webhook/hub-spoke", {
    rawBody: "this is not json{{{",
    headers: {
      "Content-Type": "application/json",
      "X-Radar-Signature": "whatever",
      "X-Radar-Timestamp": Math.floor(Date.now() / 1000).toString(),
    },
  });
  assert(
    invalidJson.status >= 400,
    "SC-ROB-08: Invalid JSON returns 4xx",
    `got ${invalidJson.status}`
  );
}

// ---------------------------------------------------------------------------
// SC-OPP: Opportunities Tests
// ---------------------------------------------------------------------------

async function testOpportunities() {
  section("SC-OPP: Opportunities");

  if (!authToken) {
    skip("Opportunities tests", "no auth token");
    return;
  }

  // List opportunities
  const list = await request("GET", "/api/opportunities", {
    token: authToken,
  });
  assert(list.status === 200, "GET /api/opportunities returns 200", `got ${list.status}`);
  assert(Array.isArray(list.data), "Returns array");

  // Test search filter
  const search = await request("GET", "/api/opportunities?search=assurance", {
    token: authToken,
  });
  assert(search.status === 200, "GET /api/opportunities?search=assurance returns 200", `got ${search.status}`);

  // Test status filter
  const statusFilter = await request("GET", "/api/opportunities?status=new", {
    token: authToken,
  });
  assert(statusFilter.status === 200, "GET /api/opportunities?status=new returns 200", `got ${statusFilter.status}`);

  // Get single opportunity if any exist
  if (Array.isArray(list.data) && list.data.length > 0) {
    opportunityId = list.data[0].id;
    const single = await request("GET", `/api/opportunities/${opportunityId}`, {
      token: authToken,
    });
    assert(
      single.status === 200,
      "SC-OPP-02: GET single opportunity returns 200",
      `got ${single.status}`
    );

    // Verify opportunity structure
    if (single.status === 200) {
      const opp = single.data;
      assert(opp.score !== undefined, "Opportunity has score");
      assert(opp.status !== undefined, "Opportunity has status");
      assert(opp.message_content !== undefined || opp.content !== undefined, "Opportunity has message content");
    }

    // SC-OPP-03: Change status to "contacted"
    const patchStatus = await request("PATCH", `/api/opportunities/${opportunityId}/status`, {
      token: authToken,
      body: { status: "contacted" },
    });
    assert(
      patchStatus.status === 200,
      "SC-OPP-03: PATCH status to 'contacted' returns 200",
      `got ${patchStatus.status}`
    );

    // Change status to "won"
    const patchWon = await request("PATCH", `/api/opportunities/${opportunityId}/status`, {
      token: authToken,
      body: { status: "won" },
    });
    assert(
      patchWon.status === 200,
      "SC-OPP-03: PATCH status to 'won' returns 200",
      `got ${patchWon.status}`
    );

    // Change status to "not_relevant"
    const patchNR = await request("PATCH", `/api/opportunities/${opportunityId}/status`, {
      token: authToken,
      body: { status: "not_relevant" },
    });
    assert(
      patchNR.status === 200,
      "SC-OPP-03: PATCH status to 'not_relevant' returns 200",
      `got ${patchNR.status}`
    );

    // Invalid status
    const patchBad = await request("PATCH", `/api/opportunities/${opportunityId}/status`, {
      token: authToken,
      body: { status: "invalid_status" },
    });
    assert(
      patchBad.status === 400,
      "PATCH with invalid status returns 400",
      `got ${patchBad.status}`
    );
  } else {
    skip("Single opportunity & status changes", "no opportunities found");
  }

  // Non-existent opportunity
  const notFound = await request("GET", "/api/opportunities/00000000-0000-0000-0000-000000000000", {
    token: authToken,
  });
  assert(
    notFound.status === 404,
    "GET non-existent opportunity returns 404",
    `got ${notFound.status}`
  );
}

// ---------------------------------------------------------------------------
// SC-SCAN: Scan Tests
// ---------------------------------------------------------------------------

async function testScan() {
  section("SC-SCAN: Historical Scan");

  if (!authToken) {
    skip("Scan tests", "no auth token");
    return;
  }

  // SC-SCAN-05: Scan with empty group_ids should return 400 (validation)
  const emptyGroups = await request("POST", "/api/scan/historical", {
    token: authToken,
    body: { group_ids: [] },
  });
  assert(
    emptyGroups.status === 400 || emptyGroups.status === 202,
    "SC-SCAN-05: Empty group_ids returns 400 or 202",
    `got ${emptyGroups.status}`
  );

  // Get groups first to find valid IDs
  const groups = await request("GET", "/api/groups", { token: authToken });
  if (Array.isArray(groups.data) && groups.data.length > 0) {
    const groupId = groups.data[0].id;

    // Launch scan with valid group
    const scan = await request("POST", "/api/scan/historical", {
      token: authToken,
      body: { group_ids: [groupId] },
    });
    assert(
      scan.status === 202,
      "SC-SCAN-01: POST /api/scan/historical returns 202",
      `got ${scan.status}`
    );

    // Check scan status
    if (scan.status === 202 && scan.data && scan.data.scan_id) {
      const scanId = scan.data.scan_id;
      const scanStatus = await request("GET", `/api/scan/status/${scanId}`, {
        token: authToken,
      });
      assert(
        scanStatus.status === 200,
        "SC-SCAN-02: GET /api/scan/status returns 200",
        `got ${scanStatus.status}`
      );
      if (scanStatus.status === 200) {
        assert(
          scanStatus.data.status === "running" || scanStatus.data.status === "completed",
          "Scan status is running or completed"
        );
        assert(
          typeof scanStatus.data.progress === "number",
          "Scan has progress number"
        );
      }
    }
  } else {
    skip("Scan with valid group", "no groups available");
  }

  // Webhook stats
  const stats = await request("GET", "/api/webhook-stats", {
    token: authToken,
  });
  assert(
    stats.status === 200,
    "GET /api/webhook-stats returns 200",
    `got ${stats.status}`
  );
  if (stats.status === 200) {
    assert(typeof stats.data.total_today === "number", "webhook-stats has total_today");
  }
}

// ---------------------------------------------------------------------------
// SC-CONTACTS: Contacts Tests
// ---------------------------------------------------------------------------

async function testContacts() {
  section("SC-CONTACTS: Contact History");

  if (!authToken) {
    skip("Contacts tests", "no auth token");
    return;
  }

  // Known phone from webhook test
  const hist = await request("GET", "/api/contacts/+33612345678/history", {
    token: authToken,
  });
  assert(
    hist.status === 200 || hist.status === 404,
    "GET /api/contacts/+33612345678/history returns 200 or 404",
    `got ${hist.status}`
  );

  // Unknown phone
  const unknown = await request("GET", "/api/contacts/+00000000000/history", {
    token: authToken,
  });
  assert(
    unknown.status === 404,
    "GET unknown contact returns 404",
    `got ${unknown.status}`
  );
}

// ---------------------------------------------------------------------------
// SC-SLACK: Slack Integration Tests
// ---------------------------------------------------------------------------

async function testSlack() {
  section("SC-SET-06/07: Slack Integration");

  if (!authToken) {
    skip("Slack tests", "no auth token");
    return;
  }

  // Get Slack status
  const status = await request("GET", "/api/slack/status", {
    token: authToken,
  });
  assert(
    status.status === 200,
    "GET /api/slack/status returns 200",
    `got ${status.status}`
  );
  if (status.status === 200) {
    assert(typeof status.data.connected === "boolean", "Slack status has connected boolean");
  }

  // Get auth URL
  const authUrl = await request("GET", "/api/slack/auth-url", {
    token: authToken,
  });
  assert(
    authUrl.status === 200 || authUrl.status === 500,
    "GET /api/slack/auth-url returns 200 or 500 (if not configured)",
    `got ${authUrl.status}`
  );

  // List channels (will fail if not connected)
  const channels = await request("GET", "/api/slack/channels", {
    token: authToken,
  });
  assert(
    channels.status === 200 || channels.status === 400,
    "GET /api/slack/channels returns 200 or 400",
    `got ${channels.status}`
  );

  // Test alert (will fail without webhook URL)
  const testAlert = await request("POST", "/api/slack/test-alert", {
    token: authToken,
  });
  assert(
    testAlert.status === 200 || testAlert.status === 400,
    "POST /api/slack/test-alert returns 200 or 400",
    `got ${testAlert.status}`
  );
}

// ---------------------------------------------------------------------------
// SC-ADM: Admin Tests
// ---------------------------------------------------------------------------

async function testAdmin() {
  section("SC-ADM: Administration");

  // Non-admin access denied
  if (authToken) {
    const users = await request("GET", "/api/admin/users", {
      token: authToken,
    });
    assert(
      users.status === 403,
      "SC-ADM-02: Regular user cannot access admin (403)",
      `got ${users.status}`
    );
  }

  if (!adminToken) {
    skip("Admin tests (with admin token)", "no admin token");
    return;
  }

  // SC-ADM-05: List users
  const users = await request("GET", "/api/admin/users", {
    token: adminToken,
  });
  assert(users.status === 200, "SC-ADM-05: GET /api/admin/users returns 200", `got ${users.status}`);
  assert(Array.isArray(users.data), "Admin users is array");

  // SC-ADM-03/04: Get config
  const config = await request("GET", "/api/admin/config", {
    token: adminToken,
  });
  assert(
    config.status === 200,
    "GET /api/admin/config returns 200",
    `got ${config.status}`
  );

  // List hub-spoke tokens
  const tokens = await request("GET", "/api/admin/hub-spoke-tokens", {
    token: adminToken,
  });
  assert(
    tokens.status === 200,
    "GET /api/admin/hub-spoke-tokens returns 200",
    `got ${tokens.status}`
  );

  // Create hub-spoke token
  const createToken = await request("POST", "/api/admin/hub-spoke-tokens", {
    token: adminToken,
    body: { source_app: "test_app" },
  });
  assert(
    createToken.status === 201,
    "POST /api/admin/hub-spoke-tokens returns 201",
    `got ${createToken.status}`
  );

  // Block/unblock user (if test user exists)
  if (userId) {
    const block = await request("PATCH", `/api/admin/users/${userId}`, {
      token: adminToken,
      body: { is_active: false },
    });
    assert(
      block.status === 200,
      "SC-ADM-05: Block user returns 200",
      `got ${block.status}`
    );

    // Verify blocked user cannot login
    const blockedLogin = await request("POST", "/auth/login", {
      body: { email: TEST_EMAIL, password: "Test1234!" },
    });
    assert(
      blockedLogin.status === 401 || blockedLogin.status === 403,
      "Blocked user cannot login",
      `got ${blockedLogin.status}`
    );

    // Unblock user
    const unblock = await request("PATCH", `/api/admin/users/${userId}`, {
      token: adminToken,
      body: { is_active: true },
    });
    assert(
      unblock.status === 200,
      "Unblock user returns 200",
      `got ${unblock.status}`
    );
  }
}

// ---------------------------------------------------------------------------
// SC-ROB: Robustness Tests
// ---------------------------------------------------------------------------

async function testRobustness() {
  section("SC-ROB: Robustness & Edge Cases");

  if (!authToken) {
    skip("Robustness tests", "no auth token");
    return;
  }

  // SC-ROB-15: Duplicate webhook (same message twice)
  const payload = {
    group_id: "120363001234567890@g.us",
    sender_phone: "+33699999999",
    sender_name: "Duplicate Test",
    content: "Message dupliqué pour test assurance mutuelle",
    timestamp: Math.floor(Date.now() / 1000),
  };
  const bodyStr = JSON.stringify(payload);
  const ts = Math.floor(Date.now() / 1000).toString();
  const sig = crypto
    .createHmac("sha256", RADAR_WEBHOOK_SECRET)
    .update(bodyStr + ts)
    .digest("hex");

  const first = await request("POST", "/webhook/hub-spoke", {
    rawBody: bodyStr,
    headers: { "X-Radar-Signature": sig, "X-Radar-Timestamp": ts },
  });
  assert(first.status === 200, "SC-ROB-15: First webhook returns 200", `got ${first.status}`);

  // Send same message again (may be within same second)
  const second = await request("POST", "/webhook/hub-spoke", {
    rawBody: bodyStr,
    headers: { "X-Radar-Signature": sig, "X-Radar-Timestamp": ts },
  });
  assert(second.status === 200, "SC-ROB-15: Duplicate webhook returns 200 (no crash)", `got ${second.status}`);

  // SC-ROB-16: Profile without keywords still works
  const noKeywords = await request("PUT", "/api/profile", {
    token: authToken,
    body: { keywords: [] },
  });
  assert(noKeywords.status === 200, "SC-ROB-16: Empty keywords returns 200", `got ${noKeywords.status}`);

  // Restore keywords
  await request("PUT", "/api/profile", {
    token: authToken,
    body: { keywords: ["assurance", "mutuelle", "prévoyance"] },
  });

  // Test rapid sequential API calls (SC-ROB-13)
  const rapidCalls = await Promise.all([
    request("GET", "/api/profile", { token: authToken }),
    request("GET", "/api/groups", { token: authToken }),
    request("GET", "/api/opportunities", { token: authToken }),
    request("GET", "/api/whatsapp/status", { token: authToken }),
    request("GET", "/api/slack/status", { token: authToken }),
    request("GET", "/api/webhook-stats", { token: authToken }),
  ]);
  const allOk = rapidCalls.every((r) => r.status === 200);
  assert(allOk, "SC-ROB-13: 6 parallel API calls all return 200", `statuses: [${rapidCalls.map(r => r.status).join(',')}]`);
}

// ---------------------------------------------------------------------------
// Runner
// ---------------------------------------------------------------------------

async function main() {
  console.log(chalk.bold.white(`\n🔬 Radar API Test Suite — Extended`));
  console.log(chalk.gray(`Target: ${API_URL}`));
  console.log(chalk.gray(`Admin: ${ADMIN_EMAIL}`));
  console.log(chalk.gray(`Webhook secret: ${RADAR_WEBHOOK_SECRET ? "(set)" : "(not set)"}`));
  console.log();

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
    await testSlack();
    await testAdmin();
    await testRobustness();
  } catch (err) {
    failed++;
    console.log(chalk.red(`\n  FATAL ERROR: ${err.message}`));
    if (err.cause) console.log(chalk.red(`  Cause: ${err.cause.message || err.cause}`));
    console.error(err);
  }

  const total = passed + failed;
  console.log();
  console.log(chalk.bold.white("══════════════════════════════════"));
  console.log(chalk.bold.white("  Summary"));
  console.log(chalk.bold.white("══════════════════════════════════"));
  console.log(
    chalk.green(`  ${passed} passed`) +
      ", " +
      chalk.red(`${failed} failed`) +
      ", " +
      chalk.yellow(`${skipped} skipped`) +
      `, ${total} total`
  );
  console.log();

  process.exit(failed > 0 ? 1 : 0);
}

main();
