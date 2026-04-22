const fs = require("fs");
const http = require("http");
const path = require("path");
const { DatingStore } = require("./store");
const { rankCandidates } = require("./matchingEngine");
const { AuthStore, AuthError } = require("./authStore");
const { ChatStore } = require("./chatStore");
const {
  sendVerificationEmail,
  sendVerificationSms
} = require("./verificationDelivery");

const DATA_DIR = path.resolve(process.env.DATA_DIR || path.join(__dirname, "..", "data"));
const store = new DatingStore();
const authStore = new AuthStore({
  filePath: path.join(DATA_DIR, "auth-db.json")
});
const chatStore = new ChatStore({
  filePath: path.join(DATA_DIR, "messages.json")
});
const rateLimiter = new Map();

seedDiscoveryProfiles(store);
for (const user of authStore.listUsers()) {
  syncAuthUserToDatingProfile(user.id);
}

const PORT = process.env.PORT || 3000;
const PUBLIC_DIR = path.join(__dirname, "..", "public");
const WAITLIST_FILE = path.join(DATA_DIR, "waitlist.json");

const server = http.createServer(async (req, res) => {
  try {
    const requestUrl = new URL(req.url, `http://${req.headers.host || "localhost"}`);
    const pathname = decodeURIComponent(requestUrl.pathname);

    if (req.method === "GET" && pathname === "/health") {
      return writeJson(res, 200, { ok: true, service: "velocity-dating-engine" });
    }

    if (req.method === "POST" && pathname === "/waitlist") {
      enforceRateLimit(req, "waitlist", 20, 10 * 60 * 1000);
      const body = await readJson(req);
      const name = String(body.name || "").trim();
      const email = String(body.email || "").trim().toLowerCase();

      if (!name) {
        throw new AuthError("WAITLIST_NAME_REQUIRED", "Name is required.");
      }
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        throw new AuthError("WAITLIST_EMAIL_INVALID", "Valid email is required.");
      }

      const entries = loadWaitlist();
      const duplicate = entries.find((entry) => entry.email === email);
      if (duplicate) {
        return writeJson(res, 200, {
          ok: true,
          message: "You are already on the waitlist."
        });
      }

      entries.push({
        id: cryptoRandomId(),
        name,
        email,
        createdAt: new Date().toISOString()
      });
      saveWaitlist(entries);

      return writeJson(res, 201, {
        ok: true,
        message: "Waitlist signup successful."
      });
    }

    if (req.method === "GET" && tryServeStatic(pathname, res)) {
      return;
    }

    if (req.method === "POST" && pathname === "/auth/register") {
      enforceRateLimit(req, "auth/register", 12, 10 * 60 * 1000);
      const body = await readJson(req);
      const created = authStore.createUser(body);
      syncAuthUserToDatingProfile(created.userId);
      const delivery = await deliverCodes({
        email: created.user.email,
        phone: created.user.phone,
        emailCode: created.emailCode,
        phoneCode: created.phoneCode
      });

      const response = {
        ok: true,
        user: created.user,
        requiresVerification: {
          email: true,
          phone: true
        },
        delivery
      };

      if (shouldExposeDevCodes(delivery)) {
        response.devCodes = {
          emailCode: created.emailCode,
          phoneCode: created.phoneCode
        };
      }

      process.stdout.write(
        `New user ${created.user.email} created. Email code: ${created.emailCode}, phone code: ${created.phoneCode}\n`
      );
      return writeJson(res, 201, response);
    }

    if (req.method === "POST" && pathname === "/auth/send-email-code") {
      enforceRateLimit(req, "auth/send-email-code", 25, 10 * 60 * 1000);
      const body = await readJson(req);
      const user = resolveTargetUser(body);
      const code = authStore.generateEmailCode(user.id);
      const delivery = await sendVerificationEmail({
        toEmail: user.email,
        code
      });
      if (!delivery.delivered) {
        process.stdout.write(`Email verification delivery failed for ${user.email}: ${delivery.reason}\n`);
      }

      return writeJson(res, 200, {
        ok: true,
        message: "Email verification code sent.",
        delivery,
        ...(shouldExposeDevCode(delivery) ? { devCode: code } : {})
      });
    }

    if (req.method === "POST" && pathname === "/auth/send-phone-code") {
      enforceRateLimit(req, "auth/send-phone-code", 25, 10 * 60 * 1000);
      const body = await readJson(req);
      const user = resolveTargetUser(body);
      const code = authStore.generatePhoneCode(user.id);
      const delivery = await sendVerificationSms({
        toPhone: user.phone,
        code
      });
      if (!delivery.delivered) {
        process.stdout.write(`Phone OTP delivery failed for ${user.phone}: ${delivery.reason}\n`);
      }

      return writeJson(res, 200, {
        ok: true,
        message: "Phone OTP sent.",
        delivery,
        ...(shouldExposeDevCode(delivery) ? { devCode: code } : {})
      });
    }

    if (req.method === "POST" && pathname === "/auth/verify-email") {
      enforceRateLimit(req, "auth/verify-email", 40, 10 * 60 * 1000);
      const body = await readJson(req);
      const user = authStore.verifyEmailCode(String(body.userId || ""), String(body.code || ""));
      syncAuthUserToDatingProfile(user.id);
      return writeJson(res, 200, { ok: true, user });
    }

    if (req.method === "POST" && pathname === "/auth/verify-phone") {
      enforceRateLimit(req, "auth/verify-phone", 40, 10 * 60 * 1000);
      const body = await readJson(req);
      const user = authStore.verifyPhoneCode(String(body.userId || ""), String(body.code || ""));
      syncAuthUserToDatingProfile(user.id);
      return writeJson(res, 200, { ok: true, user });
    }

    if (req.method === "POST" && pathname === "/auth/login") {
      enforceRateLimit(req, "auth/login", 45, 10 * 60 * 1000);
      const body = await readJson(req);
      const session = authStore.login({
        identifier: String(body.identifier || ""),
        password: String(body.password || "")
      });
      syncAuthUserToDatingProfile(session.user.id);
      return writeJson(res, 200, {
        ok: true,
        tokenType: "Bearer",
        ...session
      });
    }

    if (req.method === "POST" && pathname === "/auth/refresh") {
      enforceRateLimit(req, "auth/refresh", 80, 10 * 60 * 1000);
      const body = await readJson(req);
      const session = authStore.refreshSession(String(body.refreshToken || ""));
      syncAuthUserToDatingProfile(session.user.id);
      return writeJson(res, 200, {
        ok: true,
        tokenType: "Bearer",
        ...session
      });
    }

    if (req.method === "POST" && pathname === "/auth/logout") {
      const body = await readJson(req);
      authStore.logout(String(body.refreshToken || ""));
      return writeJson(res, 200, { ok: true });
    }

    if (req.method === "GET" && pathname === "/auth/me") {
      const user = requireAuthUser(req);
      syncAuthUserToDatingProfile(user.id);
      return writeJson(res, 200, {
        ok: true,
        user: authStore.toSafeUser(user)
      });
    }

    if (req.method === "POST" && pathname === "/auth/profile") {
      const authUser = requireAuthUser(req);
      const body = await readJson(req);
      const user = authStore.updateProfile(authUser.id, body);
      syncAuthUserToDatingProfile(user.id);
      return writeJson(res, 200, { ok: true, user });
    }

    if (req.method === "POST" && pathname === "/recommendations") {
      const authUser = requireAuthUser(req);
      const body = await readJson(req);
      syncAuthUserToDatingProfile(authUser.id);

      const result = rankCandidates({
        store,
        userId: authUser.id,
        limit: Number(body.limit || 20),
        cursor: Number(body.cursor || 0)
      });
      return writeJson(res, 200, result);
    }

    if (req.method === "POST" && pathname === "/swipe") {
      const authUser = requireAuthUser(req);
      const body = await readJson(req);
      const userId = authUser.id;
      const targetId = String(body.targetId || "");
      const direction = String(body.direction || "pass");

      if (!["like", "pass"].includes(direction)) {
        throw new AuthError("BAD_DIRECTION", "Invalid direction. Use like or pass.");
      }
      if (!store.getProfile(targetId)) {
        throw new AuthError("TARGET_NOT_FOUND", "Target user not found.", 404);
      }
      syncAuthUserToDatingProfile(userId);

      const { isMatch } = store.registerSwipe({ userId, targetId, direction });
      return writeJson(res, 200, { ok: true, isMatch });
    }

    if (req.method === "GET" && pathname === "/matches") {
      const authUser = requireAuthUser(req);
      const items = store.getMatchesForUser(authUser.id).map((item) => ({
        userId: item.userId,
        matchedAt: item.matchedAt,
        profile: getCombinedProfile(item.userId)
      }));
      return writeJson(res, 200, { ok: true, items });
    }

    if (req.method === "GET" && pathname === "/inbox") {
      const authUser = requireAuthUser(req);
      const items = chatStore.getInbox(authUser.id).map((item) => ({
        ...item,
        profile: getCombinedProfile(item.otherUserId)
      }));
      return writeJson(res, 200, { ok: true, items });
    }

    if (req.method === "GET" && pathname === "/messages") {
      const authUser = requireAuthUser(req);
      const otherUserId = String(requestUrl.searchParams.get("with") || "");
      if (!otherUserId) {
        throw new AuthError("CHAT_USER_REQUIRED", "Target user is required.");
      }
      if (!store.isMatched(authUser.id, otherUserId)) {
        throw new AuthError("CHAT_MATCH_REQUIRED", "You can only chat with matched users.", 403);
      }

      const thread = chatStore.getThread(authUser.id, otherUserId);
      chatStore.markThreadRead(authUser.id, otherUserId);
      return writeJson(res, 200, {
        ok: true,
        participants: thread.participants,
        messages: thread.messages
      });
    }

    if (req.method === "POST" && pathname === "/messages") {
      const authUser = requireAuthUser(req);
      const body = await readJson(req);
      const toUserId = String(body.toUserId || "");
      const text = String(body.text || "");
      if (!toUserId) {
        throw new AuthError("CHAT_USER_REQUIRED", "Target user is required.");
      }
      if (!store.isMatched(authUser.id, toUserId)) {
        throw new AuthError("CHAT_MATCH_REQUIRED", "You can only chat with matched users.", 403);
      }

      let message;
      try {
        message = chatStore.sendMessage({
          fromUserId: authUser.id,
          toUserId,
          text
        });
      } catch (error) {
        if (error.message === "MESSAGE_EMPTY") {
          throw new AuthError("MESSAGE_EMPTY", "Message cannot be empty.");
        }
        throw error;
      }

      return writeJson(res, 201, { ok: true, message });
    }

    if (req.method === "POST" && pathname === "/app/reset-feed") {
      const authUser = requireAuthUser(req);
      store.resetSwipes(authUser.id);
      return writeJson(res, 200, { ok: true });
    }

    return writeJson(res, 404, { error: "Not Found" });
  } catch (err) {
    return handleError(err, res);
  }
});

server.listen(PORT, () => {
  process.stdout.write(`GEO MATE API running on http://localhost:${PORT}\n`);
});

function writeJson(res, statusCode, payload) {
  const data = JSON.stringify(payload);
  res.writeHead(statusCode, {
    "Content-Type": "application/json",
    "Content-Length": Buffer.byteLength(data),
    "Cache-Control": "no-store"
  });
  res.end(data);
}

function readJson(req) {
  return new Promise((resolve, reject) => {
    let raw = "";
    req.on("data", (chunk) => {
      raw += chunk;
      if (raw.length > 2 * 1024 * 1024) {
        req.socket.destroy();
      }
    });
    req.on("end", () => {
      if (!raw) return resolve({});
      try {
        resolve(JSON.parse(raw));
      } catch (error) {
        reject(new Error("INVALID_JSON"));
      }
    });
    req.on("error", reject);
  });
}

function tryServeStatic(pathname, res) {
  const routeFileMap = {
    "/": "index.html",
    "/auth": "auth.html",
    "/auth/": "auth.html",
    "/app": "app.html",
    "/app/": "app.html"
  };

  const relativePath = routeFileMap[pathname] || pathname.slice(1);
  if (!relativePath) return false;

  const resolvedPath = path.resolve(PUBLIC_DIR, relativePath);
  const resolvedPublic = path.resolve(PUBLIC_DIR);
  if (!resolvedPath.startsWith(resolvedPublic)) {
    return false;
  }
  if (!fs.existsSync(resolvedPath)) {
    return false;
  }

  const stat = fs.statSync(resolvedPath);
  if (!stat.isFile()) {
    return false;
  }

  const extension = path.extname(resolvedPath).toLowerCase();
  const data = fs.readFileSync(resolvedPath);
  res.writeHead(200, {
    "Content-Type": getContentType(extension),
    "Content-Length": Buffer.byteLength(data),
    "Cache-Control": extension === ".html" ? "no-store" : "public, max-age=86400"
  });
  res.end(data);
  return true;
}

function getContentType(extension) {
  const map = {
    ".html": "text/html; charset=utf-8",
    ".css": "text/css; charset=utf-8",
    ".js": "text/javascript; charset=utf-8",
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".svg": "image/svg+xml",
    ".webp": "image/webp",
    ".json": "application/json; charset=utf-8",
    ".webmanifest": "application/manifest+json; charset=utf-8",
    ".ico": "image/x-icon"
  };
  return map[extension] || "application/octet-stream";
}

function handleError(err, res) {
  if (err.message === "INVALID_JSON") {
    return writeJson(res, 400, { error: "Invalid JSON body." });
  }
  if (err.message === "USER_NOT_FOUND") {
    return writeJson(res, 404, { error: "User not found." });
  }
  if (err instanceof AuthError) {
    return writeJson(res, err.status || 400, {
      error: err.message,
      code: err.code
    });
  }

  process.stderr.write(`Unhandled error: ${err.stack || err.message}\n`);
  return writeJson(res, 500, { error: "Internal error", detail: err.message });
}

function resolveTargetUser(body) {
  if (body.userId) {
    const user = authStore.getUserById(String(body.userId));
    if (user) return user;
  }
  const user = authStore.findUserByIdentifier(String(body.identifier || ""));
  if (!user) {
    throw new AuthError("USER_NOT_FOUND", "User not found.", 404);
  }
  return user;
}

function getAccessToken(req) {
  const header = String(req.headers.authorization || "");
  const [scheme, token] = header.split(" ");
  if (scheme !== "Bearer" || !token) {
    return "";
  }
  return token.trim();
}

function requireAuthUser(req) {
  const token = getAccessToken(req);
  if (!token) {
    throw new AuthError("UNAUTHORIZED", "Authorization token is required.", 401);
  }
  const user = authStore.authenticateAccessToken(token);
  if (!user) {
    throw new AuthError("UNAUTHORIZED", "Session expired. Please sign in again.", 401);
  }
  return user;
}

function enforceRateLimit(req, routeKey, limit, windowMs) {
  const now = Date.now();
  const ip = getClientIp(req);
  const key = `${routeKey}:${ip}`;
  const entries = rateLimiter.get(key) || [];
  const recent = entries.filter((timestamp) => now - timestamp < windowMs);

  if (recent.length >= limit) {
    throw new AuthError("RATE_LIMIT", "Too many attempts. Please try again later.", 429);
  }

  recent.push(now);
  rateLimiter.set(key, recent);
}

function getClientIp(req) {
  const forwarded = String(req.headers["x-forwarded-for"] || "").split(",")[0].trim();
  return forwarded || req.socket.remoteAddress || "unknown";
}

function loadWaitlist() {
  try {
    if (!fs.existsSync(WAITLIST_FILE)) {
      return [];
    }
    const raw = fs.readFileSync(WAITLIST_FILE, "utf-8");
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch (error) {
    return [];
  }
}

function saveWaitlist(entries) {
  const dir = path.dirname(WAITLIST_FILE);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(WAITLIST_FILE, JSON.stringify(entries, null, 2), "utf-8");
}

function cryptoRandomId() {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

async function deliverCodes({ email, phone, emailCode, phoneCode }) {
  const [emailDelivery, phoneDelivery] = await Promise.all([
    sendVerificationEmail({ toEmail: email, code: emailCode }),
    sendVerificationSms({ toPhone: phone, code: phoneCode })
  ]);

  if (!emailDelivery.delivered) {
    process.stdout.write(`Email verification delivery failed for ${email}: ${emailDelivery.reason}\n`);
  }
  if (!phoneDelivery.delivered) {
    process.stdout.write(`Phone OTP delivery failed for ${phone}: ${phoneDelivery.reason}\n`);
  }

  return {
    email: emailDelivery,
    phone: phoneDelivery
  };
}

function shouldExposeDevCodes(delivery) {
  const nonProd = process.env.NODE_ENV !== "production";
  if (!nonProd) return false;
  if (String(process.env.SHOW_DEV_CODES || "").toLowerCase() === "true") {
    return true;
  }
  return !delivery.email.delivered || !delivery.phone.delivered;
}

function shouldExposeDevCode(delivery) {
  const nonProd = process.env.NODE_ENV !== "production";
  if (!nonProd) return false;
  if (String(process.env.SHOW_DEV_CODES || "").toLowerCase() === "true") {
    return true;
  }
  return !delivery.delivered;
}

function syncAuthUserToDatingProfile(userId) {
  const user = authStore.getUserById(String(userId || ""));
  if (!user) return;

  store.addProfile({
    id: user.id,
    name: user.name,
    age: user.age,
    gender: user.gender,
    lookingForGenders: user.lookingForGenders,
    minAgePreferred: user.minAgePreferred,
    maxAgePreferred: user.maxAgePreferred,
    maxDistanceKm: user.maxDistanceKm,
    interests: user.interests,
    relationshipIntent: user.relationshipIntent,
    bio: user.bio,
    city: user.city,
    occupation: user.occupation,
    photos: user.photos,
    mainPhoto: user.mainPhoto,
    lat: user.lat,
    lon: user.lon,
    responseRate: user.verifiedEmail && user.verifiedPhone ? 0.9 : 0.6,
    verificationScore: user.verifiedEmail && user.verifiedPhone ? 0.98 : 0.5,
    lastActiveAt: Date.now()
  });
}

function getCombinedProfile(userId) {
  const authUser = authStore.getUserById(String(userId || ""));
  const datingProfile = store.getPublicProfile(String(userId || ""));

  if (authUser) {
    return {
      userId: authUser.id,
      name: authUser.name,
      age: authUser.age,
      gender: authUser.gender,
      interests: authUser.interests,
      relationshipIntent: authUser.relationshipIntent,
      photos: authUser.photos,
      mainPhoto: authUser.mainPhoto,
      bio: authUser.bio || "",
      city: authUser.city || "",
      occupation: authUser.occupation || "",
      lat: authUser.lat,
      lon: authUser.lon,
      verifiedEmail: authUser.verifiedEmail,
      verifiedPhone: authUser.verifiedPhone
    };
  }

  return datingProfile;
}

function seedDiscoveryProfiles(localStore) {
  const now = Date.now();
  [
    {
      id: "seed-1",
      name: "Amina",
      age: 27,
      gender: "female",
      lookingForGenders: ["male"],
      interests: ["hiking", "tech", "travel", "coffee"],
      relationshipIntent: "long_term",
      lat: -1.2921,
      lon: 36.8219,
      minAgePreferred: 24,
      maxAgePreferred: 36,
      maxDistanceKm: 25,
      responseRate: 0.88,
      verificationScore: 0.95,
      lastActiveAt: now - 30 * 60 * 1000
    },
    {
      id: "seed-2",
      name: "Ken",
      age: 29,
      gender: "male",
      lookingForGenders: ["female"],
      interests: ["travel", "fitness", "tech", "podcasts"],
      relationshipIntent: "long_term",
      lat: -1.2864,
      lon: 36.8172,
      minAgePreferred: 24,
      maxAgePreferred: 34,
      maxDistanceKm: 20,
      responseRate: 0.82,
      verificationScore: 0.9,
      lastActiveAt: now - 2 * 60 * 60 * 1000
    },
    {
      id: "seed-3",
      name: "Brian",
      age: 31,
      gender: "male",
      lookingForGenders: ["female"],
      interests: ["hiking", "coffee", "finance", "movies"],
      relationshipIntent: "long_term",
      lat: -1.3,
      lon: 36.8,
      minAgePreferred: 25,
      maxAgePreferred: 35,
      maxDistanceKm: 30,
      responseRate: 0.7,
      verificationScore: 0.86,
      lastActiveAt: now - 10 * 60 * 60 * 1000
    },
    {
      id: "seed-4",
      name: "Maya",
      age: 26,
      gender: "female",
      lookingForGenders: ["male"],
      interests: ["art", "music", "travel", "coffee"],
      relationshipIntent: "casual",
      lat: -1.2841,
      lon: 36.8155,
      minAgePreferred: 24,
      maxAgePreferred: 33,
      maxDistanceKm: 15,
      responseRate: 0.9,
      verificationScore: 0.93,
      lastActiveAt: now - 45 * 60 * 1000
    }
  ].forEach((profile) => localStore.addProfile(profile));
}
