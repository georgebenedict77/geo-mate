const splash = document.getElementById("splash");
const waitlistForm = document.getElementById("waitlistForm");
const waitlistStatus = document.getElementById("waitlistStatus");
const installAppBtn = document.getElementById("installAppBtn");
let deferredInstallPrompt = null;

initializePwa();

function closeSplash() {
  if (!splash) return;
  splash.classList.add("splash--fade");
  window.setTimeout(() => {
    splash.remove();
    document.body.classList.add("ready");
  }, 540);
}

window.addEventListener("load", () => {
  window.setTimeout(closeSplash, 1400);
});

document.addEventListener("click", (event) => {
  const anchor = event.target.closest('a[href^="#"]');
  if (!anchor) return;
  const href = anchor.getAttribute("href");
  if (!href || href === "#") return;
  const target = document.querySelector(href);
  if (!target) return;
  event.preventDefault();
  target.scrollIntoView({ behavior: "smooth", block: "start" });
});

waitlistForm?.addEventListener("submit", async (event) => {
  event.preventDefault();
  setWaitlistStatus("");

  const formData = new FormData(waitlistForm);
  const payload = {
    name: String(formData.get("name") || "").trim(),
    email: String(formData.get("email") || "").trim()
  };

  if (!payload.name || !payload.email) {
    setWaitlistStatus("Please enter both name and email.", "error");
    return;
  }

  try {
    const response = await fetch("/waitlist", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(data.error || "Could not join waitlist.");
    }
    waitlistForm.reset();
    setWaitlistStatus("You are on the list. We will notify you soon.", "success");
  } catch (error) {
    setWaitlistStatus(error.message || "Could not join waitlist.", "error");
  }
});

function setWaitlistStatus(message, type = "") {
  if (!waitlistStatus) return;
  waitlistStatus.textContent = message || "";
  waitlistStatus.classList.remove("waitlist-status--error", "waitlist-status--success");
  if (type === "error") waitlistStatus.classList.add("waitlist-status--error");
  if (type === "success") waitlistStatus.classList.add("waitlist-status--success");
}

function initializePwa() {
  registerServiceWorker();

  window.addEventListener("beforeinstallprompt", (event) => {
    event.preventDefault();
    deferredInstallPrompt = event;
    installAppBtn?.classList.remove("btn-install-hidden");
  });

  installAppBtn?.addEventListener("click", async () => {
    if (!deferredInstallPrompt) return;
    deferredInstallPrompt.prompt();
    try {
      const choice = await deferredInstallPrompt.userChoice;
      if (choice?.outcome === "accepted") {
        installAppBtn.classList.add("btn-install-hidden");
      }
    } finally {
      deferredInstallPrompt = null;
    }
  });

  window.addEventListener("appinstalled", () => {
    deferredInstallPrompt = null;
    installAppBtn?.classList.add("btn-install-hidden");
  });
}

function registerServiceWorker() {
  if (!("serviceWorker" in navigator)) return;
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/sw.js").catch(() => {
      // Ignore service worker registration failures.
    });
  });
}
