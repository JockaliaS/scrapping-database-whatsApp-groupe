#!/usr/bin/env node

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import crypto from "node:crypto";
import WebSocket from "ws";

const RADAR_API_URL = process.env.RADAR_API_URL || "http://localhost:8000";
const RADAR_WEBHOOK_SECRET = process.env.RADAR_WEBHOOK_SECRET || "";
const APP_ENV = process.env.APP_ENV || "development";
const RADAR_TEST_JWT = process.env.RADAR_TEST_JWT || "";

async function httpRequest(method, path, { body, headers = {}, timeout = 10000 } = {}) {
  const url = `${RADAR_API_URL}${path}`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);

  try {
    const opts = {
      method,
      headers: {
        "Content-Type": "application/json",
        ...headers,
      },
      signal: controller.signal,
    };
    if (body !== undefined) {
      opts.body = JSON.stringify(body);
    }
    const res = await fetch(url, opts);
    const text = await res.text();
    let data;
    try {
      data = JSON.parse(text);
    } catch {
      data = text;
    }
    return { status: res.status, ok: res.ok, data };
  } finally {
    clearTimeout(timer);
  }
}

function authHeaders() {
  if (!RADAR_TEST_JWT) {
    throw new Error("RADAR_TEST_JWT environment variable is required for authenticated endpoints");
  }
  return { Authorization: `Bearer ${RADAR_TEST_JWT}` };
}

const server = new McpServer({
  name: "radar-mcp-server",
  version: "1.0.0",
});

// ---------- radar_health ----------
server.tool(
  "radar_health",
  "Check the Radar backend health endpoint (GET /health)",
  {},
  async () => {
    try {
      const { status, ok, data } = await httpRequest("GET", "/health");
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(
              { healthy: ok, http_status: status, response: data },
              null,
              2
            ),
          },
        ],
      };
    } catch (err) {
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(
              { healthy: false, error: err.message },
              null,
              2
            ),
          },
        ],
        isError: true,
      };
    }
  }
);

// ---------- radar_send_test_message ----------
server.tool(
  "radar_send_test_message",
  "Send a fake WhatsApp group message to the webhook endpoint (POST /webhook/hub-spoke) with valid HMAC-SHA256 signature",
  {
    group_name: z.string().default("Test Group").describe("Name of the fake WhatsApp group"),
    sender_name: z.string().default("Test User").describe("Name of the message sender"),
    message: z.string().default("Looking for a React developer for a 3-month freelance project, budget 500/day").describe("Message body"),
  },
  async ({ group_name, sender_name, message }) => {
    if (!RADAR_WEBHOOK_SECRET) {
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({ error: "RADAR_WEBHOOK_SECRET is required" }, null, 2),
          },
        ],
        isError: true,
      };
    }

    const payload = {
      event: "messages.upsert",
      instance: "radar-test",
      data: {
        key: {
          remoteJid: `${Date.now()}@g.us`,
          fromMe: false,
          id: crypto.randomUUID(),
          participant: `336${Math.floor(10000000 + Math.random() * 90000000)}@s.whatsapp.net`,
        },
        pushName: sender_name,
        message: {
          conversation: message,
        },
        messageTimestamp: Math.floor(Date.now() / 1000),
        groupMetadata: {
          id: `${Date.now()}@g.us`,
          subject: group_name,
          participants: [],
        },
      },
    };

    const payloadString = JSON.stringify(payload);
    const timestamp = Math.floor(Date.now() / 1000).toString();
    const signature = crypto
      .createHmac("sha256", RADAR_WEBHOOK_SECRET)
      .update(payloadString + timestamp)
      .digest("hex");

    try {
      const { status, ok, data } = await httpRequest("POST", "/webhook/hub-spoke", {
        body: payload,
        headers: {
          "x-webhook-signature": signature,
          "x-webhook-timestamp": timestamp,
        },
      });

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(
              {
                sent: ok,
                http_status: status,
                response: data,
                payload_summary: {
                  group: group_name,
                  sender: sender_name,
                  message_preview: message.substring(0, 80),
                },
              },
              null,
              2
            ),
          },
        ],
      };
    } catch (err) {
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({ error: err.message }, null, 2),
          },
        ],
        isError: true,
      };
    }
  }
);

// ---------- radar_get_opportunities ----------
server.tool(
  "radar_get_opportunities",
  "Fetch opportunities from Radar (GET /api/opportunities) with optional filters",
  {
    status: z.enum(["new", "contacted", "qualified", "converted", "archived"]).optional().describe("Filter by opportunity status"),
    min_score: z.number().min(0).max(100).optional().describe("Minimum relevance score"),
    limit: z.number().min(1).max(100).default(20).describe("Number of results to return"),
    offset: z.number().min(0).default(0).describe("Pagination offset"),
  },
  async ({ status, min_score, limit, offset }) => {
    try {
      const params = new URLSearchParams();
      if (status) params.set("status", status);
      if (min_score !== undefined) params.set("min_score", min_score.toString());
      params.set("limit", limit.toString());
      params.set("offset", offset.toString());

      const queryString = params.toString();
      const path = `/api/opportunities${queryString ? `?${queryString}` : ""}`;

      const { status: httpStatus, ok, data } = await httpRequest("GET", path, {
        headers: authHeaders(),
      });

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(
              {
                success: ok,
                http_status: httpStatus,
                filters: { status, min_score, limit, offset },
                data,
              },
              null,
              2
            ),
          },
        ],
      };
    } catch (err) {
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({ error: err.message }, null, 2),
          },
        ],
        isError: true,
      };
    }
  }
);

// ---------- radar_create_test_profile ----------
server.tool(
  "radar_create_test_profile",
  "Register a test user (POST /auth/register) and set up their analyst profile with keywords (PUT /api/profile)",
  {
    email: z.string().email().default("test@radar-test.local").describe("Email for the test user"),
    password: z.string().min(8).default("TestPass123!").describe("Password for the test user"),
    name: z.string().default("Test Analyst").describe("Display name"),
    keywords: z
      .array(z.string())
      .default(["react", "développeur", "freelance", "CTO", "fullstack", "startup"])
      .describe("Keywords the analyst tracks for opportunity matching"),
  },
  async ({ email, password, name, keywords }) => {
    try {
      // Step 1: Register
      const registerRes = await httpRequest("POST", "/auth/register", {
        body: { email, password, name },
      });

      if (!registerRes.ok && registerRes.status !== 409) {
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(
                {
                  step: "register",
                  success: false,
                  http_status: registerRes.status,
                  error: registerRes.data,
                },
                null,
                2
              ),
            },
          ],
          isError: true,
        };
      }

      // Extract token from register response, or use existing JWT
      const token =
        registerRes.data?.token ||
        registerRes.data?.access_token ||
        RADAR_TEST_JWT;

      if (!token) {
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(
                {
                  step: "register",
                  success: true,
                  note: "User registered/exists but no token returned and RADAR_TEST_JWT not set. Cannot update profile.",
                  register_response: registerRes.data,
                },
                null,
                2
              ),
            },
          ],
        };
      }

      // Step 2: Update profile with keywords
      const profileRes = await httpRequest("PUT", "/api/profile", {
        body: {
          name,
          keywords,
          notification_preferences: {
            email: true,
            websocket: true,
            min_score_threshold: 60,
          },
        },
        headers: { Authorization: `Bearer ${token}` },
      });

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(
              {
                register: {
                  success: registerRes.ok || registerRes.status === 409,
                  http_status: registerRes.status,
                  already_existed: registerRes.status === 409,
                },
                profile: {
                  success: profileRes.ok,
                  http_status: profileRes.status,
                  data: profileRes.data,
                },
                user: { email, name, keywords },
              },
              null,
              2
            ),
          },
        ],
      };
    } catch (err) {
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({ error: err.message }, null, 2),
          },
        ],
        isError: true,
      };
    }
  }
);

// ---------- radar_scan_groups ----------
server.tool(
  "radar_scan_groups",
  "Trigger a historical scan of WhatsApp groups (POST /api/scan/historical)",
  {
    group_ids: z
      .array(z.string())
      .optional()
      .describe("Specific group IDs to scan. If omitted, scans all connected groups."),
    days_back: z.number().min(1).max(90).default(7).describe("How many days back to scan"),
  },
  async ({ group_ids, days_back }) => {
    try {
      const body = { days_back };
      if (group_ids && group_ids.length > 0) {
        body.group_ids = group_ids;
      }

      const { status, ok, data } = await httpRequest("POST", "/api/scan/historical", {
        body,
        headers: authHeaders(),
        timeout: 30000,
      });

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(
              {
                success: ok,
                http_status: status,
                request: { group_ids: group_ids || "all", days_back },
                response: data,
              },
              null,
              2
            ),
          },
        ],
      };
    } catch (err) {
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({ error: err.message }, null, 2),
          },
        ],
        isError: true,
      };
    }
  }
);

// ---------- radar_check_websocket ----------
server.tool(
  "radar_check_websocket",
  "Verify the WebSocket endpoint (/ws) is alive by attempting a connection",
  {},
  async () => {
    const wsUrl = RADAR_API_URL.replace(/^http/, "ws") + "/ws";

    return new Promise((resolve) => {
      const timeout = setTimeout(() => {
        ws.terminate();
        resolve({
          content: [
            {
              type: "text",
              text: JSON.stringify(
                { alive: false, url: wsUrl, error: "Connection timed out after 5s" },
                null,
                2
              ),
            },
          ],
          isError: true,
        });
      }, 5000);

      let ws;
      try {
        const headers = {};
        if (RADAR_TEST_JWT) {
          headers.Authorization = `Bearer ${RADAR_TEST_JWT}`;
        }
        ws = new WebSocket(wsUrl, { headers });
      } catch (err) {
        clearTimeout(timeout);
        resolve({
          content: [
            {
              type: "text",
              text: JSON.stringify(
                { alive: false, url: wsUrl, error: err.message },
                null,
                2
              ),
            },
          ],
          isError: true,
        });
        return;
      }

      ws.on("open", () => {
        clearTimeout(timeout);
        ws.close();
        resolve({
          content: [
            {
              type: "text",
              text: JSON.stringify(
                { alive: true, url: wsUrl, message: "WebSocket connection established successfully" },
                null,
                2
              ),
            },
          ],
        });
      });

      ws.on("error", (err) => {
        clearTimeout(timeout);
        ws.terminate();
        resolve({
          content: [
            {
              type: "text",
              text: JSON.stringify(
                { alive: false, url: wsUrl, error: err.message },
                null,
                2
              ),
            },
          ],
          isError: true,
        });
      });
    });
  }
);

// ---------- radar_reset_test_data ----------
server.tool(
  "radar_reset_test_data",
  "Delete test data from the database. Blocked in production environment.",
  {
    confirm: z.boolean().describe("Must be true to confirm deletion"),
  },
  async ({ confirm }) => {
    if (APP_ENV === "production") {
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(
              {
                blocked: true,
                reason: "Cannot reset test data in production environment (APP_ENV=production)",
              },
              null,
              2
            ),
          },
        ],
        isError: true,
      };
    }

    if (!confirm) {
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(
              {
                blocked: true,
                reason: "Set confirm=true to proceed with test data deletion",
              },
              null,
              2
            ),
          },
        ],
      };
    }

    try {
      // Delete test data through the API's admin reset endpoint
      const { status, ok, data } = await httpRequest("DELETE", "/api/admin/test-data", {
        headers: authHeaders(),
        timeout: 15000,
      });

      // If the backend has no dedicated endpoint, attempt SQL-based cleanup
      if (status === 404) {
        const sqlRes = await httpRequest("POST", "/api/admin/execute-sql", {
          body: {
            queries: [
              "DELETE FROM opportunities WHERE source_message_id IN (SELECT id FROM messages WHERE group_jid LIKE '%@g.us' AND created_at > NOW() - INTERVAL '24 hours')",
              "DELETE FROM messages WHERE group_jid LIKE '%@g.us' AND created_at > NOW() - INTERVAL '24 hours'",
              "DELETE FROM users WHERE email LIKE '%@radar-test.local'",
            ],
          },
          headers: authHeaders(),
          timeout: 15000,
        });

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(
                {
                  success: sqlRes.ok,
                  method: "sql-cleanup",
                  http_status: sqlRes.status,
                  app_env: APP_ENV,
                  response: sqlRes.data,
                },
                null,
                2
              ),
            },
          ],
        };
      }

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(
              {
                success: ok,
                method: "admin-endpoint",
                http_status: status,
                app_env: APP_ENV,
                response: data,
              },
              null,
              2
            ),
          },
        ],
      };
    } catch (err) {
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({ error: err.message }, null, 2),
          },
        ],
        isError: true,
      };
    }
  }
);

// ---------- Start server ----------
async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((err) => {
  console.error("Fatal error starting MCP server:", err);
  process.exit(1);
});
