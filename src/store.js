const MS_IN_DAY = 24 * 60 * 60 * 1000;

class DatingStore {
  constructor() {
    this.profilesById = new Map();
    this.genderIndex = new Map();
    this.interestIndex = new Map();

    this.swipesByUser = new Map();
    this.likesReceived = new Map();
    this.exposureCounts = new Map();
    this.matches = new Set();
    this.matchCreatedAt = new Map();
  }

  addProfile(profile) {
    const normalized = normalizeProfile(profile);
    const previous = this.profilesById.get(normalized.id);

    if (previous) {
      this.genderIndex.get(previous.gender)?.delete(previous.id);
      for (const interest of previous.interests) {
        this.interestIndex.get(interest)?.delete(previous.id);
      }
    }

    this.profilesById.set(normalized.id, normalized);

    if (!this.genderIndex.has(normalized.gender)) {
      this.genderIndex.set(normalized.gender, new Set());
    }
    this.genderIndex.get(normalized.gender).add(normalized.id);

    for (const interest of normalized.interests) {
      if (!this.interestIndex.has(interest)) {
        this.interestIndex.set(interest, new Set());
      }
      this.interestIndex.get(interest).add(normalized.id);
    }

    if (!this.swipesByUser.has(normalized.id)) {
      this.swipesByUser.set(normalized.id, { liked: new Set(), passed: new Set() });
    }
    if (!this.likesReceived.has(normalized.id)) {
      this.likesReceived.set(normalized.id, new Set());
    }
    if (!this.exposureCounts.has(normalized.id)) {
      this.exposureCounts.set(normalized.id, 0);
    }
  }

  getProfile(userId) {
    return this.profilesById.get(userId);
  }

  getPublicProfile(userId) {
    const profile = this.getProfile(userId);
    if (!profile) return null;
    return {
      userId: profile.id,
      name: profile.name,
      age: profile.age,
      gender: profile.gender,
      interests: profile.interests,
      relationshipIntent: profile.relationshipIntent,
      bio: profile.bio,
      city: profile.city,
      occupation: profile.occupation,
      photos: profile.photos,
      mainPhoto: profile.mainPhoto,
      lat: profile.lat,
      lon: profile.lon,
      lastActiveAt: profile.lastActiveAt
    };
  }

  getCandidateBasePool(userProfile) {
    const genderCandidates = new Set();
    const lookingFor = userProfile.lookingForGenders.length
      ? userProfile.lookingForGenders
      : Array.from(this.genderIndex.keys());

    for (const gender of lookingFor) {
      const ids = this.genderIndex.get(gender);
      if (!ids) continue;
      for (const id of ids) {
        genderCandidates.add(id);
      }
    }

    if (!userProfile.interests.length) {
      return genderCandidates;
    }

    const interestCandidates = new Set();
    for (const interest of userProfile.interests) {
      const ids = this.interestIndex.get(interest);
      if (!ids) continue;
      for (const id of ids) {
        if (genderCandidates.has(id)) {
          interestCandidates.add(id);
        }
      }
    }

    return interestCandidates.size ? interestCandidates : genderCandidates;
  }

  getAlreadySwiped(userId) {
    const swipes = this.swipesByUser.get(userId);
    if (!swipes) return new Set();
    return new Set([...swipes.liked, ...swipes.passed]);
  }

  registerSwipe({ userId, targetId, direction }) {
    if (!this.swipesByUser.has(userId)) {
      this.swipesByUser.set(userId, { liked: new Set(), passed: new Set() });
    }

    const swipes = this.swipesByUser.get(userId);
    const liked = direction === "like";

    if (liked) {
      swipes.liked.add(targetId);
      this.likesReceived.get(targetId)?.add(userId);
    } else {
      swipes.passed.add(targetId);
    }

    const targetSwipes = this.swipesByUser.get(targetId);
    const isMatch = liked && targetSwipes?.liked?.has(userId);

    if (isMatch) {
      const key = matchKey(userId, targetId);
      this.matches.add(key);
      this.matchCreatedAt.set(key, Date.now());
    }

    return { isMatch };
  }

  resetSwipes(userId) {
    const keyUserId = String(userId || "");
    const swipes = this.swipesByUser.get(keyUserId);
    if (!swipes) return;

    for (const targetId of swipes.liked) {
      this.likesReceived.get(targetId)?.delete(keyUserId);
    }

    this.swipesByUser.set(keyUserId, { liked: new Set(), passed: new Set() });

    for (const key of this.matches) {
      const [a, b] = key.split("|");
      if (a === keyUserId || b === keyUserId) {
        this.matches.delete(key);
        this.matchCreatedAt.delete(key);
      }
    }
  }

  isMatched(userId, targetId) {
    return this.matches.has(matchKey(userId, targetId));
  }

  getMatchesForUser(userId) {
    const result = [];
    const keyUserId = String(userId || "");

    for (const key of this.matches) {
      const [a, b] = key.split("|");
      if (a !== keyUserId && b !== keyUserId) continue;
      const otherUserId = a === keyUserId ? b : a;
      result.push({
        userId: otherUserId,
        matchedAt: this.matchCreatedAt.get(key) || Date.now()
      });
    }

    result.sort((x, y) => y.matchedAt - x.matchedAt);
    return result;
  }

  incrementExposure(userId, count = 1) {
    this.exposureCounts.set(userId, (this.exposureCounts.get(userId) || 0) + count);
  }

  getExposure(userId) {
    return this.exposureCounts.get(userId) || 0;
  }
}

function normalizeProfile(profile) {
  const now = Date.now();
  const safe = {
    id: String(profile.id),
    name: String(profile.name || "Unknown"),
    age: Number(profile.age || 18),
    gender: String(profile.gender || "unknown").toLowerCase(),
    lookingForGenders: Array.isArray(profile.lookingForGenders)
      ? profile.lookingForGenders.map((x) => String(x).toLowerCase())
      : [],
    minAgePreferred: Number(profile.minAgePreferred || 18),
    maxAgePreferred: Number(profile.maxAgePreferred || 99),
    maxDistanceKm: Number(profile.maxDistanceKm || 200),
    interests: normalizeTags(profile.interests),
    relationshipIntent: String(profile.relationshipIntent || "unknown").toLowerCase(),
    bio: String(profile.bio || "").trim(),
    city: String(profile.city || "").trim(),
    occupation: String(profile.occupation || "").trim(),
    photos: normalizePhotoList(profile.photos),
    mainPhoto: "",
    lat: Number(profile.lat || 0),
    lon: Number(profile.lon || 0),
    responseRate: clamp(Number(profile.responseRate ?? 0.5), 0, 1),
    verificationScore: clamp(Number(profile.verificationScore ?? 0.5), 0, 1),
    lastActiveAt: Number(profile.lastActiveAt || now - 2 * MS_IN_DAY)
  };
  safe.mainPhoto = safe.photos.includes(String(profile.mainPhoto || "").trim())
    ? String(profile.mainPhoto || "").trim()
    : safe.photos[0] || "";

  return safe;
}

function normalizeTags(values) {
  if (!Array.isArray(values)) return [];
  return [...new Set(values.map((x) => String(x).trim().toLowerCase()).filter(Boolean))];
}

function normalizePhotoList(values) {
  if (!Array.isArray(values)) return [];
  return [
    ...new Set(
      values
        .map((value) => String(value || "").trim())
        .filter(
          (value) =>
            /^https?:\/\//i.test(value) ||
            /^data:image\//i.test(value) ||
            /^\/assets\//i.test(value)
        )
    )
  ].slice(0, 6);
}

function matchKey(a, b) {
  return [a, b].sort().join("|");
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

module.exports = {
  DatingStore
};
