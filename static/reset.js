document.addEventListener('DOMContentLoaded', () => {
  const token = window.location.pathname.split("/").pop();
  const encodedToken = encodeURIComponent(token);

  document.getElementById('reset-button')?.addEventListener('click', async () => {
    const password = document.getElementById('new-password').value;
    const status = document.getElementById('reset-status');

    console.log("🔐 Submitting password reset request...");

    if (!password || password.length < 6) {
      status.textContent = "Password must be at least 6 characters.";
      status.style.color = "red";
      return;
    }

    try {
      const response = await fetch(`/reset_password/${encodedToken}`, {
        method: "POST",
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password })
      });

      if (!response.headers.get("content-type")?.includes("application/json")) {
        status.textContent = "❌ Server returned non-JSON response.";
        status.style.color = "red";
        return;
      }

      console.log("🧪 Raw response:", response);
      const data = await response.json();
      status.textContent = data.message;
      status.style.color = data.status === "success" ? "white" : "red";
    } catch (err) {
      console.error("❌ Request failed:", err);
      status.textContent = "❌ Something went wrong. Try again.";
      status.style.color = "red";
    }
  });
});
