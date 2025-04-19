document.addEventListener("DOMContentLoaded", () => {
  const loginBtn = document.getElementById("loginBtn");
  const errorBox = document.getElementById("login-error");
const params = new URLSearchParams(window.location.search);
const confirmed = params.get("confirmed");

if (confirmed === "1") {
  const loginError = document.getElementById("login-error");
  if (loginError) {
    loginError.textContent = "✅ Email confirmed! You can now log in.";
    loginError.style.color = "white";
  }
}
  function getCSRFToken() {
    return document.querySelector('meta[name="csrf-token"]').getAttribute('content');
  }

  loginBtn.addEventListener("click", async () => {
    const username = document.getElementById("login-username").value.trim();
    const password = document.getElementById("login-password").value;

    if (!username || !password) {
      errorBox.textContent = "Username and password are required.";
      return;
    }

    const res = await fetch("/login", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-CSRFToken": getCSRFToken()
      },
      body: JSON.stringify({ username, password })
    });

    const data = await res.json();
    if (data.status === "success") {
      window.location.href = "/game?fromLogin=1";
    } else {
      errorBox.textContent = data.message || "Login failed.";
    }
  });
});
