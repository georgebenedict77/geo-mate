const crypto = require("crypto");
const fs = require("fs");
const path = require("path");

const EMAIL_CODE_TTL_MS = 10 * 60 * 1000;
const PHONE_CODE_TTL_MS = 10 * 60 * 1000;
const ACCESS_TOKEN_TTL_MS = 15 * 60 * 1000;
const REFRESH_TOKEN_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const MAX_FAILED_LOGINS = 5;
const LOGIN_LOCK_MS = 15 * 60 * 1000;

class AuthError extends Error {
  constructor(code, message, status = 400) {
    super(message);
    this.name = "AuthError";
    this.code = code;
    this.status = status;
  }
}

class AuthStore {
  constructor({ filePath }) {
    this.filePath = filePath;
    this.db = {
      usersById: {},
      emailIndex: {},
      phoneIndex: {},
      refreshSessions: {}
    };
    this.accessSessions = new Map();
    this.pendingEmailCodes = new Map();
    this.pendingPhoneCodes = new Map();
    this.load();
  }

  load() {
    const dir = path.dirname(this.filePath);
    fs.mkdirSync(dir, { recursive: true });
    if (!fs.existsSync(this.filePath)) {
      this.save();
      return;
    }
    const raw = fs.readFileSync(this.filePath, "utf-8");
    if (!raw.trim()) {
      this.save();
      return;
    }
    this.db = JSON.parse(raw);
  }

  save() {
    fs.writeFileSync(this.filePath, JSON.stringify(this.db, null, 2), "utf-8");
  }

  createUser(payload) {
    const normalizedEmail = normalizeEmail(payload.email);
    const normalizedPhone = normalizePhone(payload.phone);
    const password = String(payload.password || "");

    if (!isValidEmail(normalizedEmail)) {
      throw new AuthError("INVALID_EMAIL", "Please provide a valid email address.");
    }
    if (!isValidPhone(normalizedPhone)) {
      throw new AuthError("INVALID_PHONE", "Please provide a valid phone number.");
    }
    if (!isStrongPassword(password)) {
      throw new AuthError(
        "WEAK_PASSWORD",
        "Password must be at least 8 characters with upper, lower and number."
      );
    }
    if (this.db.emailIndex[normalizedEmail]) {
      throw new AuthError("EMAIL_EXISTS", "Email is already in use.", 409);
    }
    if (this.db.phoneIndex[normalizedPhone]) {
      throw new AuthError("PHONE_EXISTS", "Phone is already in use.", 409);
    }

    const birthDate = String(payload.birthDate || "");
    const age = calculateAge(birthDate);
    if (!Number.isFinite(age) || age < 18) {
      throw new AuthError("AGE_RESTRICTED", "Users must be at least 18 years old.");
    }

    const id = crypto.randomUUID();
    const passwordSalt = crypto.randomBytes(16).toString("hex");
    const passwordHash = hashPassword(password, passwordSalt);
    const now = Date.now();

    const user = {
      id,
      name: String(payload.name || "New User").trim(),
      email: normalizedEmail,
      phone: normalizedPhone,
      passwordHash,
      passwordSalt,
      birthDate,
      age,
      gender: String(payload.gender || "unknown").toLowerCase(),
      lookingForGenders: Array.isArray(payload.lookingForGenders)
        ? payload.lookingForGenders.map((value) => String(value).toLowerCase())
        : [],
      relationshipIntent: String(payload.relationshipIntent || "long_term").toLowerCase(),
      interests: normalizeInterests(payload.interests),
      photos: normalizePhotoList(payload.photos),
      mainPhoto: "",
      bio: String(payload.bio || "").trim(),
      city: String(payload.city || "").trim(),
      occupation: String(payload.occupation || "").trim(),
      minAgePreferred: Number(payload.minAgePreferred ?? 21),
      maxAgePreferred: Number(payload.maxAgePreferred ?? 45),
      maxDistanceKm: Number(payload.maxDistanceKm ?? 30),
      lat: normalizeCoordinate(payload.lat, -90, 90, -1.2921),
      lon: normalizeCoordinate(payload.lon, -180, 180, 36.8219),
      verifiedEmail: false,
      verifiedPhone: false,
      profileComplete: true,
      failedLoginCount: 0,
      lockUntil: 0,
      createdAt: now,
      updatedAt: now
    };
    user.mainPhoto = selectMainPhoto(payload.mainPhoto, user.photos);

    this.db.usersById[id] = user;
    this.db.emailIndex[normalizedEmail] = id;
    this.db.phoneIndex[normalizedPhone] = id;
    this.save();

    const emailCode = this.generateEmailCode(id);
    const phoneCode = this.generatePhoneCode(id);

    return {
      user: this.toSafeUser(user),
      userId: id,
      emailCode,
      phoneCode
    };
  }

  getUserById(userId) {
    return this.db.usersById[userId] || null;
  }

  listUsers() {
    return Object.values(this.db.usersById);
  }

  findUserByIdentifier(identifier) {
    const raw = String(identifier || "").trim();
    if (!raw) return null;

    const emailKey = normalizeEmail(raw);
    const phoneKey = normalizePhone(raw);

    const byEmailId = this.db.emailIndex[emailKey];
    if (byEmailId) {
      return this.getUserById(byEmailId);
    }
    const byPhoneId = this.db.phoneIndex[phoneKey];
    if (byPhoneId) {
      return this.getUserById(byPhoneId);
    }
    return null;
  }

  generateEmailCode(userId) {
    const user = this.requireUser(userId);
    const code = createOtpCode();
    this.pendingEmailCodes.set(user.id, {
      code,
      expiresAt: Date.now() + EMAIL_CODE_TTL_MS
    });
    return code;
  }

  generatePhoneCode(userId) {
    const user = this.requireUser(userId);
    const code = createOtpCode();
    this.pendingPhoneCodes.set(user.id, {
      code,
      expiresAt: Date.now() + PHONE_CODE_TTL_MS
    });
    return code;
  }

  verifyEmailCode(userId, code) {
    const user = this.requireUser(userId);
    const pending = this.pendingEmailCodes.get(user.id);
    if (!pending || pending.expiresAt < Date.now()) {
      throw new AuthError("EMAIL_CODE_EXPIRED", "Email code expired. Request a new one.");
    }
    if (!timingSafeEqual(pending.code, String(code || "").trim())) {
      throw new AuthError("EMAIL_CODE_INVALID", "Incorrect email verification code.");
    }
    user.verifiedEmail = true;
    user.updatedAt = Date.now();
    this.pendingEmailCodes.delete(user.id);
    this.save();
    return this.toSafeUser(user);
  }

  verifyPhoneCode(userId, code) {
    const user = this.requireUser(userId);
    const pending = this.pendingPhoneCodes.get(user.id);
    if (!pending || pending.expiresAt < Date.now()) {
      throw new AuthError("PHONE_CODE_EXPIRED", "Phone code expired. Request a new one.");
    }
    if (!timingSafeEqual(pending.code, String(code || "").trim())) {
      throw new AuthError("PHONE_CODE_INVALID", "Incorrect phone verification code.");
    }
    user.verifiedPhone = true;
    user.updatedAt = Date.now();
    this.pendingPhoneCodes.delete(user.id);
    this.save();
    return this.toSafeUser(user);
  }

  login({ identifier, password }) {
    const user = this.findUserByIdentifier(identifier);
    if (!user) {
      throw new AuthError("INVALID_CREDENTIALS", "Invalid login credentials.", 401);
    }
    if (user.lockUntil && user.lockUntil > Date.now()) {
      throw new AuthError(
        "ACCOUNT_LOCKED",
        "Too many failed attempts. Please try again later.",
        423
      );
    }

    const valid = verifyPassword(password, user.passwordSalt, user.passwordHash);
    if (!valid) {
      user.failedLoginCount = Number(user.failedLoginCount || 0) + 1;
      if (user.failedLoginCount >= MAX_FAILED_LOGINS) {
        user.lockUntil = Date.now() + LOGIN_LOCK_MS;
        user.failedLoginCount = 0;
      }
      user.updatedAt = Date.now();
      this.save();
      throw new AuthError("INVALID_CREDENTIALS", "Invalid login credentials.", 401);
    }

    if (!user.verifiedEmail || !user.verifiedPhone) {
      throw new AuthError(
        "VERIFICATION_REQUIRED",
        "Please verify both email and phone before signing in.",
        403
      );
    }

    user.failedLoginCount = 0;
    user.lockUntil = 0;
    user.updatedAt = Date.now();
    this.save();

    return this.createSession(user.id);
  }

  createSession(userId) {
    const user = this.requireUser(userId);
    const now = Date.now();

    const accessToken = crypto.randomBytes(32).toString("hex");
    const refreshToken = crypto.randomBytes(48).toString("hex");
    const refreshTokenHash = sha256(refreshToken);

    const accessExpiresAt = now + ACCESS_TOKEN_TTL_MS;
    const refreshExpiresAt = now + REFRESH_TOKEN_TTL_MS;

    this.accessSessions.set(accessToken, {
      userId: user.id,
      expiresAt: accessExpiresAt
    });

    this.db.refreshSessions[refreshTokenHash] = {
      userId: user.id,
      expiresAt: refreshExpiresAt,
      createdAt: now
    };
    this.save();

    return {
      accessToken,
      refreshToken,
      accessExpiresAt,
      refreshExpiresAt,
      user: this.toSafeUser(user)
    };
  }

  refreshSession(refreshToken) {
    const refreshTokenHash = sha256(String(refreshToken || ""));
    const session = this.db.refreshSessions[refreshTokenHash];

    if (!session || session.expiresAt < Date.now()) {
      throw new AuthError("INVALID_REFRESH", "Refresh token is invalid or expired.", 401);
    }

    delete this.db.refreshSessions[refreshTokenHash];
    this.save();

    return this.createSession(session.userId);
  }

  logout(refreshToken) {
    const refreshTokenHash = sha256(String(refreshToken || ""));
    delete this.db.refreshSessions[refreshTokenHash];
    this.save();
  }

  authenticateAccessToken(accessToken) {
    const token = String(accessToken || "");
    const session = this.accessSessions.get(token);
    if (!session || session.expiresAt < Date.now()) {
      this.accessSessions.delete(token);
      return null;
    }
    return this.getUserById(session.userId);
  }

  updateProfile(userId, payload) {
    const user = this.requireUser(userId);
    user.name = String(payload.name || user.name).trim();
    user.gender = String(payload.gender || user.gender).toLowerCase();
    user.lookingForGenders = Array.isArray(payload.lookingForGenders)
      ? payload.lookingForGenders.map((value) => String(value).toLowerCase())
      : user.lookingForGenders;
    user.relationshipIntent = String(
      payload.relationshipIntent || user.relationshipIntent
    ).toLowerCase();
    user.interests = Array.isArray(payload.interests)
      ? normalizeInterests(payload.interests)
      : user.interests;
    user.photos = Array.isArray(payload.photos)
      ? normalizePhotoList(payload.photos)
      : user.photos;
    user.mainPhoto = selectMainPhoto(payload.mainPhoto, user.photos, user.mainPhoto);
    user.bio = typeof payload.bio === "string" ? payload.bio.trim() : user.bio;
    user.city = typeof payload.city === "string" ? payload.city.trim() : user.city;
    user.occupation = typeof payload.occupation === "string" ? payload.occupation.trim() : user.occupation;
    user.minAgePreferred = Number(payload.minAgePreferred ?? user.minAgePreferred);
    user.maxAgePreferred = Number(payload.maxAgePreferred ?? user.maxAgePreferred);
    user.maxDistanceKm = Number(payload.maxDistanceKm ?? user.maxDistanceKm);
    user.lat = normalizeCoordinate(payload.lat, -90, 90, user.lat);
    user.lon = normalizeCoordinate(payload.lon, -180, 180, user.lon);
    user.updatedAt = Date.now();
    this.save();
    return this.toSafeUser(user);
  }

  toSafeUser(user) {
    return {
      id: user.id,
      name: user.name,
      email: user.email,
      phone: user.phone,
      birthDate: user.birthDate,
      age: user.age,
      gender: user.gender,
      lookingForGenders: user.lookingForGenders,
      relationshipIntent: user.relationshipIntent,
      interests: user.interests,
      photos: user.photos,
      mainPhoto: user.mainPhoto,
      bio: user.bio,
      city: user.city,
      occupation: user.occupation,
      minAgePreferred: user.minAgePreferred,
      maxAgePreferred: user.maxAgePreferred,
      maxDistanceKm: user.maxDistanceKm,
      lat: user.lat,
      lon: user.lon,
      verifiedEmail: user.verifiedEmail,
      verifiedPhone: user.verifiedPhone,
      profileComplete: user.profileComplete,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt
    };
  }

  requireUser(userId) {
    const user = this.getUserById(String(userId || ""));
    if (!user) {
      throw new AuthError("USER_NOT_FOUND", "User not found.", 404);
    }
    return user;
  }
}

function normalizeEmail(value) {
  return String(value || "").trim().toLowerCase();
}

function normalizePhone(value) {
  const raw = String(value || "").trim();
  return raw.replace(/[^\d+]/g, "");
}

function normalizeInterests(values) {
  if (!Array.isArray(values)) return [];
  return [...new Set(values.map((value) => String(value).trim().toLowerCase()).filter(Boolean))];
}

function normalizePhotoList(values) {
  if (!Array.isArray(values)) return [];
  const safe = values
    .map((value) => String(value || "").trim())
    .filter((value) => isAcceptedPhotoValue(value))
    .slice(0, 6);
  return [...new Set(safe)];
}

function isAcceptedPhotoValue(value) {
  if (!value) return false;
  return (
    /^https?:\/\//i.test(value) ||
    /^data:image\//i.test(value) ||
    /^\/assets\//i.test(value)
  );
}

function selectMainPhoto(mainPhoto, photos, fallback = "") {
  const candidate = String(mainPhoto || "").trim();
  if (candidate && photos.includes(candidate)) return candidate;
  if (photos.length) return photos[0];
  return String(fallback || "");
}

function normalizeCoordinate(value, min, max, fallback) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  if (n < min || n > max) return fallback;
  return n;
}

function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function isValidPhone(phone) {
  return /^\+?\d{8,15}$/.test(phone);
}

function isStrongPassword(password) {
  return (
    typeof password === "string" &&
    password.length >= 8 &&
    /[a-z]/.test(password) &&
    /[A-Z]/.test(password) &&
    /\d/.test(password)
  );
}

function calculateAge(birthDate) {
  const d = new Date(birthDate);
  if (Number.isNaN(d.getTime())) return NaN;
  const now = new Date();
  let age = now.getUTCFullYear() - d.getUTCFullYear();
  const monthDiff = now.getUTCMonth() - d.getUTCMonth();
  const dayDiff = now.getUTCDate() - d.getUTCDate();
  if (monthDiff < 0 || (monthDiff === 0 && dayDiff < 0)) {
    age -= 1;
  }
  return age;
}

function hashPassword(password, salt) {
  return crypto.scryptSync(password, salt, 64).toString("hex");
}

function verifyPassword(password, salt, expectedHash) {
  if (typeof password !== "string" || !password) return false;
  const actualHash = hashPassword(password, salt);
  return timingSafeEqual(actualHash, expectedHash);
}

function timingSafeEqual(a, b) {
  const aa = Buffer.from(String(a));
  const bb = Buffer.from(String(b));
  if (aa.length !== bb.length) return false;
  return crypto.timingSafeEqual(aa, bb);
}

function createOtpCode() {
  return String(Math.floor(100000 + Math.random() * 900000));
}

function sha256(value) {
  return crypto.createHash("sha256").update(String(value)).digest("hex");
}

module.exports = {
  AuthStore,
  AuthError
};
