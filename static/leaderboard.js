document.addEventListener('DOMContentLoaded', async () => {
  // 🏠 HOME BUTTON HANDLER
  document.getElementById('homeBtn')?.addEventListener('click', () => {
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

    // Only update rank if score changes
    if (entry.score !== previousScore) {
      currentRank = actualPosition;
    }

    div.textContent = `${currentRank}. ${entry.username}: ${entry.score.toFixed(1)}`;
    container.appendChild(div);

    previousScore = entry.score;
    actualPosition++;
  });
};

  try {
    const response = await fetch('/leaderboard');
    if (!response.ok) {
      throw new Error('Failed to fetch leaderboard');
    }

    const leaderboardData = await response.json();

    renderEntries(leaderboardData.novice, 'novice-entries');
    renderEntries(leaderboardData.intermediate, 'intermediate-entries');
    renderEntries(leaderboardData.advanced, 'advanced-entries');

  } catch (error) {
    const container = document.getElementById('leaderboard-container');
if (container) {
  container.textContent = "⚠️ Unable to load leaderboard at this time.";
}
    console.error('Error fetching leaderboard:', error);
    document.getElementById('leaderboard-container').textContent = 'Error loading leaderboard.';
  }
});