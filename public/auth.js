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

const tabButtons = Array.from(document.querySelectorAll(".tab"));
const joinPanel = document.getElementById("joinPanel");
const loginPanel = document.getElementById("loginPanel");
const joinForm = document.getElementById("joinForm");
const loginForm = document.getElementById("loginForm");
const backBtn = document.getElementById("backBtn");
const nextBtn = document.getElementById("nextBtn");
const statusEl = document.getElementById("status");
const stepNodes = Array.from(document.querySelectorAll(".stepper__item"));
const stepPanels = Array.from(document.querySelectorAll(".form-step"));
const emailCodeInput = document.getElementById("emailCodeInput");
const phoneCodeInput = document.getElementById("phoneCodeInput");
const verifyEmailBtn = document.getElementById("verifyEmailBtn");
const verifyPhoneBtn = document.getElementById("verifyPhoneBtn");
const resendEmailCode = document.getElementById("resendEmailCode");
const resendPhoneCode = document.getElementById("resendPhoneCode");
const devCodes = document.getElementById("devCodes");
const deliveryStatusEl = document.getElementById("deliveryStatus");

const useLocationBtn = document.getElementById("useLocationBtn");
const locationHint = document.getElementById("locationHint");
const photoUrlInput = document.getElementById("photoUrlInput");
const addPhotoUrlBtn = document.getElementById("addPhotoUrlBtn");
const photoFileInput = document.getElementById("photoFileInput");
const photoPreview = document.getElementById("photoPreview");
const interestSelect = document.getElementById("interestSelect");
const addInterestBtn = document.getElementById("addInterestBtn");
const interestTags = document.getElementById("interestTags");

const state = {
  tab: "join",
  step: 1,
  accountCreated: false,
  pendingUserId: "",
  pendingIdentifier: "",
  pendingPassword: "",
  emailVerified: false,
  phoneVerified: false,
  interests: [],
  photos: [],
  mainPhoto: "",
  lat: null,
  lon: null,
  delivery: null
};

tabButtons.forEach((button) => {
  button.addEventListener("click", () => switchTab(button.dataset.tab));
});

backBtn.addEventListener("click", () => {
  if (state.step > 1) {
    state.step -= 1;
    syncStepUI();
    clearStatus();
  }
});

nextBtn.addEventListener("click", async () => {
  clearStatus();
  if (state.step === 1) {
    if (!validateStepOne()) return;
    state.step = 2;
    syncStepUI();
    return;
  }

  if (state.step === 2) {
    if (!validateStepTwo()) return;
    if (state.accountCreated) {
      state.step = 3;
      syncStepUI();
      return;
    }
    await createAccount();
    return;
  }

  if (!state.accountCreated) {
    setStatus("Create your account first.", "error");
    return;
  }

  if (!state.emailVerified || !state.phoneVerified) {
    setStatus("Verify both email and phone to continue.", "error");
    return;
  }

  await login(state.pendingIdentifier, state.pendingPassword);
});

loginForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  clearStatus();
  const formData = new FormData(loginForm);
  const identifier = String(formData.get("identifier") || "").trim();
  const password = String(formData.get("password") || "");
  await login(identifier, password);
});

verifyEmailBtn.addEventListener("click", async () => {
  clearStatus();
  if (!state.accountCreated || !state.pendingUserId) {
    setStatus("Create account first.", "error");
    return;
  }
  const code = String(emailCodeInput.value || "").trim();
  if (!code) {
    setStatus("Enter your email code.", "error");
    return;
  }
  try {
    const response = await jsonRequest("/auth/verify-email", {
      method: "POST",
      body: { userId: state.pendingUserId, code }
    });
    state.emailVerified = Boolean(response.user?.verifiedEmail);
    setStatus("Email verified successfully.", "success");
    syncStepUI();
  } catch (error) {
    setStatus(error.message, "error");
  }
});

verifyPhoneBtn.addEventListener("click", async () => {
  clearStatus();
  if (!state.accountCreated || !state.pendingUserId) {
    setStatus("Create account first.", "error");
    return;
  }
  const code = String(phoneCodeInput.value || "").trim();
  if (!code) {
    setStatus("Enter your phone code.", "error");
    return;
  }
  try {
    const response = await jsonRequest("/auth/verify-phone", {
      method: "POST",
      body: { userId: state.pendingUserId, code }
    });
    state.phoneVerified = Boolean(response.user?.verifiedPhone);
    setStatus("Phone verified successfully.", "success");
    syncStepUI();
  } catch (error) {
    setStatus(error.message, "error");
  }
});

resendEmailCode.addEventListener("click", async () => {
  clearStatus();
  if (!state.pendingUserId) {
    setStatus("Create account first.", "error");
    return;
  }
  try {
    const response = await jsonRequest("/auth/send-email-code", {
      method: "POST",
      body: { userId: state.pendingUserId }
    });
    if (response.delivery) {
      state.delivery = state.delivery || {};
      state.delivery.email = response.delivery;
      renderDeliveryStatus();
    }
    if (response.devCode) {
      showDevCodes(`Email dev code: ${response.devCode}`);
    }
    setStatus("Email code sent.", "success");
  } catch (error) {
    setStatus(error.message, "error");
  }
});

resendPhoneCode.addEventListener("click", async () => {
  clearStatus();
  if (!state.pendingUserId) {
    setStatus("Create account first.", "error");
    return;
  }
  try {
    const response = await jsonRequest("/auth/send-phone-code", {
      method: "POST",
      body: { userId: state.pendingUserId }
    });
    if (response.delivery) {
      state.delivery = state.delivery || {};
      state.delivery.phone = response.delivery;
      renderDeliveryStatus();
    }
    if (response.devCode) {
      showDevCodes(`Phone dev code: ${response.devCode}`);
    }
    setStatus("Phone code sent.", "success");
  } catch (error) {
    setStatus(error.message, "error");
  }
});

addPhotoUrlBtn?.addEventListener("click", () => {
  const value = String(photoUrlInput.value || "").trim();
  if (!value) return;
  if (!isAcceptedPhotoValue(value)) {
    setStatus("Use a valid image URL (http/https).", "error");
    return;
  }
  addPhoto(value);
  photoUrlInput.value = "";
  clearStatus();
});

photoFileInput?.addEventListener("change", async (event) => {
  const files = Array.from(event.target.files || []);
  if (!files.length) return;

  for (const file of files) {
    if (state.photos.length >= MAX_PHOTOS) break;
    if (!file.type.startsWith("image/")) continue;
    try {
      const dataUrl = await readFileAsDataUrl(file);
      addPhoto(dataUrl);
    } catch (error) {
      setStatus("One photo could not be read.", "error");
    }
  }

  photoFileInput.value = "";
  clearStatus();
});

useLocationBtn?.addEventListener("click", async () => {
  clearStatus();
  await captureLocation();
});

addInterestBtn?.addEventListener("click", () => {
  const value = String(interestSelect?.value || "").trim();
  if (!value) return;
  addInterest(value);
  if (interestSelect) interestSelect.value = "";
});

initialize();

async function initialize() {
  populateInterestOptions(interestSelect);
  switchTab("join");
  syncStepUI();
  renderInterestTags();
  renderPhotoPreview();
  renderLocationHint();
  clearDeliveryStatus();

  const session = readSession();
  if (!session) return;

  try {
    await authRequest("/auth/me", { method: "GET" });
    window.location.href = "/app";
  } catch (error) {
    clearSession();
  }
}

function switchTab(tabName) {
  state.tab = tabName === "login" ? "login" : "join";
  tabButtons.forEach((button) => {
    button.classList.toggle("tab--active", button.dataset.tab === state.tab);
  });
  joinPanel.classList.toggle("panel--hidden", state.tab !== "join");
  loginPanel.classList.toggle("panel--hidden", state.tab !== "login");
  clearStatus();
}

function syncStepUI() {
  stepNodes.forEach((node) => {
    node.classList.toggle(
      "stepper__item--active",
      Number(node.getAttribute("data-step-index")) === state.step
    );
  });

  stepPanels.forEach((panel) => {
    panel.classList.toggle("form-step--active", Number(panel.getAttribute("data-step")) === state.step);
  });

  backBtn.disabled = state.step === 1;

  if (state.step === 1) {
    nextBtn.textContent = "Continue";
    return;
  }

  if (state.step === 2) {
    nextBtn.textContent = state.accountCreated ? "Continue to verify" : "Create Account";
    return;
  }

  if (state.accountCreated && state.emailVerified && state.phoneVerified) {
    nextBtn.textContent = "Enter App";
  } else {
    nextBtn.textContent = "I verified";
  }
}

function validateStepOne() {
  const requiredNames = ["name", "email", "phone", "password", "birthDate"];
  for (const name of requiredNames) {
    const input = joinForm.elements[name];
    if (!input || !input.checkValidity()) {
      input?.reportValidity?.();
      setStatus("Please complete all required account details.", "error");
      return false;
    }
  }

  const password = String(joinForm.elements.password.value || "");
  if (!(/[a-z]/.test(password) && /[A-Z]/.test(password) && /\d/.test(password))) {
    setStatus("Password must include uppercase, lowercase, and a number.", "error");
    return false;
  }

  const age = calculateAge(String(joinForm.elements.birthDate.value || ""));
  if (!Number.isFinite(age) || age < 18) {
    setStatus("You must be at least 18 years old.", "error");
    return false;
  }

  return true;
}

function validateStepTwo() {
  const selectedGenders = getLookingFor();
  if (!selectedGenders.length) {
    setStatus("Select at least one gender preference.", "error");
    return false;
  }

  const minAge = Number(joinForm.elements.minAgePreferred.value || 18);
  const maxAge = Number(joinForm.elements.maxAgePreferred.value || 99);
  if (minAge > maxAge) {
    setStatus("Minimum preferred age cannot be greater than maximum age.", "error");
    return false;
  }

  if (!state.photos.length) {
    setStatus("Add at least one profile photo.", "error");
    return false;
  }

  if (!state.interests.length) {
    setStatus("Pick at least one interest.", "error");
    return false;
  }

  return true;
}

async function createAccount() {
  const payload = collectPayload();
  try {
    const response = await jsonRequest("/auth/register", {
      method: "POST",
      body: payload
    });

    state.accountCreated = true;
    state.pendingUserId = response.user.id;
    state.pendingIdentifier = payload.email;
    state.pendingPassword = payload.password;
    state.emailVerified = Boolean(response.user.verifiedEmail);
    state.phoneVerified = Boolean(response.user.verifiedPhone);
    state.delivery = response.delivery || null;
    renderDeliveryStatus();
    state.step = 3;
    syncStepUI();

    if (response.devCodes) {
      showDevCodes(
        `Dev codes - Email: ${response.devCodes.emailCode} | Phone: ${response.devCodes.phoneCode}`
      );
    }

    setStatus("Account created. Verify both codes to activate sign in.", "success");
  } catch (error) {
    setStatus(error.message, "error");
  }
}

async function login(identifier, password) {
  try {
    const response = await jsonRequest("/auth/login", {
      method: "POST",
      body: { identifier, password }
    });
    saveSession(response);
    setStatus("Signed in. Redirecting to app...", "success");
    window.setTimeout(() => {
      window.location.href = "/app";
    }, 500);
  } catch (error) {
    setStatus(error.message, "error");
  }
}

function collectPayload() {
  const payload = {
    name: String(joinForm.elements.name.value || "").trim(),
    email: String(joinForm.elements.email.value || "").trim(),
    phone: String(joinForm.elements.phone.value || "").trim(),
    password: String(joinForm.elements.password.value || ""),
    birthDate: String(joinForm.elements.birthDate.value || ""),
    gender: String(joinForm.elements.gender.value || "unknown"),
    lookingForGenders: getLookingFor(),
    interests: state.interests.map((value) => value.toLowerCase()),
    relationshipIntent: String(joinForm.elements.relationshipIntent.value || "long_term"),
    bio: String(joinForm.elements.bio.value || "").trim(),
    city: String(joinForm.elements.city.value || "").trim(),
    occupation: String(joinForm.elements.occupation.value || "").trim(),
    photos: state.photos,
    mainPhoto: state.mainPhoto,
    minAgePreferred: Number(joinForm.elements.minAgePreferred.value || 21),
    maxAgePreferred: Number(joinForm.elements.maxAgePreferred.value || 45),
    maxDistanceKm: Number(joinForm.elements.maxDistanceKm.value || 30)
  };

  if (Number.isFinite(state.lat)) payload.lat = state.lat;
  if (Number.isFinite(state.lon)) payload.lon = state.lon;

  return payload;
}

function getLookingFor() {
  return Array.from(joinForm.querySelectorAll('input[name="lookingForGenders"]:checked')).map(
    (input) => input.value
  );
}

function addPhoto(value) {
  if (!isAcceptedPhotoValue(value)) return;
  if (state.photos.includes(value)) return;
  if (state.photos.length >= MAX_PHOTOS) {
    setStatus(`You can add up to ${MAX_PHOTOS} photos.`, "error");
    return;
  }
  state.photos.push(value);
  if (!state.mainPhoto) {
    state.mainPhoto = value;
  }
  renderPhotoPreview();
}

function addInterest(value) {
  const interest = String(value || "").trim();
  if (!interest) return;
  if (state.interests.includes(interest)) return;
  if (state.interests.length >= 10) {
    setStatus("You can add up to 10 interests.", "error");
    return;
  }

  state.interests.push(interest);
  renderInterestTags();
}

function removeInterest(value) {
  state.interests = state.interests.filter((interest) => interest !== value);
  renderInterestTags();
}

function renderInterestTags() {
  if (!interestTags) return;
  interestTags.innerHTML = "";

  if (!state.interests.length) {
    interestTags.innerHTML = '<span class="interest-tag">No interests selected</span>';
  } else {
    state.interests.forEach((value) => {
      const chip = document.createElement("span");
      chip.className = "interest-tag";
      chip.textContent = value;

      const removeBtn = document.createElement("button");
      removeBtn.type = "button";
      removeBtn.textContent = "x";
      removeBtn.setAttribute("aria-label", `Remove ${value}`);
      removeBtn.addEventListener("click", () => removeInterest(value));

      chip.appendChild(removeBtn);
      interestTags.appendChild(chip);
    });
  }

  syncInterestsInput();
}

function syncInterestsInput() {
  const hiddenInput = joinForm.elements.interests;
  if (!hiddenInput) return;
  hiddenInput.value = state.interests.join(",");
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

function removePhoto(value) {
  state.photos = state.photos.filter((photo) => photo !== value);
  if (state.mainPhoto === value) {
    state.mainPhoto = state.photos[0] || "";
  }
  renderPhotoPreview();
}

function setMainPhoto(value) {
  if (!state.photos.includes(value)) return;
  state.mainPhoto = value;
  renderPhotoPreview();
}

function renderPhotoPreview() {
  if (!photoPreview) return;
  photoPreview.innerHTML = "";

  if (!state.photos.length) {
    photoPreview.innerHTML = '<p class="photo-empty">No photos added yet.</p>';
    return;
  }

  state.photos.forEach((value, index) => {
    const card = document.createElement("div");
    card.className = "photo-card";

    const img = document.createElement("img");
    img.src = value;
    img.alt = `Profile photo ${index + 1}`;
    card.appendChild(img);

    const controls = document.createElement("div");
    controls.className = "photo-card__controls";

    const coverBtn = document.createElement("button");
    coverBtn.type = "button";
    coverBtn.textContent = state.mainPhoto === value ? "Main photo" : "Set main";
    coverBtn.className = state.mainPhoto === value ? "is-main" : "";
    coverBtn.addEventListener("click", () => setMainPhoto(value));

    const removeBtn = document.createElement("button");
    removeBtn.type = "button";
    removeBtn.textContent = "Remove";
    removeBtn.addEventListener("click", () => removePhoto(value));

    controls.appendChild(coverBtn);
    controls.appendChild(removeBtn);
    card.appendChild(controls);
    photoPreview.appendChild(card);
  });
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

async function captureLocation() {
  if (!navigator.geolocation) {
    setStatus("Geolocation is not supported on this browser.", "error");
    return;
  }

  if (useLocationBtn) {
    useLocationBtn.disabled = true;
    useLocationBtn.textContent = "Locating...";
  }

  try {
    const position = await getCurrentPosition({ enableHighAccuracy: true, timeout: 10000 });
    state.lat = Number(position.coords.latitude.toFixed(6));
    state.lon = Number(position.coords.longitude.toFixed(6));
    renderLocationHint();
    setStatus("Location captured successfully.", "success");
  } catch (error) {
    setStatus("Could not get your location. You can still continue.", "error");
  } finally {
    if (useLocationBtn) {
      useLocationBtn.disabled = false;
      useLocationBtn.textContent = "Use current location";
    }
  }
}

function getCurrentPosition(options) {
  return new Promise((resolve, reject) => {
    navigator.geolocation.getCurrentPosition(resolve, reject, options);
  });
}

function renderLocationHint() {
  if (!locationHint) return;
  if (!Number.isFinite(state.lat) || !Number.isFinite(state.lon)) {
    locationHint.textContent = "No location selected yet.";
    return;
  }
  locationHint.textContent = `Location set: ${state.lat.toFixed(4)}, ${state.lon.toFixed(4)}`;
}

function renderDeliveryStatus() {
  if (!deliveryStatusEl) return;
  if (!state.delivery) {
    clearDeliveryStatus();
    return;
  }

  const email = state.delivery.email;
  const phone = state.delivery.phone;

  const emailLabel = formatDeliveryChannel("Email", email);
  const phoneLabel = formatDeliveryChannel("Phone", phone);
  deliveryStatusEl.textContent = `${emailLabel} | ${phoneLabel}`;

  const ok = Boolean(email?.delivered) && Boolean(phone?.delivered);
  deliveryStatusEl.classList.toggle("delivery-status--ok", ok);
  deliveryStatusEl.classList.toggle("delivery-status--warn", !ok);
}

function clearDeliveryStatus() {
  if (!deliveryStatusEl) return;
  deliveryStatusEl.textContent = "";
  deliveryStatusEl.classList.remove("delivery-status--ok", "delivery-status--warn");
}

function formatDeliveryChannel(label, delivery) {
  if (!delivery) return `${label}: pending`;
  if (delivery.delivered) {
    const provider = delivery.provider ? ` via ${delivery.provider}` : "";
    return `${label}: sent${provider}`;
  }
  const reason = delivery.reason ? ` (${delivery.reason})` : "";
  return `${label}: failed${reason}`;
}

async function authRequest(url, options) {
  const session = readSession();
  if (!session) {
    throw new Error("Not signed in.");
  }
  return jsonRequest(url, {
    ...options,
    headers: {
      ...(options?.headers || {}),
      Authorization: `Bearer ${session.accessToken}`
    }
  });
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
    throw new Error(data.error || "Request failed.");
  }
  return data;
}

function showDevCodes(message) {
  if (!message) return;
  devCodes.textContent = message;
  devCodes.classList.remove("dev-codes--hidden");
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

function readSession() {
  const raw = localStorage.getItem(AUTH_STORAGE_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch (error) {
    return null;
  }
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

function calculateAge(birthDate) {
  const dob = new Date(birthDate);
  if (Number.isNaN(dob.getTime())) return NaN;
  const now = new Date();
  let age = now.getUTCFullYear() - dob.getUTCFullYear();
  const monthDiff = now.getUTCMonth() - dob.getUTCMonth();
  const dayDiff = now.getUTCDate() - dob.getUTCDate();
  if (monthDiff < 0 || (monthDiff === 0 && dayDiff < 0)) {
    age -= 1;
  }
  return age;
}