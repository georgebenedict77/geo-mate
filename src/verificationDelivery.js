const DEFAULT_APP_NAME = "GEO MATE";

async function sendVerificationEmail({ toEmail, code }) {
  const provider = (process.env.EMAIL_PROVIDER || "").trim().toLowerCase();
  if (!provider) {
    return {
      delivered: false,
      provider: "none",
      reason: "EMAIL_PROVIDER not configured"
    };
  }

  if (provider === "resend") {
    return sendWithResend({ toEmail, code });
  }
  if (provider === "sendgrid") {
    return sendWithSendGrid({ toEmail, code });
  }

  return {
    delivered: false,
    provider,
    reason: "Unsupported EMAIL_PROVIDER"
  };
}

async function sendVerificationSms({ toPhone, code }) {
  const provider = (process.env.SMS_PROVIDER || "").trim().toLowerCase();
  if (!provider) {
    return {
      delivered: false,
      provider: "none",
      reason: "SMS_PROVIDER not configured"
    };
  }

  if (provider === "twilio") {
    return sendWithTwilio({ toPhone, code });
  }

  return {
    delivered: false,
    provider,
    reason: "Unsupported SMS_PROVIDER"
  };
}

async function sendWithResend({ toEmail, code }) {
  const apiKey = String(process.env.RESEND_API_KEY || "").trim();
  const fromEmail = String(process.env.EMAIL_FROM || "").trim();
  if (!apiKey || !fromEmail) {
    return {
      delivered: false,
      provider: "resend",
      reason: "RESEND_API_KEY or EMAIL_FROM missing"
    };
  }

  const appName = process.env.APP_NAME || DEFAULT_APP_NAME;
  const payload = {
    from: fromEmail,
    to: [toEmail],
    subject: `${appName} verification code`,
    text: `${appName} verification code: ${code}. It expires in 10 minutes.`,
    html: `<p><strong>${appName}</strong> verification code:</p><p style="font-size:22px;letter-spacing:2px;"><strong>${code}</strong></p><p>Code expires in 10 minutes.</p>`
  };

  let response;
  let data;
  try {
    response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify(payload)
    });
    data = await response.json().catch(() => ({}));
  } catch (error) {
    return {
      delivered: false,
      provider: "resend",
      reason: `Network error: ${error.message}`
    };
  }

  if (!response.ok) {
    return {
      delivered: false,
      provider: "resend",
      reason: extractErrorMessage(data) || `HTTP ${response.status}`
    };
  }

  return {
    delivered: true,
    provider: "resend",
    messageId: data.id || null
  };
}

async function sendWithSendGrid({ toEmail, code }) {
  const apiKey = String(process.env.SENDGRID_API_KEY || "").trim();
  const fromEmail = String(process.env.EMAIL_FROM || "").trim();
  if (!apiKey || !fromEmail) {
    return {
      delivered: false,
      provider: "sendgrid",
      reason: "SENDGRID_API_KEY or EMAIL_FROM missing"
    };
  }

  const appName = process.env.APP_NAME || DEFAULT_APP_NAME;
  const payload = {
    personalizations: [{ to: [{ email: toEmail }] }],
    from: { email: fromEmail },
    subject: `${appName} verification code`,
    content: [
      {
        type: "text/plain",
        value: `${appName} verification code: ${code}. It expires in 10 minutes.`
      },
      {
        type: "text/html",
        value: `<p><strong>${appName}</strong> verification code:</p><p style="font-size:22px;letter-spacing:2px;"><strong>${code}</strong></p><p>Code expires in 10 minutes.</p>`
      }
    ]
  };

  let response;
  try {
    response = await fetch("https://api.sendgrid.com/v3/mail/send", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify(payload)
    });
  } catch (error) {
    return {
      delivered: false,
      provider: "sendgrid",
      reason: `Network error: ${error.message}`
    };
  }

  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    return {
      delivered: false,
      provider: "sendgrid",
      reason: extractErrorMessage(data) || `HTTP ${response.status}`
    };
  }

  return {
    delivered: true,
    provider: "sendgrid"
  };
}

async function sendWithTwilio({ toPhone, code }) {
  const accountSid = String(process.env.TWILIO_ACCOUNT_SID || "").trim();
  const authToken = String(process.env.TWILIO_AUTH_TOKEN || "").trim();
  const fromNumber = String(process.env.TWILIO_FROM_NUMBER || "").trim();
  if (!accountSid || !authToken || !fromNumber) {
    return {
      delivered: false,
      provider: "twilio",
      reason: "TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN or TWILIO_FROM_NUMBER missing"
    };
  }

  const appName = process.env.APP_NAME || DEFAULT_APP_NAME;
  const body = new URLSearchParams({
    To: toPhone,
    From: fromNumber,
    Body: `${appName} verification code: ${code}. Expires in 10 minutes.`
  });

  const auth = Buffer.from(`${accountSid}:${authToken}`).toString("base64");
  let response;
  let data;
  try {
    response = await fetch(
      `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`,
      {
        method: "POST",
        headers: {
          Authorization: `Basic ${auth}`,
          "Content-Type": "application/x-www-form-urlencoded"
        },
        body
      }
    );
    data = await response.json().catch(() => ({}));
  } catch (error) {
    return {
      delivered: false,
      provider: "twilio",
      reason: `Network error: ${error.message}`
    };
  }

  if (!response.ok) {
    return {
      delivered: false,
      provider: "twilio",
      reason: extractErrorMessage(data) || `HTTP ${response.status}`
    };
  }

  return {
    delivered: true,
    provider: "twilio",
    messageId: data.sid || null
  };
}

function extractErrorMessage(data) {
  if (!data || typeof data !== "object") return "";
  if (typeof data.message === "string") return data.message;
  if (Array.isArray(data.errors) && data.errors.length) {
    const first = data.errors[0];
    if (typeof first === "string") return first;
    if (first && typeof first.message === "string") return first.message;
  }
  return "";
}

module.exports = {
  sendVerificationEmail,
  sendVerificationSms
};
