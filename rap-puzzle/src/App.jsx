import React, { useEffect, useMemo, useState } from "react";
import { sdk } from "@farcaster/miniapp-sdk";

const DEMO_PROMPT = {
  id: "demo-2026-11-24",
  opening_line: "از تهِ شب رد می‌شم، بی‌صدا ولی مغرور",
  target_rhyme_word: "نور",
  accepted_end_words: ["نور", "عبور", "حضور", "غرور", "صبور"],
};

const DEMO_SUBMISSIONS = [
  { id: "demo-a", fid: 1234, display_name: "RhymePilot", submission_text: "هر زخمی رو می‌دوزم، می‌سازم از شکست عبور", is_wildcard: false, score_code: 50, score_community: 34 },
  { id: "demo-b", fid: 5678, display_name: "SaharFlow", submission_text: "تو مشت من جرقه‌ست، توی چشمام یه جهان نور", is_wildcard: false, score_code: 30, score_community: 21 },
  { id: "demo-c", fid: 9012, display_name: "NoirBeat", submission_text: "سه بار زمین خوردم، ولی ایستادم با غرور", is_wildcard: true, score_code: 0, score_community: 12 },
];

const DEMO_LEADERBOARD = [
  { fid: 1234, display_name: "RhymePilot", code_score: 320, community_score: 148, total_score: 468 },
  { fid: 5678, display_name: "SaharFlow", code_score: 290, community_score: 121, total_score: 411 },
  { fid: 9012, display_name: "NoirBeat", code_score: 250, community_score: 94, total_score: 344 },
];

const LIVE_REQUESTED = import.meta.env.VITE_RAPPUZZLE_LIVE === "true";
const initialDayKey = new Date().toISOString().slice(0, 10);

function storageKeyForDate(dateKey) {
  return "rappuzzle-demo-" + dateKey;
}

function emptyGameState() {
  return { attempts: 0, completed: false, scoreCode: 0, submission: null, votes: {} };
}

function readGameState(key) {
  try {
    const value = JSON.parse(window.localStorage.getItem(key) || "null");
    if (!value || typeof value !== "object") return emptyGameState();
    return { ...emptyGameState(), ...value, votes: value.votes || {} };
  } catch {
    return emptyGameState();
  }
}

function normalizeEndWord(text) {
  const words = text.normalize("NFKC").trim().split(/\s+/u);
  return (words.at(-1) || "").replace(/[\p{P}\p{S}]+$/u, "").toLocaleLowerCase("fa");
}

function getPointsForAttempt(attempt) {
  return [50, 30, 10][attempt - 1] || 0;
}

export default function App() {
  const [dayKey, setDayKey] = useState(initialDayKey);
  const [host, setHost] = useState({ checked: false, isMiniApp: false, fid: null, username: null });
  const [prompt, setPrompt] = useState(DEMO_PROMPT);
  const [screen, setScreen] = useState("play");
  const [game, setGame] = useState(() => readGameState(storageKeyForDate(initialDayKey)));
  const [livePointsUsed, setLivePointsUsed] = useState(0);
  const [verse, setVerse] = useState("");
  const [notice, setNotice] = useState("");
  const [feed, setFeed] = useState(DEMO_SUBMISSIONS);
  const [leaderboard, setLeaderboard] = useState(DEMO_LEADERBOARD);
  const [loading, setLoading] = useState(false);

  const liveMode = LIVE_REQUESTED && host.isMiniApp;
  const remainingPoints = useMemo(
    () => liveMode
      ? Math.max(0, 100 - livePointsUsed)
      : Math.max(0, 100 - Object.values(game.votes).reduce((sum, value) => sum + Number(value || 0), 0)),
    [game.votes, liveMode, livePointsUsed]
  );

  useEffect(() => {
    let mounted = true;

    async function startMiniApp() {
      try {
        const inside = await sdk.isInMiniApp(900);
        if (!mounted) return;

        if (inside) {
          let context = null;
          try {
            context = await sdk.context;
          } catch {
            context = null;
          }
          if (mounted) {
            setHost({
              checked: true,
              isMiniApp: true,
              fid: context?.user?.fid ?? null,
              username: context?.user?.username ?? context?.user?.displayName ?? null,
            });
          }
          try {
            await Promise.race([
              sdk.actions.ready(),
              new Promise((_, reject) => window.setTimeout(() => reject(new Error("Mini App ready timeout")), 1800)),
            ]);
          } catch {
            // Keep the web preview usable if the host does not answer.
          }
        } else if (mounted) {
          setHost({ checked: true, isMiniApp: false, fid: null, username: null });
        }
      } catch {
        if (mounted) setHost({ checked: true, isMiniApp: false, fid: null, username: null });
      }
    }

    startMiniApp();
    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    window.localStorage.setItem(storageKeyForDate(dayKey), JSON.stringify(game));
  }, [dayKey, game]);

  useEffect(() => {
    const timer = window.setInterval(() => {
      const currentDay = new Date().toISOString().slice(0, 10);
      if (currentDay !== dayKey) {
        setDayKey(currentDay);
        setGame(readGameState(storageKeyForDate(currentDay)));
        setLivePointsUsed(0);
        setPrompt(DEMO_PROMPT);
        setScreen("play");
        setNotice("");
      }
    }, 15000);
    return () => window.clearInterval(timer);
  }, [dayKey]);

  useEffect(() => {
    if (!liveMode) return;
    let mounted = true;

    async function loadLiveData() {
      try {
        const response = await sdk.quickAuth.fetch("/api/prompt");
        if (!response.ok) throw new Error("چالش امروز در دسترس نیست.");
        const data = await response.json();
        if (mounted) setPrompt(data.prompt);
      } catch (error) {
        if (mounted) setNotice(error.message || "اتصال به چالش برقرار نشد.");
      }
    }

    loadLiveData();
    return () => {
      mounted = false;
    };
  }, [dayKey, liveMode]);

  useEffect(() => {
    if (!liveMode) return;
    let mounted = true;

    async function loadPlayerStatus() {
      try {
        const response = await sdk.quickAuth.fetch("/api/status");
        if (!response.ok) throw new Error("وضعیت امروز بارگذاری نشد.");
        const data = await response.json();
        if (!mounted) return;
        setLivePointsUsed(Number(data.points_used || 0));
        setGame((current) => ({
          ...current,
          attempts: Number(data.attempts_used || 0),
          completed: Boolean(data.is_complete),
          scoreCode: Number(data.code_score || 0),
          submission: data.submission ? {
            id: data.submission.id,
            fid: host.fid || 0,
            submission_text: data.submission.submission_text,
            is_wildcard: data.submission.is_wildcard,
            score_code: data.submission.score_code,
            score_community: data.submission.score_community,
          } : null,
        }));
      } catch (error) {
        if (mounted) setNotice(error.message || "وضعیت امروز بارگذاری نشد.");
      }
    }

    loadPlayerStatus();
    return () => { mounted = false; };
  }, [dayKey, host.fid, liveMode]);

  async function refreshFeed() {
    if (!liveMode || !game.completed) {
      setFeed(DEMO_SUBMISSIONS);
      return;
    }
    const response = await sdk.quickAuth.fetch("/api/feed");
    if (!response.ok) throw new Error("فید رأی‌گیری بارگذاری نشد.");
    const data = await response.json();
    setFeed(data.submissions || []);
  }

  async function refreshLeaderboard() {
    if (!liveMode) {
      setLeaderboard(DEMO_LEADERBOARD);
      return;
    }
    const response = await fetch("/api/leaderboard");
    if (!response.ok) throw new Error("جدول هفتگی بارگذاری نشد.");
    const data = await response.json();
    setLeaderboard(data.leaderboard || []);
  }

  async function submitVerse(event) {
    event.preventDefault();
    const cleanVerse = verse.trim();
    if (!cleanVerse) {
      setNotice("اول مصرعت رو بنویس.");
      return;
    }
    if (game.completed || game.attempts >= 3) return;

    setNotice("");
    setLoading(true);
    try {
      if (liveMode) {
        const response = await sdk.quickAuth.fetch("/api/submit", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ verse: cleanVerse }),
        });
        const data = await response.json();
        if (!response.ok) throw new Error(data.message || "ثبت تلاش انجام نشد.");
        setGame((current) => ({
          ...current,
          attempts: data.attempt_number,
          completed: data.feed_unlocked,
          scoreCode: data.code_score,
          submission: data.feed_unlocked ? {
            id: data.submission_id,
            submission_text: cleanVerse,
            is_wildcard: !data.correct,
          } : current.submission,
        }));
        setNotice(data.correct
          ? "قافیه نشست؛ امتیاز این تلاش ثبت شد."
          : data.feed_unlocked
            ? "سه تلاش تموم شد؛ نسخه‌ات با برچسب Wildcard وارد فید شد."
            : "قافیه هنوز ننشسته؛ یک تلاش دیگه داری.");
      } else {
        const attempt = game.attempts + 1;
        const endWord = normalizeEndWord(cleanVerse);
        const correct = prompt.accepted_end_words.some(
          (word) => word.toLocaleLowerCase("fa") === endWord
        );
        const completed = correct || attempt === 3;
        const scoreCode = correct ? getPointsForAttempt(attempt) : 0;
        setGame((current) => ({
          ...current,
          attempts: attempt,
          completed,
          scoreCode: completed ? scoreCode : current.scoreCode,
          submission: completed ? {
            id: "own",
            fid: host.fid || 0,
            submission_text: cleanVerse,
            is_wildcard: !correct,
            score_code: scoreCode,
            score_community: 0,
          } : current.submission,
        }));
        setNotice(correct
          ? "قافیه نشست؛ " + scoreCode + " امتیاز کد گرفتی."
          : completed
            ? "سه تلاش تموم شد؛ نسخه‌ات با برچسب Wildcard وارد فید شد."
            : "قافیه هنوز ننشسته؛ " + (3 - attempt) + " تلاش دیگه داری.");
      }
      setVerse("");
    } catch (error) {
      setNotice(error.message || "ثبت تلاش انجام نشد.");
    } finally {
      setLoading(false);
    }
  }

  async function openFeed() {
    if (!game.completed) {
      setNotice("بعد از ثبت قافیه یا تمام‌شدن سه تلاش، فید باز می‌شه.");
      return;
    }
    setLoading(true);
    setNotice("");
    try {
      await refreshFeed();
      setScreen("feed");
    } catch (error) {
      setNotice(error.message || "فید رأی‌گیری بارگذاری نشد.");
    } finally {
      setLoading(false);
    }
  }

  async function voteFor(submissionId) {
    if (remainingPoints <= 0) {
      setNotice("هر ۱۰۰ امتیاز اجتماعی امروزت خرج شده.");
      return;
    }
    const allocation = Math.min(10, remainingPoints);
    setLoading(true);
    try {
      if (liveMode && submissionId !== "own") {
        const response = await sdk.quickAuth.fetch("/api/vote", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ submission_id: submissionId, points: allocation }),
        });
        const data = await response.json();
        if (!response.ok) throw new Error(data.message || "رأی ثبت نشد.");
        setLivePointsUsed(100 - Number(data.points_remaining));
      }
      setGame((current) => ({
        ...current,
        votes: { ...current.votes, [submissionId]: (current.votes[submissionId] || 0) + allocation },
      }));
      setFeed((current) => current.map((item) => item.id === submissionId
        ? { ...item, score_community: (item.score_community || 0) + allocation }
        : item));
      setNotice(allocation + " امتیاز اجتماعی ثبت شد.");
    } catch (error) {
      setNotice(error.message || "رأی ثبت نشد.");
    } finally {
      setLoading(false);
    }
  }

  async function openLeaderboard() {
    setLoading(true);
    setNotice("");
    try {
      await refreshLeaderboard();
      setScreen("leaderboard");
    } catch (error) {
      setNotice(error.message || "جدول هفتگی بارگذاری نشد.");
    } finally {
      setLoading(false);
    }
  }

  const attemptsLeft = Math.max(0, 3 - game.attempts);
  const displayName = host.username || (host.fid ? "FID " + host.fid : "مهمان");

  return (
    <div className="app-shell">
      <header className="topbar">
        <a className="brand" href="#" onClick={(event) => { event.preventDefault(); setScreen("play"); }}>
          <span className="brand-mark" aria-hidden="true">♪</span>
          <span className="brand-word">RAP<span>PUZZLE</span></span>
        </a>
        <div className="profile-pill">
          <span className={"host-dot " + (host.isMiniApp ? "online" : "")} />
          <span>{host.isMiniApp ? displayName : "حالت وب"}</span>
        </div>
      </header>

      <main>
        <section className="intro-row">
          <div>
            <p className="eyebrow">چالش روزانه · ریست در ۰۰:۰۰ UTC</p>
            <h1>قافیه رو <span>قفل‌گشایی</span> کن.</h1>
            <p className="intro-copy">یه خط شروع داریم؛ ادامه‌ش رو تو بساز. قافیه، امتیاز می‌گیره؛ بعدش نوبت جامعه‌ست.</p>
          </div>
          <div className="score-orb" aria-label={"امتیاز کد " + game.scoreCode}>
            <span>CODE</span>
            <strong>{game.scoreCode}</strong>
            <small>از ۵۰</small>
          </div>
        </section>

        <div className="mode-banner">
          <span className="banner-icon">✦</span>
          <span>
            {liveMode
              ? "اتصال زنده · امتیازها با هویت Farcaster ثبت می‌شن."
              : LIVE_REQUESTED && host.checked && !host.isMiniApp
                ? "برای ثبت واقعی، برنامه رو داخل Farcaster باز کن."
                : "پیش‌نمایش محلی · امتیازها فقط روی همین مرورگر ذخیره می‌شن."}
          </span>
        </div>

        <nav className="tabs" aria-label="بخش‌های بازی">
          <button className={screen === "play" ? "tab active" : "tab"} onClick={() => setScreen("play")}>چالش امروز</button>
          <button className={screen === "feed" ? "tab active" : "tab"} onClick={openFeed} disabled={!game.completed || loading}>فید رأی‌گیری {game.completed ? "" : "🔒"}</button>
          <button className={screen === "leaderboard" ? "tab active" : "tab"} onClick={openLeaderboard} disabled={loading}>جدول هفتگی</button>
        </nav>

        {screen === "play" && (
          <section className="challenge-card panel">
            <div className="card-topline">
              <span className="challenge-label"><span className="live-pulse" /> چالش امروز</span>
              <span className="date-label">{dayKey}</span>
            </div>
            <div className="opening-line">
              <span className="quote-mark">“</span>
              <p>{prompt.opening_line}</p>
            </div>
            <div className="rhyme-hint">
              <span>قافیهٔ هدف</span>
              <strong>{prompt.target_rhyme_word}</strong>
              <span className="hint-divider" />
              <span>تلاش باقی‌مانده</span>
              <strong>{attemptsLeft} / ۳</strong>
            </div>

            {!game.completed ? (
              <form onSubmit={submitVerse}>
                <label htmlFor="verse">مصرع تو</label>
                <textarea
                  id="verse"
                  maxLength={280}
                  value={verse}
                  onChange={(event) => setVerse(event.target.value)}
                  placeholder="ادامه‌ش رو بنویس…"
                  disabled={loading || game.attempts >= 3}
                />
                <div className="form-footer">
                  <span>{verse.length} / ۲۸۰</span>
                  <button className="primary-button" type="submit" disabled={loading || game.attempts >= 3}>
                    {loading ? "در حال بررسی…" : game.attempts === 0 ? "قافیه رو چک کن" : "تلاش دوباره"}
                    <span aria-hidden="true">↗</span>
                  </button>
                </div>
              </form>
            ) : (
              <div className="completion-card">
                <div className="completion-icon">{game.scoreCode > 0 ? "✓" : "↗"}</div>
                <div>
                  <strong>{game.scoreCode > 0 ? "چالش کامل شد" : "Wildcard ثبت شد"}</strong>
                  <p>{game.submission?.submission_text || "نسخهٔ امروزت ثبت شد."}</p>
                </div>
                <button className="text-button" onClick={openFeed}>رفتن به فید <span>←</span></button>
              </div>
            )}

            <div className="attempt-track" aria-label={"تلاش‌های انجام شده " + game.attempts + " از ۳"}>
              {[0, 1, 2].map((index) => (
                <span key={index} className={index < game.attempts ? "attempt-dot used" : "attempt-dot"} />
              ))}
              <span className="track-caption">امتیاز موفقیت: ۵۰ / ۳۰ / ۱۰</span>
            </div>
          </section>
        )}

        {screen === "feed" && (
          <section className="panel feed-panel">
            <div className="section-heading">
              <div><p className="eyebrow">CURATE THE CULTURE</p><h2>فید جامعه</h2></div>
              <div className="points-badge"><strong>{remainingPoints}</strong><span>امتیاز آزاد</span></div>
            </div>
            <p className="section-copy">۱۰۰ امتیاز اجتماعی داری؛ هر بار ۱۰ امتیاز به نسخه‌ای که می‌پسندی بده.</p>
            <div className="submission-list">
              {feed.map((item) => (
                <article className="submission-card" key={item.id}>
                  <div className="submission-meta">
                    <span className="avatar">{String(item.display_name || "R").slice(0, 1).toUpperCase()}</span>
                    <div><strong>{item.display_name || "Rapper " + item.fid}</strong><small>FID {item.fid || "—"}</small></div>
                    {item.is_wildcard && <span className="wildcard">WILDCARD</span>}
                  </div>
                  <p className="submission-verse">{item.submission_text}</p>
                  <div className="submission-footer">
                    <span>کد {item.score_code || 0} <i>·</i> جامعه {item.score_community || 0}</span>
                    {item.id !== "own" && (
                      <button className="vote-button" onClick={() => voteFor(item.id)} disabled={loading || remainingPoints <= 0}>
                        +۱۰ رأی اجتماعی
                      </button>
                    )}
                  </div>
                </article>
              ))}
              {game.submission && !feed.some((item) => item.id === "own") && (
                <article className="submission-card own-card">
                  <div className="submission-meta"><span className="avatar own-avatar">تو</span><div><strong>نسخهٔ تو</strong><small>امتیاز کد {game.scoreCode}</small></div>{game.submission.is_wildcard && <span className="wildcard">WILDCARD</span>}</div>
                  <p className="submission-verse">{game.submission.submission_text}</p>
                </article>
              )}
            </div>
          </section>
        )}

        {screen === "leaderboard" && (
          <section className="panel leaderboard-panel">
            <div className="section-heading">
              <div><p className="eyebrow">WEEKLY RANKING</p><h2>جدول هفتگی</h2></div>
              <span className="week-badge">هفتهٔ جاری</span>
            </div>
            <div className="leaderboard-list">
              {leaderboard.map((person, index) => (
                <div className="leader-row" key={person.fid}>
                  <span className={"rank rank-" + (index + 1)}>{String(index + 1).padStart(2, "0")}</span>
                  <span className="avatar">{String(person.display_name || "R").slice(0, 1).toUpperCase()}</span>
                  <div className="leader-person"><strong>{person.display_name || "Rapper " + person.fid}</strong><small>FID {person.fid}</small></div>
                  <div className="leader-score"><strong>{person.total_score}</strong><small>امتیاز کل</small></div>
                </div>
              ))}
            </div>
            <div className="badge-note"><span>✦</span><p>سه نفر اول هفته، نشان دائمی می‌گیرن. NFT و بازارچه توی مرحلهٔ بعدی اضافه می‌شن.</p></div>
          </section>
        )}

        {notice && <div className="toast" role="status">{notice}<button onClick={() => setNotice("")} aria-label="بستن">×</button></div>}
      </main>

      <footer className="footer">
        <span>RAPPUZZLE</span>
        <span>ساخته‌شده برای بازی با کلمه‌ها.</span>
      </footer>
    </div>
  );
}
