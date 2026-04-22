const AUTH_STORAGE_KEY = "geo_mate_auth";
const MAX_PHOTOS = 6;
const INTEREST_OPTIONS = [
  "Travel",
  "Music",
  "Movies",
  "Fitness",
  "Hiking",
  "Cooking",
  "Coffee",
  "Dancing",
  "Gaming",
  "Art",
  "Photography",
  "Books",
  "Business",
  "Tech",
  "Fashion",
  "Food",
  "Nature",
  "Sports",
  "Podcast",
  "Volunteering"
];

const userBadge = document.getElementById("userBadge");
const logoutBtn = document.getElementById("logoutBtn");
const statusEl = document.getElementById("status");

const tabButtons = Array.from(document.querySelectorAll(".tab"));
const panels = {
  discover: document.getElementById("discoverPanel"),
  matches: document.getElementById("matchesPanel"),
  chat: document.getElementById("chatPanel"),
  profile: document.getElementById("profilePanel")
};

const deck = document.getElementById("deck");
const emptyState = document.getElementById("emptyState");
const likeBtn = document.getElementById("likeBtn");
const passBtn = document.getElementById("passBtn");
const refreshFeedBtn = document.getElementById("refreshFeedBtn");
const resetFeedBtn = document.getElementById("resetFeedBtn");

const matchesList = document.getElementById("matchesList");
const inboxList = document.getElementById("inboxList");
const chatHeader = document.getElementById("chatHeader");
const messagesBox = document.getElementById("messages");
const messageForm = document.getElementById("messageForm");
const messageInput = document.getElementById("messageInput");

const profileForm = document.getElementById("profileForm");
const profilePhotoUrlInput = document.getElementById("profilePhotoUrlInput");
const profileAddPhotoUrlBtn = document.getElementById("profileAddPhotoUrlBtn");
const profilePhotoFileInput = document.getElementById("profilePhotoFileInput");
const profilePhotoPreview = document.getElementById("profilePhotoPreview");
const profileUseLocationBtn = document.getElementById("profileUseLocationBtn");
const profileLocationHint = document.getElementById("profileLocationHint");
const profileInterestSelect = document.getElementById("profileInterestSelect");
const profileAddInterestBtn = document.getElementById("profileAddInterestBtn");
const profileInterestTags = document.getElementById("profileInterestTags");
const profileInterestsInput = document.getElementById("profileInterestsInput");

const state = {
  tab: "discover",
  user: null,
  queue: [],
  cursor: 0,
  exhausted: false,
  busySwipe: false,
  matches: [],
  inbox: [],
  activeChatUserId: "",
  profilePhotos: [],
  profileMainPhoto: "",
  profileInterests: [],
  profileLat: null,
  profileLon: null
};

tabButtons.forEach((button) => {
  button.addEventListener("click", () => switchTab(button.dataset.tab));
});

logoutBtn.addEventListener("click", logout);
likeBtn.addEventListener("click", () => swipe("like"));
passBtn.addEventListener("click", () => swipe("pass"));
refreshFeedBtn.addEventListener("click", () => refreshFeed());
resetFeedBtn.addEventListener("click", () => resetFeed());

messageForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  await sendMessage();
});

profileForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  await saveProfile();
});

profileAddPhotoUrlBtn?.addEventListener("click", () => {
  const value = String(profilePhotoUrlInput.value || "").trim();
  if (!value) return;
  if (!isAcceptedPhotoValue(value)) {
    setStatus("Use a valid image URL (http/https).", "error");
    return;
  }
  addProfilePhoto(value);
  profilePhotoUrlInput.value = "";
  clearStatus();
});

profilePhotoFileInput?.addEventListener("change", async (event) => {
  const files = Array.from(event.target.files || []);
  if (!files.length) return;

  for (const file of files) {
    if (state.profilePhotos.length >= MAX_PHOTOS) break;
    if (!file.type.startsWith("image/")) continue;
    try {
      const dataUrl = await readFileAsDataUrl(file);
      addProfilePhoto(dataUrl);
    } catch (error) {
      setStatus("A selected photo could not be read.", "error");
    }
  }

  profilePhotoFileInput.value = "";
});

profileUseLocationBtn?.addEventListener("click", async () => {
  await captureProfileLocation();
});

profileAddInterestBtn?.addEventListener("click", () => {
  const value = String(profileInterestSelect?.value || "").trim();
  if (!value) return;
  addProfileInterest(value);
  if (profileInterestSelect) profileInterestSelect.value = "";
});

initialize().catch((error) => {
  setStatus(error.message, "error");
});

async function initialize() {
  populateInterestOptions(profileInterestSelect);

  const session = readSession();
  if (!session) {
    window.location.href = "/auth";
    return;
  }

  const me = await authRequest("/auth/me", { method: "GET" });
  state.user = me.user;
  userBadge.textContent = state.user.name || "Member";
  hydrateProfileForm();

  await Promise.all([loadFeed(), loadMatches(), loadInbox()]);
  renderDeck();
  renderMatches();
  renderInbox();
  switchTab("discover");
}

function switchTab(tabName) {
  state.tab = ["discover", "matches", "chat", "profile"].includes(tabName)
    ? tabName
    : "discover";

  tabButtons.forEach((button) => {
    button.classList.toggle("tab--active", button.dataset.tab === state.tab);
  });

  Object.entries(panels).forEach(([name, panel]) => {
    panel.classList.toggle("panel--active", name === state.tab);
  });
}

async function loadFeed() {
  const data = await authRequest("/recommendations", {
    method: "POST",
    body: { limit: 18, cursor: state.cursor }
  });
  const items = Array.isArray(data.items) ? data.items : [];
  state.queue = state.queue.concat(items);
  if (data.nextCursor === null || data.nextCursor === undefined) {
    state.exhausted = true;
  } else {
    state.cursor = Number(data.nextCursor);
  }
}

function renderDeck() {
  deck.innerHTML = "";
  const current = state.queue.slice(0, 3);
  if (!current.length) {
    emptyState.classList.remove("empty--hidden");
    return;
  }
  emptyState.classList.add("empty--hidden");

  current
    .slice()
    .reverse()
    .forEach((item, reverseIndex) => {
      const layer = current.length - reverseIndex;
      const card = createCard(item, layer);
      deck.appendChild(card);
    });
}

function createCard(item, layer) {
  const profile = item.profile || {};
  const score = Math.round((Number(item.score || 0) || 0) * 100);
  const name = escapeHtml(profile.name || "Unknown");
  const age = escapeHtml(String(profile.age || "-"));
  const intent = friendlyIntent(profile.relationshipIntent);
  const chips = Array.isArray(profile.interests) ? profile.interests.slice(0, 5) : [];
  const bio = escapeHtml(profile.bio || "Open to meaningful connections.");

  const city = profile.city ? String(profile.city).trim() : "";
  const distance = formatDistanceKm(state.user?.lat, state.user?.lon, profile.lat, profile.lon);
  const locationLine = [city, distance].filter(Boolean).join(" | ");

  const card = document.createElement("article");
  card.className = `card card--${Math.min(layer, 3)}`;

  const photo = normalizePhotoValue(profile.mainPhoto || profile.photos?.[0]);
  if (photo) {
    card.classList.add("card--photo");
    card.style.setProperty("--card-photo", `url("${escapeCssUrl(photo)}")`);
  }

  card.innerHTML = `
    <div class="card__bg"></div>
    <div class="card__shade"></div>
    <div class="card__body">
      <span class="compat">Compatibility ${score}%</span>
      <h3>${name}, ${age}</h3>
      <p class="meta">${escapeHtml(intent)}</p>
      <p class="meta">${bio}</p>
      ${locationLine ? `<p class="meta">${escapeHtml(locationLine)}</p>` : ""}
      <div class="chips">
        ${chips.map((tag) => `<span>${escapeHtml(tag)}</span>`).join("") || "<span>New member</span>"}
      </div>
    </div>
  `;
  return card;
}

async function swipe(direction) {
  if (state.busySwipe) return;
  const topItem = state.queue[0];
  if (!topItem) {
    setStatus("No profiles available right now.", "error");
    return;
  }

  state.busySwipe = true;
  likeBtn.disabled = true;
  passBtn.disabled = true;
  animateTopCard(direction);

  try {
    const response = await authRequest("/swipe", {
      method: "POST",
      body: {
        targetId: topItem.userId,
        direction
      }
    });

    state.queue.shift();
    if (state.queue.length < 2 && !state.exhausted) {
      await loadFeed();
    }
    renderDeck();

    if (response.isMatch) {
      setStatus(`You matched with ${topItem.profile?.name || "someone"}!`, "success");
      await Promise.all([loadMatches(), loadInbox()]);
      renderMatches();
      renderInbox();
    } else {
      setStatus(direction === "like" ? "Like sent." : "Profile passed.", "success");
    }
  } catch (error) {
    setStatus(error.message, "error");
  } finally {
    state.busySwipe = false;
    likeBtn.disabled = false;
    passBtn.disabled = false;
  }
}

function animateTopCard(direction) {
  const topCard = deck.querySelector(".card--1");
  if (!topCard) return;
  topCard.classList.add(direction === "like" ? "card--leave-right" : "card--leave-left");
}

async function refreshFeed() {
  state.queue = [];
  state.cursor = 0;
  state.exhausted = false;
  await loadFeed();
  renderDeck();
  setStatus("Feed refreshed.", "success");
}

async function resetFeed() {
  try {
    await authRequest("/app/reset-feed", { method: "POST" });
    state.queue = [];
    state.cursor = 0;
    state.exhausted = false;
    await loadFeed();
    renderDeck();
    setStatus("Swipes reset. You can explore from the start.", "success");
  } catch (error) {
    setStatus(error.message, "error");
  }
}

async function loadMatches() {
  const data = await authRequest("/matches", { method: "GET" });
  state.matches = Array.isArray(data.items) ? data.items : [];
}

function renderMatches() {
  if (!state.matches.length) {
    matchesList.innerHTML = `<li class="list-item"><p class="list-item__title">No matches yet</p><p class="list-item__meta">Like profiles in Discover to create matches.</p></li>`;
    return;
  }

  matchesList.innerHTML = state.matches
    .map((item) => {
      const profile = item.profile || {};
      const rawName = String(profile.name || "Unknown");
      const safeName = escapeHtml(rawName);
      const intent = escapeHtml(friendlyIntent(profile.relationshipIntent));
      const matchedAt = new Date(item.matchedAt).toLocaleString();
      return `
        <li class="list-item">
          <div class="list-item__row">
            ${renderAvatar(profile, rawName)}
            <div class="list-item__body">
              <p class="list-item__title">${safeName}</p>
              <p class="list-item__meta">${intent} | Matched ${escapeHtml(matchedAt)}</p>
            </div>
            <button data-open-chat="${escapeHtml(item.userId)}" data-name="${safeName}">Open Chat</button>
          </div>
        </li>
      `;
    })
    .join("");

  matchesList.querySelectorAll("[data-open-chat]").forEach((button) => {
    button.addEventListener("click", () => {
      const userId = button.getAttribute("data-open-chat");
      const name = button.getAttribute("data-name");
      openChat(userId, name);
    });
  });
}

async function loadInbox() {
  const data = await authRequest("/inbox", { method: "GET" });
  state.inbox = Array.isArray(data.items) ? data.items : [];
}

function renderInbox() {
  if (!state.inbox.length) {
    inboxList.innerHTML = `<li class="list-item"><p class="list-item__title">Inbox is empty</p><p class="list-item__meta">Messages with matches will appear here.</p></li>`;
    return;
  }

  inboxList.innerHTML = state.inbox
    .map((item) => {
      const profile = item.profile || {};
      const rawName = String(profile.name || "Unknown");
      const safeName = escapeHtml(rawName);
      const unread = Number(item.unreadCount || 0);
      const preview = item.lastMessage
        ? escapeHtml(item.lastMessage.text.slice(0, 60))
        : "No messages yet";
      return `
        <li class="list-item">
          <div class="list-item__row">
            ${renderAvatar(profile, rawName)}
            <div class="list-item__body">
              <p class="list-item__title">${safeName}${unread ? ` (${unread} unread)` : ""}</p>
              <p class="list-item__meta">${preview}</p>
            </div>
            <button data-chat-user="${escapeHtml(item.otherUserId)}" data-chat-name="${safeName}">Chat</button>
          </div>
        </li>
      `;
    })
    .join("");

  inboxList.querySelectorAll("[data-chat-user]").forEach((button) => {
    button.addEventListener("click", () => {
      const userId = button.getAttribute("data-chat-user");
      const name = button.getAttribute("data-chat-name");
      openChat(userId, name);
    });
  });
}

function renderAvatar(profile, rawName) {
  const photo = normalizePhotoValue(profile?.mainPhoto || profile?.photos?.[0]);
  if (photo) {
    return `<div class="list-item__avatar"><img src="${escapeHtml(photo)}" alt="${escapeHtml(
      rawName
    )}" /></div>`;
  }
  const initial = escapeHtml((rawName || "U").charAt(0).toUpperCase());
  return `<div class="list-item__avatar">${initial}</div>`;
}

async function openChat(userId, userNameValue) {
  if (!userId) return;
  state.activeChatUserId = userId;
  switchTab("chat");
  chatHeader.textContent = `Chat with ${userNameValue || "match"}`;
  await loadThread();
}

async function loadThread() {
  if (!state.activeChatUserId) {
    messagesBox.innerHTML = "";
    return;
  }

  try {
    const data = await authRequest(`/messages?with=${encodeURIComponent(state.activeChatUserId)}`, {
      method: "GET"
    });
    const messages = Array.isArray(data.messages) ? data.messages : [];

    if (!messages.length) {
      messagesBox.innerHTML = `<div class="message message--theirs">No messages yet. Say hi.</div>`;
      return;
    }

    messagesBox.innerHTML = messages
      .map((message) => {
        const mine = message.fromUserId === state.user.id;
        return `
          <div class="message ${mine ? "message--mine" : "message--theirs"}">
            <span>${escapeHtml(message.text)}</span>
            <small class="message__time">${escapeHtml(formatTime(message.createdAt))}</small>
          </div>
        `;
      })
      .join("");

    messagesBox.scrollTop = messagesBox.scrollHeight;
    await loadInbox();
    renderInbox();
  } catch (error) {
    setStatus(error.message, "error");
  }
}

async function sendMessage() {
  const text = String(messageInput.value || "").trim();
  if (!text) return;
  if (!state.activeChatUserId) {
    setStatus("Select a match to start chatting.", "error");
    return;
  }

  try {
    await authRequest("/messages", {
      method: "POST",
      body: {
        toUserId: state.activeChatUserId,
        text
      }
    });
    messageInput.value = "";
    await loadThread();
    setStatus("Message sent.", "success");
  } catch (error) {
    setStatus(error.message, "error");
  }
}

function hydrateProfileForm() {
  if (!state.user) return;
  profileForm.elements.name.value = state.user.name || "";
  profileForm.elements.bio.value = state.user.bio || "";
  profileForm.elements.city.value = state.user.city || "";
  profileForm.elements.occupation.value = state.user.occupation || "";
  profileForm.elements.relationshipIntent.value = state.user.relationshipIntent || "long_term";
  profileForm.elements.minAgePreferred.value = Number(state.user.minAgePreferred || 21);
  profileForm.elements.maxAgePreferred.value = Number(state.user.maxAgePreferred || 45);
  profileForm.elements.maxDistanceKm.value = Number(state.user.maxDistanceKm || 30);

  state.profileInterests = Array.isArray(state.user.interests)
    ? state.user.interests.map((value) => String(value || "")).filter(Boolean)
    : [];
  state.profilePhotos = Array.isArray(state.user.photos) ? state.user.photos.filter(Boolean) : [];
  state.profileMainPhoto = String(state.user.mainPhoto || state.profilePhotos[0] || "");
  state.profileLat = Number.isFinite(Number(state.user.lat)) ? Number(state.user.lat) : null;
  state.profileLon = Number.isFinite(Number(state.user.lon)) ? Number(state.user.lon) : null;

  renderProfileInterestTags();
  renderProfilePhotoPreview();
  renderProfileLocationHint();
}

async function saveProfile() {
  const formData = new FormData(profileForm);
  const payload = {
    name: String(formData.get("name") || "").trim(),
    bio: String(formData.get("bio") || "").trim(),
    city: String(formData.get("city") || "").trim(),
    occupation: String(formData.get("occupation") || "").trim(),
    interests: state.profileInterests.map((value) => value.toLowerCase()),
    photos: state.profilePhotos,
    mainPhoto: state.profileMainPhoto,
    relationshipIntent: String(formData.get("relationshipIntent") || "long_term"),
    minAgePreferred: Number(formData.get("minAgePreferred") || 21),
    maxAgePreferred: Number(formData.get("maxAgePreferred") || 45),
    maxDistanceKm: Number(formData.get("maxDistanceKm") || 30)
  };

  if (Number.isFinite(state.profileLat)) payload.lat = state.profileLat;
  if (Number.isFinite(state.profileLon)) payload.lon = state.profileLon;

  try {
    const result = await authRequest("/auth/profile", {
      method: "POST",
      body: payload
    });
    state.user = result.user;
    userBadge.textContent = state.user.name || "Member";
    hydrateProfileForm();
    setStatus("Profile updated.", "success");
    state.queue = [];
    state.cursor = 0;
    state.exhausted = false;
    await loadFeed();
    await Promise.all([loadMatches(), loadInbox()]);
    renderDeck();
    renderMatches();
    renderInbox();
  } catch (error) {
    setStatus(error.message, "error");
  }
}

function addProfileInterest(value) {
  const interest = String(value || "").trim();
  if (!interest) return;
  if (state.profileInterests.includes(interest)) return;
  if (state.profileInterests.length >= 10) {
    setStatus("You can add up to 10 interests.", "error");
    return;
  }

  state.profileInterests.push(interest);
  renderProfileInterestTags();
}

function removeProfileInterest(value) {
  state.profileInterests = state.profileInterests.filter((interest) => interest !== value);
  renderProfileInterestTags();
}

function renderProfileInterestTags() {
  if (!profileInterestTags) return;
  profileInterestTags.innerHTML = "";

  if (!state.profileInterests.length) {
    profileInterestTags.innerHTML = '<span class="interest-tag">No interests selected</span>';
  } else {
    state.profileInterests.forEach((value) => {
      const chip = document.createElement("span");
      chip.className = "interest-tag";
      chip.textContent = value;

      const removeBtn = document.createElement("button");
      removeBtn.type = "button";
      removeBtn.textContent = "x";
      removeBtn.setAttribute("aria-label", `Remove ${value}`);
      removeBtn.addEventListener("click", () => removeProfileInterest(value));

      chip.appendChild(removeBtn);
      profileInterestTags.appendChild(chip);
    });
  }

  if (profileInterestsInput) {
    profileInterestsInput.value = state.profileInterests.join(",");
  }
}

function populateInterestOptions(selectEl) {
  if (!selectEl) return;
  const values = INTEREST_OPTIONS.slice().sort((a, b) => a.localeCompare(b));
  values.forEach((value) => {
    const option = document.createElement("option");
    option.value = value;
    option.textContent = value;
    selectEl.appendChild(option);
  });
}

function addProfilePhoto(value) {
  const photo = normalizePhotoValue(value);
  if (!photo) return;
  if (state.profilePhotos.includes(photo)) return;
  if (state.profilePhotos.length >= MAX_PHOTOS) {
    setStatus(`You can add up to ${MAX_PHOTOS} photos.`, "error");
    return;
  }

  state.profilePhotos.push(photo);
  if (!state.profileMainPhoto) {
    state.profileMainPhoto = photo;
  }
  renderProfilePhotoPreview();
}

function removeProfilePhoto(value) {
  state.profilePhotos = state.profilePhotos.filter((photo) => photo !== value);
  if (state.profileMainPhoto === value) {
    state.profileMainPhoto = state.profilePhotos[0] || "";
  }
  renderProfilePhotoPreview();
}

function setMainProfilePhoto(value) {
  if (!state.profilePhotos.includes(value)) return;
  state.profileMainPhoto = value;
  renderProfilePhotoPreview();
}

function renderProfilePhotoPreview() {
  if (!profilePhotoPreview) return;
  profilePhotoPreview.innerHTML = "";

  if (!state.profilePhotos.length) {
    profilePhotoPreview.innerHTML = '<p class="photo-empty">No photos added yet.</p>';
    return;
  }

  state.profilePhotos.forEach((value, index) => {
    const card = document.createElement("div");
    card.className = "photo-card";

    const img = document.createElement("img");
    img.src = value;
    img.alt = `Profile photo ${index + 1}`;

    const controls = document.createElement("div");
    controls.className = "photo-card__controls";

    const mainBtn = document.createElement("button");
    mainBtn.type = "button";
    mainBtn.textContent = state.profileMainPhoto === value ? "Main photo" : "Set main";
    if (state.profileMainPhoto === value) {
      mainBtn.classList.add("is-main");
    }
    mainBtn.addEventListener("click", () => setMainProfilePhoto(value));

    const removeBtn = document.createElement("button");
    removeBtn.type = "button";
    removeBtn.textContent = "Remove";
    removeBtn.addEventListener("click", () => removeProfilePhoto(value));

    controls.appendChild(mainBtn);
    controls.appendChild(removeBtn);

    card.appendChild(img);
    card.appendChild(controls);
    profilePhotoPreview.appendChild(card);
  });
}

async function captureProfileLocation() {
  if (!navigator.geolocation) {
    setStatus("Geolocation is not supported in this browser.", "error");
    return;
  }

  profileUseLocationBtn.disabled = true;
  profileUseLocationBtn.textContent = "Locating...";
  try {
    const position = await getCurrentPosition({ enableHighAccuracy: true, timeout: 10000 });
    state.profileLat = Number(position.coords.latitude.toFixed(6));
    state.profileLon = Number(position.coords.longitude.toFixed(6));
    renderProfileLocationHint();
    setStatus("Location captured. Save profile to apply.", "success");
  } catch (error) {
    setStatus("Could not get your location. You can still save profile.", "error");
  } finally {
    profileUseLocationBtn.disabled = false;
    profileUseLocationBtn.textContent = "Use current location";
  }
}

function renderProfileLocationHint() {
  if (!profileLocationHint) return;
  if (!Number.isFinite(state.profileLat) || !Number.isFinite(state.profileLon)) {
    profileLocationHint.textContent = "No precise location set yet.";
    return;
  }
  profileLocationHint.textContent = `Location set: ${state.profileLat.toFixed(4)}, ${state.profileLon.toFixed(
    4
  )}`;
}

function normalizePhotoValue(value) {
  const photo = String(value || "").trim();
  if (!isAcceptedPhotoValue(photo)) return "";
  return photo;
}

function isAcceptedPhotoValue(value) {
  const photo = String(value || "").trim();
  return /^https?:\/\//i.test(photo) || /^data:image\//i.test(photo) || /^\/assets\//i.test(photo);
}

function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(new Error("READ_FAILED"));
    reader.readAsDataURL(file);
  });
}

function getCurrentPosition(options) {
  return new Promise((resolve, reject) => {
    navigator.geolocation.getCurrentPosition(resolve, reject, options);
  });
}

function formatDistanceKm(lat1, lon1, lat2, lon2) {
  const aLat = Number(lat1);
  const aLon = Number(lon1);
  const bLat = Number(lat2);
  const bLon = Number(lon2);
  if (![aLat, aLon, bLat, bLon].every((value) => Number.isFinite(value))) {
    return "";
  }

  const distance = haversineDistanceKm(aLat, aLon, bLat, bLon);
  if (!Number.isFinite(distance)) return "";
  return `${Math.round(distance)} km away`;
}

function haversineDistanceKm(lat1, lon1, lat2, lon2) {
  const radiusKm = 6371;
  const dLat = toRadians(lat2 - lat1);
  const dLon = toRadians(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRadians(lat1)) *
      Math.cos(toRadians(lat2)) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return radiusKm * c;
}

function toRadians(deg) {
  return (deg * Math.PI) / 180;
}

function escapeCssUrl(value) {
  return String(value).replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

async function logout() {
  const session = readSession();
  clearSession();
  if (session?.refreshToken) {
    try {
      await jsonRequest("/auth/logout", {
        method: "POST",
        body: { refreshToken: session.refreshToken }
      });
    } catch (error) {
      // ignore
    }
  }
  window.location.href = "/auth";
}

async function authRequest(url, options = {}) {
  const session = readSession();
  if (!session) {
    throw new Error("Session missing. Sign in again.");
  }

  try {
    return await jsonRequest(url, {
      ...options,
      headers: {
        ...(options.headers || {}),
        Authorization: `Bearer ${session.accessToken}`
      }
    });
  } catch (error) {
    if (error.status !== 401) throw error;

    const refreshed = await tryRefresh(session.refreshToken);
    if (!refreshed) {
      clearSession();
      window.location.href = "/auth";
      throw new Error("Session expired. Sign in again.");
    }

    return jsonRequest(url, {
      ...options,
      headers: {
        ...(options.headers || {}),
        Authorization: `Bearer ${refreshed.accessToken}`
      }
    });
  }
}

async function tryRefresh(refreshToken) {
  if (!refreshToken) return null;
  try {
    const response = await jsonRequest("/auth/refresh", {
      method: "POST",
      body: { refreshToken }
    });
    saveSession(response);
    return readSession();
  } catch (error) {
    return null;
  }
}

async function jsonRequest(url, options = {}) {
  const response = await fetch(url, {
    method: options.method || "GET",
    headers: {
      "Content-Type": "application/json",
      ...(options.headers || {})
    },
    body: options.body ? JSON.stringify(options.body) : undefined
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(data.error || "Request failed.");
    error.status = response.status;
    throw error;
  }
  return data;
}

function friendlyIntent(intent) {
  const value = String(intent || "").toLowerCase();
  if (value === "long_term") return "Long-term";
  if (value === "casual") return "Casual";
  if (value === "friendship") return "Friendship";
  return "Open";
}

function formatTime(isoString) {
  const date = new Date(isoString);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleString();
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function readSession() {
  const raw = localStorage.getItem(AUTH_STORAGE_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch (error) {
    return null;
  }
}

function saveSession(session) {
  localStorage.setItem(
    AUTH_STORAGE_KEY,
    JSON.stringify({
      accessToken: session.accessToken,
      refreshToken: session.refreshToken,
      accessExpiresAt: session.accessExpiresAt,
      refreshExpiresAt: session.refreshExpiresAt
    })
  );
}

function clearSession() {
  localStorage.removeItem(AUTH_STORAGE_KEY);
}

function setStatus(message, type = "") {
  statusEl.textContent = message || "";
  statusEl.classList.remove("status--error", "status--success");
  if (type === "error") statusEl.classList.add("status--error");
  if (type === "success") statusEl.classList.add("status--success");
}

function clearStatus() {
  setStatus("");
}