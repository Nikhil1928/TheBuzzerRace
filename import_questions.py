import sqlite3
import csv
import os

# ─────────────────────────────
# 🧠 CONFIGURATION
# ─────────────────────────────
DB_PATH = os.path.join(os.path.dirname(__file__), "quiz.db")
CSV_PATH = os.path.join(os.path.dirname(__file__), "week3_questions.csv")

# ─────────────────────────────
# 🚀 LOAD QUESTIONS
# ─────────────────────────────
def insert_questions():
    print(f"📂 Connecting to DB: {DB_PATH}")
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()

    with open(CSV_PATH, newline='', encoding='utf-8') as csvfile:
        reader = csv.reader(csvfile)
        next(reader)  # Skip header

        inserted = 0
        for row in reader:
            if len(row) != 5:
                print(f"⚠️ Skipping malformed row: {row}")
                continue
            question, answer, difficulty, week, series = row
            cursor.execute("""
                INSERT INTO questions (question, answer, difficulty, week, series)
                VALUES (?, ?, ?, ?, ?)
            """, (question.strip(), answer.strip(), difficulty.strip(), int(week), series.strip()))
            inserted += 1

    conn.commit()
    conn.close()
    print(f"✅ Inserted {inserted} questions for Week 2.")

if __name__ == "__main__":
    insert_questions()
