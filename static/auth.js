document.addEventListener('DOMContentLoaded', () => {
  const loginBtn = document.getElementById('loginBtn');
  const registerBtn = document.getElementById('registerBtn');
  const forgotPasswordBtn = document.getElementById('forgotPasswordBtn');
  const backToAuthBtn = document.getElementById('backToAuthBtn');
  const authError = document.getElementById('auth-error');
  const authUsernameInput = document.getElementById("auth-username");
  const usernameWarning = document.getElementById("username-warning");
  const authLevelSelect = document.getElementById('auth-level');
const params = new URLSearchParams(window.location.search);
  if (params.get("confirmed") === "1") {
    if (authError) {
      authError.textContent = "✅ Email confirmed! You can now log in.";
      authError.style.color = "white";
    }
    // Optional: remove the param to clean the URL
    window.history.replaceState({}, document.title, window.location.pathname);
  }
  window.sessionUser = null;
  window.sessionUserLevel = null;

  const sanitizeInput = str => str.replace(/[<>&"'`]/g, '');

  const normalizeLeetspeak = str => {
    const map = {
      '@': 'a', '4': 'a',
      '1': 'i', '!': 'i', 'l': 'i',
      '3': 'e',
      '0': 'o',
      '$': 's', '5': 's',
      '7': 't',
      '+': 't'
    };
    return str.toLowerCase().split('').map(c => map[c] || c).join('');
  };
authUsernameInput.addEventListener('input', () => {
  const username = authUsernameInput.value.trim();

  if (containsBadWord(username)) {
    usernameWarning.textContent = "🚫 This username contains inappropriate content.";
  } else {
    usernameWarning.textContent = "";
  }
});
  const containsBadWord = username => {
    const badWords = [
      "ass", "shit", "fuck", "bitch", "nigger", "fag", "cunt", "retard",
      "whore", "slut", "dick", "pussy", "nazi", "gay", "rape", "kill"
    ];
    const normalized = normalizeLeetspeak(username);
    return badWords.some(word => normalized.includes(word));
  };

  function getCSRFToken() {
  const token = document.querySelector('meta[name="csrf-token"]')?.getAttribute('content');
  if (!token) throw new Error("❌ Missing CSRF token in DOM. Login/register will fail.");
  return token;
}

  async function apiPost(url, data) {
    try {
      const response = await fetch(url, {
        method: "POST",
        headers: {
          'Content-Type': 'application/json',
          'X-CSRFToken': getCSRFToken()
        },
        body: JSON.stringify(data)
      });

      const text = await response.text();
      try {
        return JSON.parse(text);
      } catch (err) {
        console.error(`❌ API [${url}] returned non-JSON response:`, text);
        throw new Error(`Server error: non-JSON response received`);
      }
    } catch (networkError) {
      console.error("❌ Network or fetch failed:", networkError);
      throw networkError;
    }
  }

  const getSessionUser = async () => {
    const res = await fetch('/session_user');
    if (res.ok) {
      const data = await res.json();
      window.sessionUser = data || {};
      window.sessionUserLevel = data?.level || "Novice";
      return data;
    }
    return null;
  };

  loginBtn?.addEventListener('click', async () => {
    const username = sanitizeInput(document.getElementById('auth-username').value.trim());
    const password = document.getElementById('auth-password').value;

    if (!username || !password) {
      authError.textContent = "Username and password are required.";
      return;
    }

    const res = await apiPost('/login', { username, password });
    if (res.status === "success") {
      await getSessionUser();
      showScreen('difficulty-screen');
      enforceDifficultyPermissions();
    } else {
      authError.textContent = "Incorrect username or password.";
    }
  });

  registerBtn?.addEventListener('click', async () => {
    const username = sanitizeInput(document.getElementById('auth-username').value.trim());
    const password = document.getElementById('auth-password').value;
    const email = document.getElementById('auth-email').value.trim();
    const level = authLevelSelect.value;

    if (!username) {
  authError.textContent = "Username is required.";
  return;
}
if (!password) {
  authError.textContent = "Password is required.";
  return;
}
if (!email) {
  authError.textContent = "Email is required.";
  return;
}
if (!level) {
  authError.textContent = "Please select a level.";
  return;
}

    if (containsBadWord(username)) {
      authError.textContent = "That username is inappropriate.";
      return;
    }

    const res = await apiPost('/register', { username, password, email, level });
    if (res.status === "success") {
  authError.textContent = "📧 Registration successful. Please confirm your email before you Login.";
  authError.style.color = "white";
    } else {
      authError.textContent = (res.message === "Username already exists")
        ? "This username has already been taken."
        : "An error occurred during registration.";
    }
  });

  forgotPasswordBtn?.addEventListener('click', () => {
    showScreen('reset-screen');
  });

  backToAuthBtn?.addEventListener('click', () => {
    showScreen('auth-screen');
  });

const sendResetBtn = document.getElementById('sendResetLink');
const resetError = document.getElementById('reset-message');

sendResetBtn?.addEventListener('click', async () => {
  const email = document.getElementById('reset-email')?.value.trim();

  if (!email) {
    resetError.textContent = "❌ Email is required.";
    resetError.style.color = "red";
    return;
  }

  try {
    const res = await apiPost('/request_reset', { email });
    if (res.status === "success") {
      resetError.textContent = "✅ Reset link sent! Check your email.";
      resetError.style.color = "white";
    } else {
      resetError.textContent = res.message || "❌ Something went wrong.";
      resetError.style.color = "red";
    }
  } catch (err) {
    console.error("❌ Reset request failed:", err);
    resetError.textContent = "❌ Could not send reset link.";
    resetError.style.color = "red";
  }
});

  function enforceDifficultyPermissions() {
    const allowed = {
      "Novice": ["novice", "intermediate", "advanced"],
      "Intermediate": ["intermediate", "advanced"],
      "Advanced": ["advanced"]
    };

    const level = window.sessionUserLevel || "Novice";
    const allowedLevels = allowed[level];

    document.querySelectorAll('.difficulty-btn').forEach(btn => {
      const btnLevel = btn.getAttribute("data-level")?.toLowerCase();
      const allowedAccess = allowedLevels.includes(btnLevel);
      btn.disabled = !allowedAccess;
      btn.style.opacity = allowedAccess ? "1" : "0.4";
      btn.title = allowedAccess ? "" : `Locked for your level (${level})`;
    });
  }

  window.onload = async () => {
    showScreen('auth-screen');

    try {
      const res = await fetch('/session_user');
      if (!res.ok) {
        console.log("⚠️ Not logged in — no session user yet.");
        return;
      }
      const data = await res.json();
      window.sessionUser = data || {};
      window.sessionUserLevel = data?.level || "Novice";

      if (!window.sessionUserLevel) {
        console.warn("⚠️ No session level — treating as Novice temporarily.");
        window.sessionUserLevel = "Novice";
      }
      console.log("🔐 Session loaded:", data);
    } catch (err) {
      console.error("❌ Session check failed:", err);
    }
  };
});
