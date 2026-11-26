import React, { useEffect, useMemo, useState } from "react";
import { sdk } from "@farcaster/miniapp-sdk";
import { lastWordOf, normalizePersianToken } from "../shared/normalize-persian.js";

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
const API_BASE = (import.meta.env.VITE_RAPPUZZLE_API_BASE || "").replace(/\/+$/u, "");
const initialDayKey = new Date().toISOString().slice(0, 10);

function apiUrl(path) {
  const cleanPath = String(path || "").replace(/^\/+/, "");
  return API_BASE ? API_BASE + "/" + cleanPath : "/api/" + cleanPath;
}

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

function getPointsForAttempt(attempt) {
  return [50, 30, 10][attempt - 1] || 0;
}

export default function App() {
  const [dayKey, setDayKey] = useState(initialDayKey);
  const [host, setHost] = useState({ checked: false, isMiniApp: false, fid: null, username: null });
  const [prompt, setPrompt] = useState(LIVE_REQUESTED ? null : DEMO_PROMPT);
  const [livePhase, setLivePhase] = useState(LIVE_REQUESTED ? "checking" : "preview");
  const [promptError, setPromptError] = useState("");
  const [retryCount, setRetryCount] = useState(0);
  const [screen, setScreen] = useState("play");
  const [game, setGame] = useState(() => LIVE_REQUESTED ? emptyGameState() : readGameState(storageKeyForDate(initialDayKey)));
  const [livePointsUsed, setLivePointsUsed] = useState(0);
  const [verse, setVerse] = useState("");
  const [notice, setNotice] = useState("");
  const [feed, setFeed] = useState(DEMO_SUBMISSIONS);
  const [leaderboard, setLeaderboard] = useState(DEMO_LEADERBOARD);
  const [weeklyAwards, setWeeklyAwards] = useState([]);
  const [adminPrompt, setAdminPrompt] = useState({
    active_date: initialDayKey,
    opening_line: "",
    target_rhyme_word: "",
    accepted_end_words: "",
  });
  const [loading, setLoading] = useState(false);

  const liveMode = LIVE_REQUESTED && host.checked && host.isMiniApp;
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
          setPrompt(DEMO_PROMPT);
          setGame(readGameState(storageKeyForDate(dayKey)));
          setLivePhase("preview");
        }
      } catch {
        if (mounted) {
          setHost({ checked: true, isMiniApp: false, fid: null, username: null });
          setPrompt(DEMO_PROMPT);
          setGame(readGameState(storageKeyForDate(dayKey)));
          setLivePhase("preview");
        }
      }
    }

    startMiniApp();
    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    if (liveMode || (LIVE_REQUESTED && !host.checked)) return;
    try {
      window.localStorage.setItem(storageKeyForDate(dayKey), JSON.stringify(game));
    } catch {
      // The preview still works when browser storage is unavailable.
    }
  }, [dayKey, game, host.checked, liveMode]);

  useEffect(() => {
    const timer = window.setInterval(() => {
      const currentDay = new Date().toISOString().slice(0, 10);
      if (currentDay !== dayKey) {
        setDayKey(currentDay);
        setGame(liveMode ? emptyGameState() : readGameState(storageKeyForDate(currentDay)));
        setLivePointsUsed(0);
        setPrompt(liveMode ? null : DEMO_PROMPT);
        setPromptError("");
        setLivePhase(liveMode ? "loading" : "preview");
        setFeed(liveMode ? [] : DEMO_SUBMISSIONS);
        setLeaderboard(liveMode ? [] : DEMO_LEADERBOARD);
        setWeeklyAwards([]);
        setScreen("play");
        setNotice("");
      }
    }, 15000);
    return () => window.clearInterval(timer);
  }, [dayKey, liveMode]);

  useEffect(() => {
    if (!liveMode) return;
    let mounted = true;

    async function loadLiveData() {
      setLivePhase("loading");
      setPrompt(null);
      setPromptError("");
      setGame(emptyGameState());
      setLivePointsUsed(0);
      setFeed([]);
      setLeaderboard([]);
      setWeeklyAwards([]);
      try {
        const [promptResponse, statusResponse, identityResponse] = await Promise.all([
          sdk.quickAuth.fetch(apiUrl("prompt")),
          sdk.quickAuth.fetch(apiUrl("status")),
          sdk.quickAuth.fetch(apiUrl("auth/me")),
        ]);
        const [promptData, statusData, identityData] = await Promise.all([
          promptResponse.json().catch(() => ({})),
          statusResponse.json().catch(() => ({})),
          identityResponse.json().catch(() => ({})),
        ]);
        if (!mounted) return;

        if (promptResponse.status === 404 || statusData.prompt_available === false) {
          setPrompt(null);
          setGame(emptyGameState());
          setLivePhase("no-prompt");
          setPromptError(promptData.message || "چالش امروز هنوز منتشر نشده.");
          return;
        }
        if (!promptResponse.ok) throw new Error(promptData.message || "چالش امروز بارگذاری نشد.");
        if (!statusResponse.ok) throw new Error(statusData.message || "وضعیت امروز بارگذاری نشد.");
        if (!promptData.prompt) throw new Error("پاسخ چالش امروز کامل نیست.");

        setPrompt(promptData.prompt);
        setLivePointsUsed(Number(statusData.points_used || 0));
        setGame({
          attempts: Number(statusData.attempts_used || 0),
          completed: Boolean(statusData.is_complete),
          scoreCode: Number(statusData.code_score || 0),
          submission: statusData.submission ? {
            id: statusData.submission.id,
            fid: host.fid || Number(identityData.fid) || 0,
            submission_text: statusData.submission.submission_text,
            is_wildcard: statusData.submission.is_wildcard,
            score_code: statusData.submission.score_code,
            score_community: statusData.submission.score_community,
          } : null,
          votes: {},
        });
        if (Number.isSafeInteger(Number(identityData.fid)) && Number(identityData.fid) > 0) {
          setHost((current) => ({
            ...current,
            fid: Number(identityData.fid),
            isAdmin: Boolean(identityData.is_admin),
          }));
        } else if (identityResponse.ok) {
          setHost((current) => ({ ...current, isAdmin: Boolean(identityData.is_admin) }));
        }
        setLivePhase("ready");
      } catch (error) {
        if (mounted) {
          setLivePhase("error");
          setPromptError(error.message || "اتصال به چالش برقرار نشد.");
        }
      }
    }

    loadLiveData();
    return () => {
      mounted = false;
    };
  }, [dayKey, liveMode, retryCount]);

  async function refreshFeed() {
    if (!liveMode || !game.completed) {
      setFeed(DEMO_SUBMISSIONS);
      return;
    }
    const response = await sdk.quickAuth.fetch(apiUrl("feed"));
    if (!response.ok) throw new Error("فید رأی‌گیری بارگذاری نشد.");
    const data = await response.json();
    setFeed(data.submissions || []);
  }

  async function refreshLeaderboard() {
    if (!liveMode) {
      setLeaderboard(DEMO_LEADERBOARD);
      setWeeklyAwards([]);
      return;
    }
    const response = await fetch(apiUrl("leaderboard"));
    if (!response.ok) throw new Error("جدول هفتگی بارگذاری نشد.");
    const data = await response.json();
    setLeaderboard(data.leaderboard || []);
    setWeeklyAwards(data.awards || []);
  }

  async function submitVerse(event) {
    event.preventDefault();
    if (!prompt || (liveMode && livePhase !== "ready")) return;
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
        const response = await sdk.quickAuth.fetch(apiUrl("submit"), {
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
        const endWord = lastWordOf(cleanVerse);
        const acceptedWords = Array.isArray(prompt.accepted_end_words) ? prompt.accepted_end_words : [];
        const correct = acceptedWords.some((word) => normalizePersianToken(word) === endWord);
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
        const response = await sdk.quickAuth.fetch(apiUrl("vote"), {
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

  async function publishPrompt(event) {
    event.preventDefault();
    if (!liveMode || !host.isAdmin) return;
    const acceptedEndWords = adminPrompt.accepted_end_words
      .split(/[،,\n]/u)
      .map((word) => word.trim())
      .filter(Boolean);

    setLoading(true);
    setNotice("");
    try {
      const response = await sdk.quickAuth.fetch(apiUrl("admin/prompts"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          active_date: adminPrompt.active_date,
          opening_line: adminPrompt.opening_line,
          target_rhyme_word: adminPrompt.target_rhyme_word,
          accepted_end_words: acceptedEndWords,
        }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.message || "ذخیرهٔ چالش انجام نشد.");
      setNotice("چالش " + data.prompt.active_date + " منتشر شد.");
      if (data.prompt.active_date === dayKey) {
        setRetryCount((count) => count + 1);
        setScreen("play");
      }
    } catch (error) {
      setNotice(error.message || "ذخیرهٔ چالش انجام نشد.");
    } finally {
      setLoading(false);
    }
  }

  const attemptsLeft = Math.max(0, 3 - game.attempts);
  const displayName = host.username || (host.fid ? "FID " + host.fid : "مهمان");
  const canSubmit = !liveMode || livePhase === "ready";

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
              ? livePhase === "ready"
                ? "اتصال زنده · امتیازها با هویت Farcaster ثبت می‌شن."
                : livePhase === "no-prompt"
                  ? "چالش امروز هنوز منتشر نشده."
                  : livePhase === "error"
                    ? promptError || "اتصال زنده برقرار نشد."
                    : "در حال اتصال به حساب و چالش امروز…"
              : LIVE_REQUESTED && host.checked && !host.isMiniApp
                ? "برای ثبت واقعی، برنامه رو داخل Farcaster باز کن."
                : LIVE_REQUESTED && !host.checked
                  ? "در حال بررسی محیط Farcaster…"
                  : "پیش‌نمایش محلی · امتیازها فقط روی همین مرورگر ذخیره می‌شن."}
          </span>
        </div>

        <nav className="tabs" aria-label="بخش‌های بازی">
          <button className={screen === "play" ? "tab active" : "tab"} onClick={() => setScreen("play")}>چالش امروز</button>
          <button className={screen === "feed" ? "tab active" : "tab"} onClick={openFeed} disabled={!game.completed || loading}>فید رأی‌گیری {game.completed ? "" : "🔒"}</button>
          <button className={screen === "leaderboard" ? "tab active" : "tab"} onClick={openLeaderboard} disabled={loading || (LIVE_REQUESTED && !host.checked)}>جدول هفتگی</button>
          {liveMode && host.isAdmin && <button className={screen === "admin" ? "tab active" : "tab"} onClick={() => setScreen("admin")} disabled={loading}>مدیریت چالش</button>}
        </nav>

        {screen === "play" && !prompt && (
          <section className="challenge-card panel">
            <p className="eyebrow">چالش روزانه</p>
            <h2>{livePhase === "no-prompt" ? "برای امروز چالشی منتشر نشده." : livePhase === "error" ? "اتصال به چالش برقرار نشد." : "در حال آماده‌سازی چالش…"}</h2>
            {promptError && <p className="section-copy">{promptError}</p>}
            {(livePhase === "error" || livePhase === "no-prompt") && <button className="text-button" onClick={() => setRetryCount((count) => count + 1)}>{livePhase === "no-prompt" ? "بررسی دوباره" : "تلاش دوباره"} ←</button>}
          </section>
        )}

        {screen === "play" && prompt && (
          <section className="challenge-card panel">
            <div className="card-topline">
              <span className="challenge-label"><span className="live-pulse" /> چالش امروز</span>
              <span className="date-label">{prompt.active_date || dayKey}</span>
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
                  disabled={loading || !canSubmit || game.attempts >= 3}
                />
                <div className="form-footer">
                  <span>{verse.length} / ۲۸۰</span>
                  <button className="primary-button" type="submit" disabled={loading || !canSubmit || game.attempts >= 3}>
                    {loading || !canSubmit ? "در حال بررسی…" : game.attempts === 0 ? "قافیه رو چک کن" : "تلاش دوباره"}
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
                <button className="text-button" onClick={openFeed}>رفتن به فید</button>
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
              {feed.length === 0 && <p className="section-copy">هنوز نسخه‌ای برای رأی‌گیری منتشر نشده.</p>}
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
              {leaderboard.length === 0 && <p className="section-copy">هنوز امتیازی برای این هفته ثبت نشده.</p>}
            </div>
            {weeklyAwards.length > 0 && (
              <div className="leaderboard-list">
                <p className="eyebrow">نشان‌های دائمی هفته‌های گذشته</p>
                {weeklyAwards.map((award) => (
                  <div className="leader-row" key={award.week_start + "-" + award.fid}>
                    <span className={"rank rank-" + award.badge_rank}>{String(award.badge_rank).padStart(2, "0")}</span>
                    <span className="avatar">✦</span>
                    <div className="leader-person"><strong>FID {award.fid}</strong><small>{award.week_start}</small></div>
                    <div className="leader-score"><strong>{award.total_score}</strong><small>امتیاز هفته</small></div>
                  </div>
                ))}
              </div>
            )}
            <div className="badge-note"><span>✦</span><p>سه نفر اول هر هفته، نشان دائمی می‌گیرن. NFT و بازارچه در مرحلهٔ بعدی اضافه می‌شن.</p></div>
          </section>
        )}

        {screen === "admin" && liveMode && host.isAdmin && (
          <section className="panel challenge-card">
            <div className="section-heading"><div><p className="eyebrow">ADMIN</p><h2>انتشار چالش</h2></div></div>
            <p className="section-copy">تاریخ بر اساس UTC است. واژهٔ هدف هم به فهرست قافیه‌های پذیرفته‌شده اضافه می‌شود.</p>
            <form className="admin-form" onSubmit={publishPrompt}>
              <label htmlFor="prompt-date">تاریخ انتشار</label>
              <input id="prompt-date" type="date" required value={adminPrompt.active_date} onChange={(event) => setAdminPrompt((value) => ({ ...value, active_date: event.target.value }))} />
              <label htmlFor="opening-line">خط شروع</label>
              <textarea id="opening-line" required maxLength={500} value={adminPrompt.opening_line} onChange={(event) => setAdminPrompt((value) => ({ ...value, opening_line: event.target.value }))} />
              <label htmlFor="target-word">قافیهٔ هدف</label>
              <input id="target-word" required maxLength={100} value={adminPrompt.target_rhyme_word} onChange={(event) => setAdminPrompt((value) => ({ ...value, target_rhyme_word: event.target.value }))} />
              <label htmlFor="accepted-words">واژه‌های قافیهٔ مجاز</label>
              <textarea id="accepted-words" required placeholder="با ویرگول یا خط جدید جدا کن" value={adminPrompt.accepted_end_words} onChange={(event) => setAdminPrompt((value) => ({ ...value, accepted_end_words: event.target.value }))} />
              <div className="form-footer"><span>تا ۵۰ واژه</span><button className="primary-button" type="submit" disabled={loading}>{loading ? "در حال ذخیره…" : "انتشار چالش"}</button></div>
            </form>
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
