const express = require("express");
const crypto = require("crypto");
const http = require("http");
const https = require("https");
const { URL } = require("url");

const app = express();
const PORT = process.env.PORT || 3001;
const RADAR_WEBHOOK_URL =
  process.env.RADAR_WEBHOOK_URL || "http://localhost:8000/webhook/hub-spoke";
const RADAR_WEBHOOK_SECRET = process.env.RADAR_WEBHOOK_SECRET;

// ---------------------------------------------------------------------------
// Middleware
// ---------------------------------------------------------------------------

app.use(express.json());

// Request logger
app.use((req, _res, next) => {
  const ts = new Date().toISOString();
  console.log(`[${ts}] ${req.method} ${req.path}`);
  if (req.body && Object.keys(req.body).length > 0) {
    console.log("  Body:", JSON.stringify(req.body, null, 2));
  }
  next();
});

// API-key guard (any non-empty value accepted)
app.use((req, res, next) => {
  // Skip auth check for the simulate helper endpoint
  if (req.path.startsWith("/simulate")) return next();

  const apikey = req.headers.apikey;
  if (!apikey) {
    return res.status(401).json({ error: "apikey header is required" });
  }
  next();
});

// ---------------------------------------------------------------------------
// Fake data
// ---------------------------------------------------------------------------

const FAKE_GROUPS = [
  {
    id: "120363001234567890@g.us",
    subject: "Tech Founders Paris",
    size: 234,
  },
  {
    id: "120363009876543210@g.us",
    subject: "Growth Hackers France",
    size: 1200,
  },
  {
    id: "120363005555555555@g.us",
    subject: "Freelance Dev FR",
    size: 89,
  },
];

// ---------------------------------------------------------------------------
// Evolution API mock endpoints
// ---------------------------------------------------------------------------

// Create instance
app.post("/instance/create", (req, res) => {
  res.json({
    instance: {
      instanceName: req.body.instanceName,
      status: "created",
    },
  });
});

// Connect (QR code)
app.get("/instance/connect/:instanceName", (req, res) => {
  res.json({
    base64: "data:image/png;base64,iVBOR...FAKE_QR_CODE",
    code: "2@ABC123",
  });
});

// Connection state
app.get("/instance/connectionState/:instanceName", (req, res) => {
  res.json({ state: "open" });
});

// Fetch all instances
app.get("/instance/fetchInstances", (_req, res) => {
  res.json([{ instanceName: "test-instance", state: "open" }]);
});

// Fetch all groups for an instance
app.get("/group/fetchAllGroups/:instanceName", (req, res) => {
  res.json(FAKE_GROUPS);
});

// Send text message
app.post("/message/sendText/:instanceName", (req, res) => {
  console.log(
    `  -> Message sent via instance "${req.params.instanceName}":`,
    req.body
  );
  res.json({
    key: { id: "mock_msg_" + Date.now().toString(36) },
    status: "SENT",
  });
});

// Delete instance
app.delete("/instance/delete/:instanceName", (req, res) => {
  res.json({ status: "deleted" });
});

// ---------------------------------------------------------------------------
// Simulate helper — generates a fake group message and forwards it to Radar
// ---------------------------------------------------------------------------

app.post("/simulate/group-message", async (req, res) => {
  if (!RADAR_WEBHOOK_SECRET) {
    return res.status(500).json({
      error:
        "RADAR_WEBHOOK_SECRET env var is required to sign simulated webhooks",
    });
  }

  const { group_index = 0, content = "Hello from mock!", sender_name = "Jean Dupont" } = req.body;
  const group = FAKE_GROUPS[group_index] || FAKE_GROUPS[0];

  // Build an Evolution-style webhook payload
  const payload = {
    event: "messages.upsert",
    instance: "test-instance",
    data: {
      key: {
        remoteJid: group.id,
        fromMe: false,
        id: "MOCK_" + crypto.randomBytes(8).toString("hex").toUpperCase(),
        participant: "33612345678@s.whatsapp.net",
      },
      pushName: sender_name,
      message: {
        conversation: content,
      },
      messageType: "conversation",
      messageTimestamp: Math.floor(Date.now() / 1000),
    },
  };

  const body = JSON.stringify(payload);

  // HMAC-SHA256 signature
  const signature = crypto
    .createHmac("sha256", RADAR_WEBHOOK_SECRET)
    .update(body)
    .digest("hex");

  // Forward to Radar webhook
  try {
    const targetUrl = new URL(RADAR_WEBHOOK_URL);
    const transport = targetUrl.protocol === "https:" ? https : http;

    const result = await new Promise((resolve, reject) => {
      const options = {
        method: "POST",
        hostname: targetUrl.hostname,
        port: targetUrl.port,
        path: targetUrl.pathname + targetUrl.search,
        headers: {
          "Content-Type": "application/json",
          "Content-Length": Buffer.byteLength(body),
          "x-hub-signature-256": `sha256=${signature}`,
        },
      };

      const fwdReq = transport.request(options, (fwdRes) => {
        let data = "";
        fwdRes.on("data", (chunk) => (data += chunk));
        fwdRes.on("end", () =>
          resolve({ status: fwdRes.statusCode, body: data })
        );
      });

      fwdReq.on("error", reject);
      fwdReq.write(body);
      fwdReq.end();
    });

    console.log(
      `  -> Simulated message forwarded to ${RADAR_WEBHOOK_URL} — status ${result.status}`
    );

    res.json({
      ok: true,
      forwarded_to: RADAR_WEBHOOK_URL,
      webhook_status: result.status,
      webhook_response: result.body,
      payload,
    });
  } catch (err) {
    console.error("  -> Failed to forward simulated message:", err.message);
    res.status(502).json({
      ok: false,
      error: `Failed to reach ${RADAR_WEBHOOK_URL}: ${err.message}`,
    });
  }
});

// ---------------------------------------------------------------------------
// Start
// ---------------------------------------------------------------------------

app.listen(PORT, () => {
  console.log(`Mock Evolution API running on http://localhost:${PORT}`);
  console.log(`  RADAR_WEBHOOK_URL  = ${RADAR_WEBHOOK_URL}`);
  console.log(
    `  RADAR_WEBHOOK_SECRET = ${RADAR_WEBHOOK_SECRET ? "(set)" : "(NOT SET — /simulate will fail)"}`
  );
});
