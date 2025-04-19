document.addEventListener('DOMContentLoaded', async () => {
  const homeBtn = document.getElementById('homeBtn');
  const weekSelector = document.getElementById('weekSelector');

  // 🏠 HOME BUTTON
  homeBtn?.addEventListener('click', () => {
    window.location.href = "/";
  });

  const renderEntries = (entries, containerId) => {
    const container = document.getElementById(containerId);
    container.innerHTML = '';

    let currentRank = 1;
    let actualPosition = 1;
    let previousScore = null;

    entries.forEach(entry => {
      const div = document.createElement('div');
      div.className = 'leaderboard-entry';

      if (entry.score !== previousScore) {
        currentRank = actualPosition;
      }

      div.textContent = `${currentRank}. ${entry.username}: ${entry.score.toFixed(1)}`;
      container.appendChild(div);

      previousScore = entry.score;
      actualPosition++;
    });
  };

  const fetchAndRenderLeaderboard = async (week) => {
    try {
      const response = await fetch(`/leaderboard?week=${week}`);
      if (!response.ok) throw new Error('Failed to fetch leaderboard');

      const data = await response.json();
      const scores = data.scores; // ✅ Extract the correct subfield

      renderEntries(scores.novice || [], 'novice-entries');
      renderEntries(scores.intermediate || [], 'intermediate-entries');
      renderEntries(scores.advanced || [], 'advanced-entries');
    } catch (err) {
      const container = document.getElementById('leaderboard-container');
      if (container) {
        container.innerHTML = "⚠️ Unable to load leaderboard at this time.";
      }
      console.error('Error fetching leaderboard:', err);
    }
  };

  // 🗓️ Generate weeks from Jan 1, 2024 to current
  const start = new Date(Date.UTC(2025, 3, 7)); // April = month 3 (0-indexed)
  const now = new Date();
  const currentWeek = Math.floor((now - start) / (1000 * 60 * 60 * 24 * 7)) + 1;

  if (weekSelector) {
    for (let i = currentWeek; i >= 1; i--) {
      const option = document.createElement('option');
      option.value = i;
      option.textContent = `Week ${i}`;
      weekSelector.appendChild(option);
    }

    weekSelector.value = currentWeek;
    await fetchAndRenderLeaderboard(currentWeek);

    weekSelector.addEventListener('change', () => {
      const selectedWeek = weekSelector.value;
      fetchAndRenderLeaderboard(selectedWeek);
    });
  } else {
    await fetchAndRenderLeaderboard(currentWeek);
  }
});
