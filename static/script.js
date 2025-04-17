document.addEventListener('DOMContentLoaded', () => {
  const questionElement = document.getElementById('question');
  const buzzButton = document.getElementById('buzzButton');
  const answerInput = document.getElementById('answerInput');
  const submitAnswer = document.getElementById('submitAnswer');
  const resultElement = document.getElementById('result');
  const scoreElement = document.getElementById('score');
  const questionNumberElement = document.getElementById('questionNumber');
  const leaderboardButton = document.getElementById('leaderboardButton');
  const changeDifficultyButton = document.getElementById('changeDifficultyButton');
  const summaryContainer = document.getElementById('summary-container');
  const exitButton = document.getElementById('exitButton');
  const summaryControls = document.getElementById('summary-controls');
  const timerElement = document.getElementById('timerDisplay');

// 🔓 Expose them globally so displaySummary() can access them
  window.summaryContainer = summaryContainer;
  window.exitButton = exitButton;
  window.leaderboardButton = leaderboardButton;
  window.changeDifficultyButton = changeDifficultyButton;
  window.showScreen = showScreen;

  if (submitAnswer) {
    submitAnswer.disabled = false;
  }
function getCSRFToken() {
  return document.querySelector('meta[name="csrf-token"]').getAttribute('content');
}
function showScreen(screenId) {
  const screens = ['auth-screen', 'reset-screen', 'difficulty-screen', 'game', 'summary-controls'];
  screens.forEach(id => {
    const el = document.getElementById(id);
    if (el) {
      el.classList.remove('visible');
      el.classList.add('hidden');
    }
  });

  const target = document.getElementById(screenId);
  if (target) {
    target.classList.remove('hidden');
    target.classList.add('visible');
  } else {
    console.warn(`⚠️ Attempted to show non-existent screen: ${screenId}`);
  }
}

  const allowedDifficultiesByLevel = {
    "Novice": ["novice", "intermediate", "advanced"],
    "Intermediate": ["intermediate", "advanced"],
    "Advanced": ["advanced"]
  };

  let currentDifficulty = '';
  let currentQuestions = [];
  let currentTiebreakers = [];
  let currentQuestionIndex = 0;
  let interval, buzzed = false, score = 0;
  let questionTimer, answerTimer, transitionTimer;
  let questionSummaries = [];
  let currentIndex = 0;
  let canBuzz = false;
  let inTiebreaker = false;
  let askedQuestionsIndices = [];

  const sanitizeAnswer = str => str.replace(/[<>&"'`]/g, '').replace(/\s+/g, ' ').trim().toLowerCase();
  const normalize = str => str.toLowerCase().replace(/[^\w\s]|_/g, "").replace(/\s+/g, " ").trim();
  const normalizeNumber = str => {
    if (!str) return '';
    const cleaned = str.replace(/,/g, '').trim().toLowerCase();
    const parsed = Number(cleaned);
    return isNaN(parsed) ? '' : parsed.toString();
  };

  const levenshtein = (a, b) => {
    const dp = Array.from({ length: a.length + 1 }, () => Array(b.length + 1).fill(0));
    for (let i = 0; i <= a.length; i++) dp[i][0] = i;
    for (let j = 0; j <= b.length; j++) dp[0][j] = j;
    for (let i = 1; i <= a.length; i++) {
      for (let j = 1; j <= b.length; j++) {
        dp[i][j] = a[i - 1] === b[j - 1]
          ? dp[i - 1][j - 1]
          : Math.min(dp[i - 1][j - 1], dp[i][j - 1], dp[i - 1][j]) + 1;
      }
    }
    return dp[a.length][b.length];
  };

  const soundex = (str) => {
    const s = str.toLowerCase().replace(/[^a-z]/g, '');
    if (!s) return '';
    const first = s[0];
    const map = { b: 1, f: 1, p: 1, v: 1, c: 2, g: 2, j: 2, k: 2, q: 2, s: 2, x: 2, z: 2, d: 3, t: 3, l: 4, m: 5, n: 5, r: 6 };
    let result = first.toUpperCase(), last = map[first] || '';
    for (let i = 1; i < s.length && result.length < 4; i++) {
      const code = map[s[i]] || '';
      if (code !== last && code !== '') {
        result += code;
        last = code;
      }
    }
    return result.padEnd(4, '0');
  };

  async function fetchQuestions(week, difficulty) {
    try {
      const res = await fetch(`/questions?week=${week}&difficulty=${difficulty}`);
      if (!res.ok) throw new Error('Failed to fetch questions');
      return await res.json();
    } catch (e) {
      console.error('❌ Error fetching questions:', e);
      return [];
    }
  }

  function finishQuestionRender() { // ✅ PATCH: render rest of question after buzz
    const set = inTiebreaker ? currentTiebreakers : currentQuestions;
    const question = set[currentQuestionIndex];
    const words = question.question.split(' ');
    const remainingWords = words.slice(currentIndex);
    for (let i = 0; i < remainingWords.length; i++) {
      questionElement.textContent += remainingWords[i] + ' ';
    }
    currentIndex = words.length;
  }

  function setDifficulty(difficulty) {
    const level = window.sessionUserLevel;
    if (!level || !allowedDifficultiesByLevel[level]?.includes(difficulty.toLowerCase())) {
      alert(`As a ${level}, you cannot play ${difficulty}.`);
      return;
    }

    currentDifficulty = difficulty;
    showScreen('game');

    fetchQuestions('1', difficulty).then(data => {
      currentQuestions = data.filter(q => q.series === 'main');
      currentTiebreakers = data.filter(q => q.series === 'tiebreaker');
      currentQuestionIndex = 0;
      score = 0;
      inTiebreaker = false;
      questionSummaries = [];
      askedQuestionsIndices = [];

      scoreElement.textContent = `Score: ${score.toFixed(1)}`;
      displayQuestion();
    });
  }

function displayQuestion() {
  if (!questionElement || !submitAnswer || !buzzButton || !answerInput || !questionNumberElement) {
    console.error('🚫 Game screen not fully rendered yet.');
    return;
  }

  clearAllTimers();
  buzzed = false;
  canBuzz = true;
  resultElement.textContent = '';
  answerInput.value = '';

  const set = inTiebreaker ? currentTiebreakers : currentQuestions;

  // ✅ CHECK BEFORE USING SET
  if (!set.length) {
    questionElement.textContent = "⚠️ No questions available.";
    buzzButton.classList.add('hidden');
    submitAnswer.classList.add('hidden');
    return;
  }

  const question = set[currentQuestionIndex];
  const words = question.question.split(' ');

  currentIndex = 0;
  questionElement.textContent = '';
  const label = inTiebreaker ? 'Tiebreaker' : 'Question';
  questionNumberElement.textContent = `${label} ${currentQuestionIndex + 1} of ${set.length}`;
  askedQuestionsIndices.push(currentQuestionIndex + (inTiebreaker ? currentQuestions.length : 0));

  document.querySelector('.answer-section')?.classList.add('hidden');
buzzButton.classList.remove('hidden');

submitAnswer.disabled = false;
answerInput.disabled = false;
answerInput.classList.add('hidden');
submitAnswer.classList.add('hidden');

  interval = setInterval(() => {
    if (currentIndex < words.length) {
      questionElement.textContent += words[currentIndex++] + ' ';
    } else {
      clearInterval(interval);
      startQuestionTimer();
    }
  }, 343);
}

  function startQuestionTimer() {
    let timeLeft = 5;
    timerElement.classList.add('timer');
    timerElement.textContent = `Time to buzz: ${timeLeft}s`;
    questionTimer = setInterval(() => {
      timeLeft--;
      timerElement.textContent = `Time to buzz: ${timeLeft}s`;
      if (timeLeft <= 0) {
        clearInterval(questionTimer);
        timerElement.textContent = '';
        canBuzz = false;
        buzzButton.classList.add('hidden');
        resultElement.textContent = "⏰ Time's up!";
        const set = inTiebreaker ? currentTiebreakers : currentQuestions;
const question = set[currentQuestionIndex];
const words = question.question.split(' ');
const buzzIndex = Math.min(currentIndex - 1, words.length - 1);
const buzzwordContext = getBuzzwordContext(buzzIndex, question.question);

questionSummaries[currentQuestionIndex + (inTiebreaker ? currentQuestions.length : 0)] = {
  buzzwordContext,
  buzzIndex,
  playerAnswer: 'Unanswered'
};
        finishQuestionRender(); // ✅ PATCH: complete question after timeout
        showCorrectAnswer();
      }
    }, 1000);
  }
function getBuzzwordContext(buzzIndex, fullText) {
  const words = fullText.split(' ');
  if (buzzIndex < 0 || buzzIndex >= words.length) return '';

  const boldWord = `<strong>${words[buzzIndex]}</strong>`;
  const before = buzzIndex > 0 ? words[buzzIndex - 1] : '';
  const after = buzzIndex < words.length - 1 ? words[buzzIndex + 1] : '';

  if (buzzIndex === 0) {
    return `${boldWord} ${after}`.trim();
  } else if (buzzIndex === words.length - 1) {
    return `${before} ${boldWord}`.trim();
  } else {
    return `${before} ${boldWord} ${after}`.trim();
  }
}
function handleBuzz() {
  if (canBuzz && !buzzed) {
    buzzed = true;
    clearAllTimers();

    const set = inTiebreaker ? currentTiebreakers : currentQuestions;
    const question = set[currentQuestionIndex];
    const words = question.question.split(' ');
    const buzzIndex = Math.min(currentIndex - 1, words.length - 1);

    // ✅ NEW: define buzzwordContext correctly
    const buzzwordContext = getBuzzwordContext(buzzIndex, question.question);

    questionSummaries[currentQuestionIndex + (inTiebreaker ? currentQuestions.length : 0)] = {
      buzzwordContext,
      buzzIndex,
      playerAnswer: ''
    };

    document.querySelector('.answer-section')?.classList.remove('hidden');
    answerInput.classList.remove('hidden');
    answerInput.disabled = false;
    submitAnswer.classList.remove('hidden');
    buzzButton.classList.add('hidden');
    answerInput.focus();

    startAnswerTimer();
  }
}

  function startAnswerTimer() {
    let timeLeft = 8;
    timerElement.classList.add('timer');
    timerElement.textContent = `Time to answer: ${timeLeft}s`;
    answerTimer = setInterval(() => {
      timeLeft--;
      timerElement.textContent = `Time to answer: ${timeLeft}s`;
      if (timeLeft <= 0) {
        clearInterval(answerTimer);
        timerElement.textContent = '';
        canBuzz = false;
        answerInput.disabled = true;
        submitAnswer.disabled = true;
        document.querySelector('.answer-section')?.classList.add('hidden');
const set = inTiebreaker ? currentTiebreakers : currentQuestions;
const question = set[currentQuestionIndex];
const words = question.question.split(' ');
const buzzIndex = Math.min(currentIndex - 1, words.length - 1);
const buzzwordContext = getBuzzwordContext(buzzIndex, question.question);

questionSummaries[currentQuestionIndex + (inTiebreaker ? currentQuestions.length : 0)] = {
  buzzwordContext,
  buzzIndex,
  playerAnswer: 'Unanswered'
};
        finishQuestionRender(); // ✅ PATCH
        resultElement.textContent = "⏰ Time's up!";
        showCorrectAnswer();
      }
    }, 1000);
  }

  function showCorrectAnswer() {
    const set = inTiebreaker ? currentTiebreakers : currentQuestions;
    const question = set[currentQuestionIndex];
    const correct = question.answer;
    resultElement.textContent += ` The correct answer is "${correct}".`;
    startTransitionTimer();
  }
function moveToNextQuestion() {
  console.log("➡️ Moving to next question or summary");
  const set = inTiebreaker ? currentTiebreakers : currentQuestions;
  currentQuestionIndex++;
  if (currentQuestionIndex < set.length) {
    displayQuestion();
  } else if (!inTiebreaker) {
    inTiebreaker = true;
    currentQuestionIndex = 0;
    displayQuestion();
  } else {
    console.log("✅ All done — calling displaySummary()");
    displaySummary();
  }
}
function startTransitionTimer() {
  let timeLeft = 5;
  timerElement.classList.add('timer');
  console.log(`⏭️ Transition check: inTiebreaker=${inTiebreaker}, currentQuestionIndex=${currentQuestionIndex}`);
  const mainDone = !inTiebreaker && currentQuestionIndex + 1 >= currentQuestions.length;
  const tieDone = inTiebreaker && currentQuestionIndex + 1 >= currentTiebreakers.length;

  let label = 'Next question';

  if (mainDone) {
    label = 'Tiebreakers';
  } else if (tieDone) {
    label = 'Summary page';
  }

  timerElement.textContent = `${label} in: ${timeLeft}s`;

  transitionTimer = setInterval(() => {
    timeLeft--;
    timerElement.textContent = `${label} in: ${timeLeft}s`;
    if (timeLeft <= 0) {
      clearInterval(transitionTimer);
      timerElement.textContent = '';
      moveToNextQuestion();
    }
  }, 1000);
}

  if (submitAnswer) {
    submitAnswer.addEventListener('click', () => {
      clearInterval(answerTimer);
      finishQuestionRender(); // ✅ PATCH
      submitAnswer.disabled = true;
      answerInput.disabled = true;
      document.querySelector('.answer-section')?.classList.add('hidden');
      const set = inTiebreaker ? currentTiebreakers : currentQuestions;
      const question = set[currentQuestionIndex];
      const userAnswer = sanitizeAnswer(answerInput.value);
      const correctAnswer = question.answer;
      const summaryIndex = currentQuestionIndex + (inTiebreaker ? currentQuestions.length : 0);

      if (!questionSummaries[summaryIndex]) {
        questionSummaries[summaryIndex] = { buzzwordContext: '', playerAnswer: '' };
      }

      questionSummaries[summaryIndex].playerAnswer = userAnswer;

      const optional = correctAnswer.match(/\(([^)]+)\)/);
      const required = correctAnswer.replace(/\(([^)]+)\)/g, '').toLowerCase().trim();
      const normalizedUser = normalize(userAnswer);
      const isNumeric = /^[\d.,eE+-]+$/.test(required);

      let isCorrect = false;

      if (isNumeric) {
        isCorrect = normalizeNumber(userAnswer) === normalizeNumber(required);
      } else {
        const userWords = normalizedUser.split(" ");
        const requiredWords = required.split(" ");
        let used = [...userWords];

        isCorrect = requiredWords.every(word => {
          const idx = used.findIndex(w =>
            soundex(w) === soundex(word) || levenshtein(w, word) <= Math.floor(word.length * 0.25)
          );
          if (idx !== -1) used.splice(idx, 1);
          return idx !== -1;
        });

        if (isCorrect && optional?.[1]) {
          const opt = optional[1].toLowerCase();
          if (used.length > 0) {
            const idx = used.findIndex(w =>
              soundex(w) === soundex(opt) || levenshtein(w, opt) <= Math.floor(opt.length * 0.25)
            );
            isCorrect = idx !== -1;
          }
        }
      }

      if (isCorrect) {
  resultElement.textContent = "✅ Correct!";
  const questionLength = question.question.split(' ').length;
  const buzzIndex = questionSummaries[summaryIndex]?.buzzIndex ?? questionLength; // fallback to end

  const earned = calculateScore(true, buzzIndex, questionLength);
  score += earned;
  scoreElement.textContent = `Score: ${score.toFixed(1)} (+${earned.toFixed(1)})`;
} else {
        resultElement.textContent = `❌ Incorrect. Correct: ${correctAnswer.replace(/\(([^)]+)\)/g, '$1')}`;
      }

      answerInput.classList.add('hidden');
      submitAnswer.classList.add('hidden');
      startTransitionTimer();
    });
  }

function calculateScore(isCorrect, buzzIndex, questionLength) {
  if (!isCorrect) return 0;
  if (inTiebreaker) return 0.1;

  if (!questionLength || questionLength === 0) return 10;

  const buzzPercent = (buzzIndex / questionLength) * 100;
  let bonus = 0;

  if (buzzPercent <= 25) bonus = 5;
  else if (buzzPercent <= 50) bonus = 3;
  else if (buzzPercent <= 75) bonus = 1;

  return 10 + bonus;
}

async function submitScore(username, score) {
  if (!currentDifficulty || score == null) {
    console.warn("🚫 submitScore aborted: invalid difficulty or score", { currentDifficulty, score });
    showScreen('difficulty-screen');
    return;
  }

  console.log("[SUBMIT] Sending score:", { username, score, difficulty: currentDifficulty });
  console.log("[CSRF] Token used:", getCSRFToken());

  try {
    const res = await fetch('/submit_score', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-CSRFToken': getCSRFToken() // ✅ CSRF FIXED HERE
      },
      body: JSON.stringify({ username, score, difficulty: currentDifficulty })
    });

    const text = await res.text();
    let data;
    try {
      data = JSON.parse(text);
    } catch (jsonErr) {
      console.error('❌ Non-JSON response from server:', text);
      return;
    }

    if (!res.ok) {
      console.error('❌ Score submission failed:', data.message || res.statusText);
    }
  } catch (e) {
    console.error('❌ Error submitting score:', e);
  }
}


function displaySummary() {
  clearAllTimers();

  const gameDiv = document.getElementById('game');
  gameDiv.innerHTML = ''; // Clear previous game content

  const summaryCard = document.createElement('div');
  summaryCard.className = 'quiz-summary-card';

  const summaryTitle = document.createElement('h2');
  summaryTitle.textContent = "Quiz Summary";

  const finalScore = document.createElement('div');
  finalScore.id = 'final-score';
  finalScore.textContent = `Final Score: ${score.toFixed(1)}`;

  const resultContainer = document.createElement('div');
  resultContainer.id = 'result';

  // Build each question summary
  askedQuestionsIndices.forEach((index) => {
    const isTiebreaker = index >= currentQuestions.length;
    const questionSet = isTiebreaker ? currentTiebreakers : currentQuestions;
    const questionIndex = isTiebreaker ? index - currentQuestions.length : index;
    const question = questionSet[questionIndex];
    const summary = questionSummaries[index] || { buzzwordContext: '', playerAnswer: 'Unanswered' };

    const summaryItem = document.createElement('div');
    summaryItem.className = 'summary-item';
    let bonus = 0;
const buzzIndex = summary.buzzIndex ?? question.question.split(' ').length;
const buzzPercent = (buzzIndex / question.question.split(' ').length) * 100;
if (!isTiebreaker) {
  if (buzzPercent <= 25) bonus = 5;
  else if (buzzPercent <= 50) bonus = 3;
  else if (buzzPercent <= 75) bonus = 1;
}
    summaryItem.innerHTML = `
      <strong>${isTiebreaker ? 'Tiebreaker' : 'Question'} ${questionIndex + 1}:</strong><br>
      ${summary.buzzwordContext ? `• Buzzword Context: "${summary.buzzwordContext}"<br>` : '• Buzzword Context: (none — no buzz)<br>'}
      • Your Answer: "${summary.playerAnswer}"<br>
      • Correct Answer: "${question.answer}"<br>
      ${!isTiebreaker && bonus > 0 ? `• Bonus Points: +${bonus}<br>` : ''}
    `;
    resultContainer.appendChild(summaryItem);
  });

  // Buttons
  const buttonContainer = document.createElement('div');
  buttonContainer.style.marginTop = '30px';
  buttonContainer.style.textAlign = 'center';

  const exitBtn = document.createElement('button');
  exitBtn.textContent = 'Exit';
  exitBtn.className = 'btn';
  exitBtn.addEventListener('click', () => window.location.href = "/");

  const leaderboardBtn = document.createElement('button');
  leaderboardBtn.textContent = 'Leaderboard';
  leaderboardBtn.className = 'btn';
  leaderboardBtn.addEventListener('click', () => window.location.href = "/leaderboard_page");

  const changeBtn = document.createElement('button');
  changeBtn.textContent = 'Change Difficulty';
  changeBtn.className = 'btn';
  changeBtn.addEventListener('click', () => {
    document.getElementById('game')?.classList.add('hidden');
    document.getElementById('difficulty-screen')?.classList.remove('hidden');
  });

  buttonContainer.appendChild(exitBtn);
  buttonContainer.appendChild(leaderboardBtn);
  buttonContainer.appendChild(changeBtn);

  summaryCard.appendChild(summaryTitle);
  summaryCard.appendChild(finalScore);
  summaryCard.appendChild(resultContainer);
  summaryCard.appendChild(buttonContainer);

if (window.sessionUser?.username) {
  submitScore(window.sessionUser.username, score);
}
  gameDiv.appendChild(summaryCard);
  gameDiv.classList.remove('hidden');
  gameDiv.classList.add('visible');
}

  function clearAllTimers() {
    clearInterval(interval);
    clearInterval(questionTimer);
    clearInterval(answerTimer);
    clearInterval(transitionTimer);
  }

  if (buzzButton) {
    buzzButton.addEventListener('click', handleBuzz);
  }

  document.addEventListener('keydown', (e) => {
    if (canBuzz && !buzzed && [' ', 'Enter'].includes(e.key) && document.activeElement !== answerInput) {
      handleBuzz();
    } else if (buzzed && e.key === 'Enter' && document.activeElement === answerInput) {
      submitAnswer?.click();
    }
  });

  exitButton?.addEventListener('click', () => {
    window.location.href = "/";
  });

  changeDifficultyButton?.addEventListener('click', () => {
    document.getElementById('game')?.classList.add('hidden');
    document.getElementById('difficulty-screen')?.classList.remove('hidden');
  });

  leaderboardButton?.addEventListener('click', () => {
    window.location.href = '/leaderboard_page';
  });

  window.setDifficulty = setDifficulty;

  ["novice", "intermediate", "advanced"].forEach(level => {
    const btn = document.getElementById(`diff-${level}`);
    if (btn) {
      btn.addEventListener("click", () => {
        setDifficulty(level);
      });
    }
  });
});
