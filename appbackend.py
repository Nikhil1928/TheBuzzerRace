from flask import Flask, render_template, jsonify, request, session, url_for, redirect
from werkzeug.security import generate_password_hash, check_password_hash
from flask_wtf.csrf import CSRFProtect
from flask_limiter import Limiter
from flask_limiter.util import get_remote_address
from flask_talisman import Talisman
from flask_mail import Mail, Message
from itsdangerous import URLSafeTimedSerializer
from dotenv import load_dotenv
import sqlite3
import sys
import os
import re
from datetime import timedelta

# ─────────────────────────────
# 🔐 Security + App Setup
# ─────────────────────────────
app = Flask(__name__)
load_dotenv()

app.secret_key = os.environ.get("SECRET_KEY", os.urandom(24))
app.config.update({
    "SESSION_COOKIE_HTTPONLY": True,
    "SESSION_COOKIE_SECURE": True,
    "SESSION_COOKIE_SAMESITE": "Lax",
    'MAIL_SERVER': 'smtp.mailgun.org',
    'MAIL_PORT': 2525,
    'MAIL_USE_TLS': True,
    'MAIL_USERNAME': os.environ.get("MAIL_USERNAME"),
    'MAIL_PASSWORD': os.environ.get("MAIL_PASSWORD"),
    'MAIL_DEFAULT_SENDER': os.environ.get("MAIL_DEFAULT_SENDER", "no-reply@thebuzzerrace.com")
})

mail = Mail(app)
csrf = CSRFProtect(app)
limiter = Limiter(key_func=get_remote_address)
limiter.init_app(app)

Talisman(app, content_security_policy={
    'default-src': "'self'",
    'script-src': "'self'",
    'style-src': "'self' https://fonts.googleapis.com",
    'font-src': "'self' https://fonts.gstatic.com",
})

serializer = URLSafeTimedSerializer(app.secret_key)
app.permanent_session_lifetime = timedelta(minutes=30)

# ─────────────────────────────
# 📂 DB & Validation
# ─────────────────────────────
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
DB_PATH = os.path.join(BASE_DIR, 'quiz.db')

BAD_WORDS = {"ass", "shit", "fuck", "bitch", "nigger", "fag", "cunt", "retard", "whore", "slut", "dick", "pussy", "nazi", "gay", "rape", "kill"}
LEET_REPLACEMENTS = {'@': 'a', '4': 'a', '1': 'i', '!': 'i', 'l': 'i', '3': 'e', '0': 'o', '$': 's', '5': 's', '7': 't', '+': 't'}

def normalize_leetspeak(text):
    return ''.join(LEET_REPLACEMENTS.get(c.lower(), c.lower()) for c in text)

def contains_bad_word(text):
    clean = normalize_leetspeak(text.lower())
    return any(bad in clean for bad in BAD_WORDS)

def is_valid_username(username):
    return bool(re.match(r"^[a-zA-Z0-9_]{3,28}$", username))

def get_db_connection():
    print("📂 Connecting to DB:", DB_PATH, file=sys.stderr)
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn

# ─────────────────────────────
# 🌐 Routes
# ─────────────────────────────
@app.route("/")
def landing():
    return render_template("landing.html")

@app.route("/game")
def game():
    return render_template("index.html")  # This is your current game screen

@app.route("/questions", methods=["GET"])
def get_questions():
    week = request.args.get('week')
    difficulty = request.args.get('difficulty')
    db = get_db_connection()
    questions = db.execute(
        "SELECT * FROM questions WHERE week = ? AND difficulty = ? ORDER BY series DESC, RANDOM()",
        (week, difficulty)
    ).fetchall()
    db.close()
    return jsonify([dict(q) for q in questions])

@app.route("/submit_score", methods=["POST"])
def submit_score():
    try:
        if "user_id" not in session:
            return jsonify({"status": "error", "message": "Not logged in"}), 401

        data = request.json or {}
        username = session.get("username")
        user_id = session.get("user_id")
        score = data.get("score")
        difficulty = data.get("difficulty")

        if not score or not difficulty:
            return jsonify({"status": "error", "message": "Missing score or difficulty"}), 400

        db = get_db_connection()
        db.execute(
            "INSERT INTO scores (user_id, username, score, difficulty) VALUES (?, ?, ?, ?)",
            (user_id, username, score, difficulty)
        )
        db.commit()
        db.close()

        return jsonify({"status": "success"})
    except Exception as e:
        print(f"Error in /submit_score: {e}", file=sys.stderr)
        return jsonify({"status": "error", "message": str(e)}), 500

@app.route("/leaderboard", methods=["GET"])
def leaderboard():
    db = get_db_connection()
    scores_by_difficulty = {}
    for diff in ['novice', 'intermediate', 'advanced']:
        scores = db.execute("""
            SELECT username, ROUND(MAX(score), 1) as score
            FROM scores
            WHERE difficulty = ?
            GROUP BY username
            ORDER BY score DESC
            LIMIT 10
        """, (diff,)).fetchall()
        scores_by_difficulty[diff] = [dict(s) for s in scores]
    db.close()
    return jsonify(scores_by_difficulty)

@app.route("/leaderboard_page")
def leaderboard_page():
    return render_template("leaderboard.html")

@csrf.exempt
@limiter.limit("10 per minute")
@app.route("/register", methods=["POST"])
def register():
    data = request.json
    username = data.get("username", "").strip()
    password = data.get("password", "")
    level = data.get("level")
    email = data.get("email", "").strip()

    if not email or "@" not in email or len(email) > 100:
        return jsonify({"status": "error", "message": "Invalid email address"}), 400

    if not is_valid_username(username) or not password or level not in ["Novice", "Intermediate", "Advanced"]:
        return jsonify({"status": "error", "message": "Invalid input"}), 400

    if contains_bad_word(username):
        return jsonify({"status": "error", "message": "Inappropriate username"}), 400

    db = get_db_connection()
    try:
        existing_user = db.execute("SELECT * FROM users WHERE username = ?", (username,)).fetchone()
        existing_email = db.execute("SELECT * FROM users WHERE email = ?", (email,)).fetchone()

        if existing_user:
            db.close()
            return jsonify({"status": "error", "message": "Username already exists"}), 400
        if existing_email:
            db.close()
            return jsonify({"status": "error", "message": "Email already in use"}), 400

        db.execute(
            "INSERT INTO users (username, password_hash, level, email) VALUES (?, ?, ?, ?)",
            (username, generate_password_hash(password), level, email)
        )
        db.commit()

        token = serializer.dumps(email, salt='email-confirm')
        confirm_url = url_for('confirm_email', token=token, _external=True)
        msg = Message("Confirm Your Buzzer Race Account!", recipients=[email])
        msg.body = f"Hi {username}, welcome to The Buzzer Race!\n\nConfirm your account: {confirm_url}"
        mail.send(msg)

        db.close()
        return jsonify({"status": "success"})

    except Exception as e:
        db.close()
        print(f"🔥 Registration failed: {e}")
        return jsonify({"status": "error", "message": str(e)}), 500

@app.route("/confirm_email/<token>")
def confirm_email(token):
    try:
        email = serializer.loads(token, salt='email-confirm', max_age=3600)
        db = get_db_connection()
        db.execute("UPDATE users SET email_verified = 1 WHERE email = ?", (email,))
        db.commit()
        db.close()
        return redirect(url_for('home', confirmed=1)), 200
    except Exception as e:
        print(f"⚠️ Confirm failed: {e}")
        return "Confirmation link expired or invalid.", 400

@csrf.exempt
@limiter.limit("5 per minute")
@app.route("/login", methods=["POST"])
def login():
    data = request.json
    username = data.get("username")
    password = data.get("password")

    db = get_db_connection()
    user = db.execute("SELECT * FROM users WHERE username = ?", (username,)).fetchone()
    db.close()

    if user:
        if not user["email_verified"]:
            return jsonify({"status": "error", "message": "Email not confirmed"}), 403
        if check_password_hash(user["password_hash"], password):
            session.permanent = True
            session["user_id"] = user["id"]
            session["username"] = user["username"]
            session["level"] = user["level"]
            return jsonify({"status": "success"})

    return jsonify({"status": "error", "message": "Invalid credentials"}), 401

@app.route("/logout", methods=["POST"])
def logout():
    session.clear()
    return jsonify({"status": "success"})

@csrf.exempt
@limiter.limit("5 per minute")
@app.route("/request_reset", methods=["POST"])
def request_reset():
    data = request.get_json(silent=True)
    email = data.get("email")

    db = get_db_connection()
    user = db.execute("SELECT * FROM users WHERE email = ?", (email,)).fetchone()
    db.close()

    if not user:
        return jsonify({"status": "error", "message": "No account with that email."}), 400

    token = serializer.dumps(email, salt='password-reset')
    reset_url = url_for('reset_page', token=token, _external=True)

    msg = Message("Password Reset - Buzzer Race", recipients=[email])
    msg.body = f"Reset your password here: {reset_url}"
    mail.send(msg)

    return jsonify({"status": "success", "message": "Reset link sent to your email."})

@app.route("/reset_page/<token>")
def reset_page(token):
    return render_template("reset.html")

@csrf.exempt
@limiter.limit("5 per minute")
@app.route("/reset_password/<token>", methods=["POST"])
def reset_password(token):
    print("📩 Reset endpoint hit")
    print("🔗 Raw token received:", token)

    try:
        email = serializer.loads(token, salt='password-reset', max_age=3600)
        print(f"✅ Token valid for email: {email}")
    except Exception as e:
        print(f"❌ Token decode failed: {e}")
        return jsonify({"status": "error", "message": "Reset link invalid or expired"}), 400

    data = request.get_json(silent=True)
    print("📦 JSON payload received:", data)

    if not data or "password" not in data:
        print("❌ Invalid data: missing 'password'")
        return jsonify({"status": "error", "message": "Missing or invalid password field"}), 400

    password = data["password"]
    if len(password) < 6:
        print("❌ Password too short")
        return jsonify({"status": "error", "message": "Password must be at least 6 characters"}), 400

    print("🔐 Password accepted. Updating DB...")

    db = get_db_connection()
    db.execute("UPDATE users SET password_hash = ? WHERE email = ?",
               (generate_password_hash(password), email))
    db.commit()
    db.close()

    print("✅ Password reset successful")
    return jsonify({"status": "success", "message": "Password reset successful"})

@app.route("/session_user", methods=["GET"])
def session_user():
    if "user_id" in session:
        return jsonify({
            "user_id": session["user_id"],
            "username": session["username"],
            "level": session.get("level")
        })
    return jsonify({
        "user_id": None,
        "username": None,
        "level": None
    }), 200

@app.errorhandler(400)
def handle_bad_request(e):
    return jsonify({"status": "error", "message": "Bad request"}), 400

if __name__ == "__main__":
    print("✅ Flask app running. Listening on localhost...")
    app.run(debug=True)
