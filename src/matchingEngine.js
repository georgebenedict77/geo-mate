const EARTH_RADIUS_KM = 6371;
const RECENCY_HALFLIFE_HOURS = 18;

function rankCandidates({ store, userId, limit = 20, cursor = 0 }) {
  const user = store.getProfile(userId);
  if (!user) {
    throw new Error("USER_NOT_FOUND");
  }

  const basePool = store.getCandidateBasePool(user);
  const alreadySwiped = store.getAlreadySwiped(userId);

  const start = Number(cursor) || 0;
  const pageSize = Math.max(0, Number(limit || 20));
  const needed = start + pageSize;
  const topCandidates = new MinHeap((a, b) => a.score.total - b.score.total);
  let eligibleCount = 0;

  for (const candidateId of basePool) {
    if (candidateId === userId) continue;
    if (alreadySwiped.has(candidateId)) continue;

    const candidate = store.getProfile(candidateId);
    if (!candidate) continue;
    if (!isMutualPreference(user, candidate)) continue;
    if (!isWithinAgePreference(user, candidate)) continue;
    if (!isDistanceAcceptable(user, candidate)) continue;

    const score = scoreCandidate(store, user, candidate);
    const entry = { candidateId, score, breakdown: score.breakdown };
    eligibleCount += 1;

    if (needed <= 0) continue;
    if (topCandidates.size() < needed) {
      topCandidates.push(entry);
    } else if (entry.score.total > topCandidates.peek().score.total) {
      topCandidates.replaceTop(entry);
    }
  }

  const ordered = topCandidates.toArray().sort((a, b) => b.score.total - a.score.total);
  const end = start + pageSize;
  const page = ordered.slice(start, end);

  for (const item of page) {
    store.incrementExposure(item.candidateId);
  }

  return {
    items: page.map((item) => ({
      userId: item.candidateId,
      score: Number(item.score.total.toFixed(4)),
      breakdown: item.breakdown,
      profile: store.getPublicProfile(item.candidateId)
    })),
    nextCursor: end < eligibleCount ? end : null,
    totalCandidates: eligibleCount
  };
}

function scoreCandidate(store, user, candidate) {
  const compatibility = jaccard(user.interests, candidate.interests);
  const intent = user.relationshipIntent === candidate.relationshipIntent ? 1 : 0.35;
  const recency = recencyScore(candidate.lastActiveAt);
  const responsiveness = candidate.responseRate;
  const trust = candidate.verificationScore;
  const fairness = fairnessBoost(store.getExposure(candidate.id));

  const weights = {
    compatibility: 0.35,
    intent: 0.2,
    recency: 0.15,
    responsiveness: 0.15,
    trust: 0.1,
    fairness: 0.05
  };

  const total =
    compatibility * weights.compatibility +
    intent * weights.intent +
    recency * weights.recency +
    responsiveness * weights.responsiveness +
    trust * weights.trust +
    fairness * weights.fairness;

  return {
    total,
    breakdown: {
      compatibility: round4(compatibility),
      intent: round4(intent),
      recency: round4(recency),
      responsiveness: round4(responsiveness),
      trust: round4(trust),
      fairness: round4(fairness)
    }
  };
}

function jaccard(a, b) {
  if (!a.length && !b.length) return 0;
  const setA = new Set(a);
  const setB = new Set(b);
  let intersection = 0;

  for (const value of setA) {
    if (setB.has(value)) intersection += 1;
  }

  const union = new Set([...a, ...b]).size;
  return union ? intersection / union : 0;
}

function recencyScore(lastActiveAt) {
  const ageMs = Date.now() - Number(lastActiveAt || 0);
  const ageHours = Math.max(0, ageMs / (60 * 60 * 1000));
  return Math.pow(0.5, ageHours / RECENCY_HALFLIFE_HOURS);
}

function fairnessBoost(exposureCount) {
  return 1 / Math.sqrt(Math.max(1, exposureCount));
}

function isMutualPreference(user, candidate) {
  const userLikesCandidateGender =
    !user.lookingForGenders.length || user.lookingForGenders.includes(candidate.gender);
  const candidateLikesUserGender =
    !candidate.lookingForGenders.length || candidate.lookingForGenders.includes(user.gender);
  return userLikesCandidateGender && candidateLikesUserGender;
}

function isWithinAgePreference(user, candidate) {
  return (
    candidate.age >= user.minAgePreferred &&
    candidate.age <= user.maxAgePreferred &&
    user.age >= candidate.minAgePreferred &&
    user.age <= candidate.maxAgePreferred
  );
}

function isDistanceAcceptable(user, candidate) {
  const distance = haversineDistanceKm(user.lat, user.lon, candidate.lat, candidate.lon);
  return distance <= user.maxDistanceKm && distance <= candidate.maxDistanceKm;
}

function haversineDistanceKm(lat1, lon1, lat2, lon2) {
  const dLat = toRadians(lat2 - lat1);
  const dLon = toRadians(lon2 - lon1);

  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRadians(lat1)) *
      Math.cos(toRadians(lat2)) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return EARTH_RADIUS_KM * c;
}

function toRadians(deg) {
  return (deg * Math.PI) / 180;
}

function round4(value) {
  return Number(value.toFixed(4));
}

module.exports = {
  rankCandidates
};

class MinHeap {
  constructor(compareFn) {
    this.compare = compareFn;
    this.data = [];
  }

  size() {
    return this.data.length;
  }

  peek() {
    return this.data[0];
  }

  push(value) {
    this.data.push(value);
    this.bubbleUp(this.data.length - 1);
  }

  replaceTop(value) {
    if (!this.data.length) {
      this.data[0] = value;
      return;
    }
    this.data[0] = value;
    this.bubbleDown(0);
  }

  toArray() {
    return [...this.data];
  }

  bubbleUp(index) {
    let i = index;
    while (i > 0) {
      const parent = Math.floor((i - 1) / 2);
      if (this.compare(this.data[i], this.data[parent]) >= 0) break;
      [this.data[i], this.data[parent]] = [this.data[parent], this.data[i]];
      i = parent;
    }
  }

  bubbleDown(index) {
    let i = index;
    while (true) {
      let smallest = i;
      const left = i * 2 + 1;
      const right = i * 2 + 2;

      if (
        left < this.data.length &&
        this.compare(this.data[left], this.data[smallest]) < 0
      ) {
        smallest = left;
      }
      if (
        right < this.data.length &&
        this.compare(this.data[right], this.data[smallest]) < 0
      ) {
        smallest = right;
      }
      if (smallest === i) break;
      [this.data[i], this.data[smallest]] = [this.data[smallest], this.data[i]];
      i = smallest;
    }
  }
}
