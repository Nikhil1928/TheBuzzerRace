document.addEventListener("DOMContentLoaded", () => {
  const registerBtn = document.getElementById("registerBtn");
  const errorBox = document.getElementById("register-error");
  const warningBox = document.getElementById("username-warning");

  const BAD_WORDS = [
    "ass", "shit", "fuck", "bitch", "nigger", "fag", "cunt", "retard",
    "whore", "slut", "dick", "pussy", "nazi", "gay", "rape", "kill"
  ];

  const LEET_REPLACEMENTS = {
    '@': 'a', '4': 'a', '1': 'i', '!': 'i', 'l': 'i',
    '3': 'e', '0': 'o', '$': 's', '5': 's', '7': 't', '+': 't'
  };

  function normalizeLeetspeak(str) {
    return str.toLowerCase().split('').map(c => LEET_REPLACEMENTS[c] || c).join('');
  }

  function containsBadWord(username) {
    const normalized = normalizeLeetspeak(username);
    return BAD_WORDS.some(word => normalized.includes(word));
  }

  function getCSRFToken() {
    return document.querySelector('meta[name="csrf-token"]').getAttribute('content');
  }

  document.getElementById("register-username").addEventListener("input", e => {
    const username = e.target.value.trim();
    warningBox.textContent = containsBadWord(username) ? "🚫 This username contains inappropriate content." : "";
  });

  registerBtn.addEventListener("click", async () => {
    const username = document.getElementById("register-username").value.trim();
    const password = document.getElementById("register-password").value;
    const email = document.getElementById("register-email").value.trim();
    const level = document.getElementById("register-level").value;

    if (!username || !password || !email || !level) {
      errorBox.textContent = "All fields are required.";
      return;
    }

    if (containsBadWord(username)) {
      errorBox.textContent = "That username is inappropriate.";
      return;
    }

    const res = await fetch("/register", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-CSRFToken": getCSRFToken()
      },
      body: JSON.stringify({ username, password, email, level })
    });

    const data = await res.json();
    if (data.status === "success") {
      errorBox.textContent = "📧 Registration successful. Check your email.";
      errorBox.style.color = "white";
    } else {
      errorBox.textContent = data.message || "Registration failed.";
    }
  });
});
