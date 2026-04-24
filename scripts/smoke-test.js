const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawn } = require("child_process");

const TEST_PORT = 3350;
const BASE_URL = `http://localhost:${TEST_PORT}`;

run().catch((error) => {
  process.stderr.write(`${error.stack || error.message}\n`);
  process.exit(1);
});

async function run() {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "geo-mate-smoke-"));
  const env = {
    ...process.env,
    PORT: String(TEST_PORT),
    NODE_ENV: "test",
    SHOW_DEV_CODES: "false",
    DATA_DIR: dataDir
  };

  const server = spawn(process.execPath, ["src/server.js"], {
    cwd: process.cwd(),
    env,
    stdio: ["ignore", "pipe", "pipe"]
  });

  let stderrLog = "";
  server.stderr.on("data", (chunk) => {
    stderrLog += String(chunk || "");
  });

  try {
    await waitForHealth(20000);

    await assertStatus("/", 200);
    await assertStatus("/auth", 200);
    await assertStatus("/app", 200);
    await assertStatus("/health", 200);

    const suffix = Date.now().toString().slice(-6);
    const userA = {
      name: `Smoke A ${suffix}`,
      email: `smoke.a.${suffix}@example.com`,
      phone: `+254711${suffix}`,
      password: "StrongPass1",
      birthDate: "1998-03-01",
      gender: "male",
      lookingForGenders: ["female"],
      interests: ["travel", "music"],
      relationshipIntent: "long_term",
      photos: ["/assets/geo-mate-logo.png"],
      minAgePreferred: 21,
      maxAgePreferred: 35,
      maxDistanceKm: 40
    };
    const userB = {
      name: `Smoke B ${suffix}`,
      email: `smoke.b.${suffix}@example.com`,
      phone: `+254722${suffix}`,
      password: "StrongPass1",
      birthDate: "1997-06-12",
      gender: "female",
      lookingForGenders: ["male"],
      interests: ["travel", "coffee"],
      relationshipIntent: "long_term",
      photos: ["/assets/geo-mate-logo.png"],
      minAgePreferred: 21,
      maxAgePreferred: 35,
      maxDistanceKm: 40
    };

    const regA = await jsonRequest("/auth/register", "POST", userA);
    const regB = await jsonRequest("/auth/register", "POST", userB);
    expect(regA.devCodes?.emailCode, "User A email dev code missing");
    expect(regA.devCodes?.phoneCode, "User A phone dev code missing");
    expect(regB.devCodes?.emailCode, "User B email dev code missing");
    expect(regB.devCodes?.phoneCode, "User B phone dev code missing");

    await jsonRequest("/auth/verify-email", "POST", {
      userId: regA.user.id,
      code: regA.devCodes.emailCode
    });
    await jsonRequest("/auth/verify-phone", "POST", {
      userId: regA.user.id,
      code: regA.devCodes.phoneCode
    });
    await jsonRequest("/auth/verify-email", "POST", {
      userId: regB.user.id,
      code: regB.devCodes.emailCode
    });
    await jsonRequest("/auth/verify-phone", "POST", {
      userId: regB.user.id,
      code: regB.devCodes.phoneCode
    });

    const loginA = await jsonRequest("/auth/login", "POST", {
      identifier: userA.email,
      password: userA.password
    });
    const tokenA = loginA.accessToken;
    expect(tokenA, "Access token missing");

    const recs = await jsonRequest("/recommendations", "POST", { limit: 5, cursor: 0 }, tokenA);
    expect(Array.isArray(recs.items), "Recommendations response malformed");

    process.stdout.write("Smoke test passed.\n");
  } finally {
    server.kill("SIGTERM");
    await waitForServerExit(server);
    if (stderrLog.trim()) {
      process.stdout.write(stderrLog);
    }
    fs.rmSync(dataDir, { recursive: true, force: true });
  }
}

async function waitForHealth(timeoutMs) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const response = await fetch(`${BASE_URL}/health`);
      if (response.ok) return;
    } catch (error) {
      // Retry until timeout.
    }
    await sleep(400);
  }
  throw new Error("Server did not become healthy in time.");
}

async function assertStatus(route, expected) {
  const response = await fetch(`${BASE_URL}${route}`);
  if (response.status !== expected) {
    throw new Error(`Expected ${route} status ${expected}, got ${response.status}`);
  }
}

async function jsonRequest(route, method, body, accessToken) {
  const response = await fetch(`${BASE_URL}${route}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {})
    },
    body: JSON.stringify(body || {})
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(`${route} failed (${response.status}): ${data.error || "Unknown error"}`);
  }
  return data;
}

function expect(condition, message) {
  if (!condition) throw new Error(message);
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function waitForServerExit(server) {
  return new Promise((resolve) => {
    const timeout = setTimeout(() => {
      server.kill("SIGKILL");
      resolve();
    }, 3000);

    server.once("exit", () => {
      clearTimeout(timeout);
      resolve();
    });
  });
}
