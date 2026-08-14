import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  ExternalLink,
  Eye,
  EyeOff,
  Flame,
  HelpCircle,
  Image as ImageIcon,
  ListMusic,
  Mail,
  Menu,
  MessageSquare,
  Moon,
  Pause,
  Play,
  Radio,
  Share2,
  Shuffle,
  SkipBack,
  SkipForward,
  Sparkles,
  Volume2,
  VolumeX,
  X,
} from "lucide-react";

import bg2Image from "@/assets/bg2.png";
import bgOriginal from "@/assets/bg.png";
import bg3D from "@/assets/mehfil-bg-3d.png";
import {
  AUTHENTIC_GHAZALS,
  SPOTIFY_PLAYLIST_URL,
  YOUTUBE_PLAYLIST_URL,
  type Track,
} from "@/data/tracks";
import { useListenerCount } from "@/hooks/use-listener-count";

interface YTVideoData {
  title?: string;
  author?: string;
  video_id?: string;
}

interface YTPlayerInstance {
  playVideo: () => void;
  pauseVideo: () => void;
  nextVideo: () => void;
  previousVideo: () => void;
  seekTo: (seconds: number, allowSeekAhead: boolean) => void;
  mute: () => void;
  unMute: () => void;
  setVolume: (volume: number) => void;
  getCurrentTime: () => number;
  getDuration: () => number;
  getVideoData: () => YTVideoData;
  loadVideoById: (id: string) => void;
}

interface YTPlayerEvent {
  target: YTPlayerInstance;
  data: number;
}

declare global {
  interface Window {
    YT: {
      Player: new (elementId: string, options: Record<string, unknown>) => YTPlayerInstance;
    };
    onYouTubeIframeAPIReady: (() => void) | undefined;
  }
}

const STORAGE_KEY = "mehfil_user_playback_state";

interface SavedState {
  index: number;
  progress: number;
  muted: boolean;
  shuffle: boolean;
  updatedAt: number;
}

function loadSavedState(): SavedState {
  const defaultRandomIndex = Math.floor(Math.random() * AUTHENTIC_GHAZALS.length);
  if (typeof window === "undefined") {
    return { index: defaultRandomIndex, progress: 0, muted: false, shuffle: true, updatedAt: Date.now() };
  }
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      const parsed = JSON.parse(saved);
      const muted = Boolean(parsed.muted);
      const shuffle = typeof parsed.shuffle === "boolean" ? parsed.shuffle : true;
      const updatedAt = typeof parsed.updatedAt === "number" ? parsed.updatedAt : 0;

      // Active listening session within last 15 minutes -> resume song & position
      const isRecentSession = Date.now() - updatedAt < 15 * 60 * 1000;
      if (isRecentSession) {
        const index =
          typeof parsed.index === "number" &&
            parsed.index >= 0 &&
            parsed.index < AUTHENTIC_GHAZALS.length
            ? parsed.index
            : defaultRandomIndex;
        const progress = typeof parsed.progress === "number" && parsed.progress >= 0 ? parsed.progress : 0;
        return { index, progress, muted, shuffle, updatedAt };
      } else {
        // Fresh visit / new session -> pick a fresh random Ghazal
        return { index: defaultRandomIndex, progress: 0, muted: false, shuffle: true, updatedAt: Date.now() };
      }
    }
  } catch (e) {
    console.warn("Failed to read playback state from localStorage:", e);
  }
  return { index: defaultRandomIndex, progress: 0, muted: false, shuffle: true, updatedAt: Date.now() };
}

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "MEHFIL — A Late-Night Ghazal Room" },
      {
        name: "description",
        content:
          "MEHFIL is a cinematic listening room for Ghazals — Jagjit Singh, Mehdi Hassan, Ghulam Ali, Pankaj Udhas, Piyush Mishra & Farida Khanum.",
      },
      { property: "og:site_name", content: "MEHFIL" },
      { property: "og:title", content: "MEHFIL — A Late-Night Ghazal Room" },
      {
        property: "og:description",
        content:
          "A quiet night in an old city. Somewhere inside, a ghazal is playing and everyone has gone silent.",
      },
      { property: "og:url", content: "https://mehfilroom.online/" },
      { property: "og:image", content: "https://mehfilroom.online/logo.png" },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "twitter:image", content: "https://mehfilroom.online/logo.png" },
    ],
    links: [{ rel: "canonical", href: "https://mehfilroom.online/" }],
    scripts: [
      {
        type: "application/ld+json",
        children: JSON.stringify({
          "@context": "https://schema.org",
          "@type": "MusicPlaylist",
          name: "MEHFIL Late-Night Ghazals",
          description: "Curated collection of timeless Ghazal masterpieces.",
          url: "https://mehfilroom.online/",
          image: "https://mehfilroom.online/logo.png",
          genre: "Ghazal",
          numTracks: 51,
        }),
      },
    ],
  }),
  component: Mehfil,
});

function fmt(s: number): string {
  if (!Number.isFinite(s) || s < 0) return "0:00";
  const m = Math.floor(s / 60);
  const r = Math.floor(s % 60);
  return `${m}:${r.toString().padStart(2, "0")}`;
}

const ARTIST_LIST = [
  "All",
  "Jagjit Singh",
  "Mehdi Hassan",
  "Ghulam Ali",
  "Pankaj Udhas",
  "Piyush Mishra",
  "Nusrat Fateh Ali Khan",
  "Sajjad Ali",
  "Kishore Kumar",
  "Javed Bashir",
  "Farida Khanum",
  "Chandan Dass",
  "Begum Akhtar",
];

export function Mehfil() {
  const listeners = useListenerCount();

  const savedStateRef = useRef<SavedState | null>(null);
  if (savedStateRef.current === null) {
    savedStateRef.current = loadSavedState();
  }

  const [now, setNow] = useState<string | null>(null);
  const [index, setIndex] = useState(savedStateRef.current.index);
  const [playing, setPlaying] = useState(false);
  const [progress, setProgress] = useState(savedStateRef.current.progress);
  const [duration, setDuration] = useState(0);
  const [muted, setMuted] = useState(savedStateRef.current.muted);
  const [shuffle, setShuffle] = useState(savedStateRef.current.shuffle);
  const [drift, setDrift] = useState({ x: 0, y: 0 });
  const [notice, setNotice] = useState<string | null>(null);
  const [showVideo, setShowVideo] = useState(false);
  const [showTrackList, setShowTrackList] = useState(false);
  const [showInfoModal, setShowInfoModal] = useState(false);
  const [sleepSecondsLeft, setSleepSecondsLeft] = useState<number | null>(null);
  const [selectedArtist, setSelectedArtist] = useState<string>("All");
  const [lampGlow, setLampGlow] = useState(true);
  const [bgSelection, setBgSelection] = useState<"clean" | "classic" | "haveli">("classic");
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  const activeBg =
    bgSelection === "clean" ? bg2Image : bgSelection === "classic" ? bgOriginal : bg3D;

  const ytPlayerRef = useRef<YTPlayerInstance | null>(null);
  const ytReadyRef = useRef(false);
  const [ytReady, setYtReady] = useState(false);
  const silentAnchorRef = useRef<HTMLAudioElement | null>(null);
  const barRef = useRef<HTMLDivElement>(null);
  const isInitialMount = useRef(true);
  const shuffleRef = useRef(shuffle);
  shuffleRef.current = shuffle;

  const track: Track = AUTHENTIC_GHAZALS[index] ?? AUTHENTIC_GHAZALS[0]!;

  // Clock Ticker
  useEffect(() => {
    const tick = () =>
      setNow(new Date().toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }));
    tick();
    const id = setInterval(tick, 10_000);
    return () => clearInterval(id);
  }, []);

  // Sleep Timer Countdown
  useEffect(() => {
    if (sleepSecondsLeft === null) return;
    if (sleepSecondsLeft <= 0) {
      setPlaying(false);
      const yt = ytPlayerRef.current;
      if (ytReadyRef.current && yt && typeof yt.pauseVideo === "function") {
        yt.pauseVideo();
      }
      setNotice("Sleep timer finished. Sweet dreams 🌙");
      setTimeout(() => setNotice(null), 4000);
      setSleepSecondsLeft(null);
      return;
    }

    const timer = setInterval(() => {
      setSleepSecondsLeft((s) => (s !== null ? s - 1 : null));
    }, 1000);

    return () => clearInterval(timer);
  }, [sleepSecondsLeft]);

  const handleSetSleepTimer = (mins: number | null) => {
    if (mins === null) {
      setSleepSecondsLeft(null);
      setNotice("Sleep timer off");
    } else {
      setSleepSecondsLeft(mins * 60);
      setNotice(`Sleep timer set to ${mins} minutes 🌙`);
    }
    setTimeout(() => setNotice(null), 3000);
  };

  // Save playback activity state to localStorage
  useEffect(() => {
    try {
      localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({ index, progress, muted, shuffle, updatedAt: Date.now() })
      );
    } catch (e) {
      // Ignore quota errors
    }
  }, [index, progress, muted, shuffle]);

  // Zero-latency image preloading for adjacent tracks
  useEffect(() => {
    const nextIndex = (index + 1) % AUTHENTIC_GHAZALS.length;
    const prevIndex = (index - 1 + AUTHENTIC_GHAZALS.length) % AUTHENTIC_GHAZALS.length;

    const nextTrack = AUTHENTIC_GHAZALS[nextIndex];
    const prevTrack = AUTHENTIC_GHAZALS[prevIndex];

    if (nextTrack?.cover_url) {
      const imgNext = new Image();
      imgNext.src = nextTrack.cover_url;
    }

    if (prevTrack?.cover_url) {
      const imgPrev = new Image();
      imgPrev.src = prevTrack.cover_url;
    }
  }, [index]);

  // Reset progress on track change (except initial load)
  useEffect(() => {
    if (isInitialMount.current) {
      isInitialMount.current = false;
      return;
    }
    setProgress(0);
  }, [index]);

  // Parallax Background Drift
  useEffect(() => {
    const onMove = (e: PointerEvent) => {
      setDrift({
        x: (e.clientX / window.innerWidth - 0.5) * 2,
        y: (e.clientY / window.innerHeight - 0.5) * 2,
      });
    };
    window.addEventListener("pointermove", onMove);
    return () => window.removeEventListener("pointermove", onMove);
  }, []);

  const getNextTrackIndex = useCallback((current: number, isShuffle: boolean) => {
    if (isShuffle && AUTHENTIC_GHAZALS.length > 1) {
      let next: number;
      do {
        next = Math.floor(Math.random() * AUTHENTIC_GHAZALS.length);
      } while (next === current);
      return next;
    }
    return (current + 1) % AUTHENTIC_GHAZALS.length;
  }, []);

  const getPrevTrackIndex = useCallback((current: number, isShuffle: boolean) => {
    if (isShuffle && AUTHENTIC_GHAZALS.length > 1) {
      let prev: number;
      do {
        prev = Math.floor(Math.random() * AUTHENTIC_GHAZALS.length);
      } while (prev === current);
      return prev;
    }
    return (current - 1 + AUTHENTIC_GHAZALS.length) % AUTHENTIC_GHAZALS.length;
  }, []);

  // Initialize YouTube IFrame API
  useEffect(() => {
    const initYT = () => {
      if (!window.YT || !window.YT.Player) return;

      try {
        ytPlayerRef.current = new window.YT.Player("mehfil-yt-player-element", {
          height: "100%",
          width: "100%",
          videoId: track.youtube_id,
          playerVars: {
            autoplay: 0,
            controls: 1,
            modestbranding: 1,
            enablejsapi: 1,
            rel: 0,
            origin: window.location.origin,
          },
          events: {
            onReady: (event: YTPlayerEvent) => {
              ytReadyRef.current = true;
              setYtReady(true);
              if (typeof event.target.setVolume === "function") {
                event.target.setVolume(100);
              }
              if (savedStateRef.current?.progress && savedStateRef.current.progress > 0) {
                if (typeof event.target.seekTo === "function") {
                  event.target.seekTo(savedStateRef.current.progress, true);
                }
              }
              if (savedStateRef.current?.muted) {
                if (typeof event.target.mute === "function") {
                  event.target.mute();
                }
              }
            },
            onStateChange: (event: YTPlayerEvent) => {
              // 1 = PLAYING, 2 = PAUSED, 0 = ENDED
              if (event.data === 1) {
                setPlaying(true);
              } else if (event.data === 2) {
                setPlaying(false);
              } else if (event.data === 0) {
                setPlaying(false);
                setIndex((prev) => getNextTrackIndex(prev, shuffleRef.current));
              }
            },
          },
        });
      } catch (err) {
        console.error("YouTube Player init warning:", err);
      }
    };

    if (window.YT && window.YT.Player) {
      initYT();
    } else {
      const tag = document.createElement("script");
      tag.src = "https://www.youtube.com/iframe_api";
      const firstScriptTag = document.getElementsByTagName("script")[0];
      firstScriptTag?.parentNode?.insertBefore(tag, firstScriptTag);
      window.onYouTubeIframeAPIReady = initYT;
    }
  }, [getNextTrackIndex]);

  // Silent Audio Anchor Engine: Keeps mobile OS background audio session active without affecting song playback
  useEffect(() => {
    if (typeof window === "undefined") return;

    // 1-second silent WAV data URI
    const silentAudio = new Audio("data:audio/wav;base64,UklGRigAAABXQVZFZm10IBIAAAABAAEARKwAAIhYAQACABAAAABkYXRhAgAAAAEA");
    silentAudio.loop = true;
    silentAudio.volume = 0.001;
    silentAnchorRef.current = silentAudio;

    return () => {
      silentAudio.pause();
      silentAnchorRef.current = null;
    };
  }, []);

  // Sync silent audio anchor with playing state
  useEffect(() => {
    const silent = silentAnchorRef.current;
    if (silent) {
      if (playing) {
        silent.play().catch(() => {});
      } else {
        silent.pause();
      }
    }
  }, [playing]);

  // Fast Load new track into YouTube Player on index change
  useEffect(() => {
    const player = ytPlayerRef.current;
    if (ytReady && player && typeof player.loadVideoById === "function") {
      player.loadVideoById(track.youtube_id);
      if (playing && typeof player.playVideo === "function") {
        player.playVideo();
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [index, track.youtube_id, ytReady]);

  // Poll progress & duration from YouTube Player
  useEffect(() => {
    if (!playing || !ytPlayerRef.current || !ytReady) return;

    const interval = setInterval(() => {
      const player = ytPlayerRef.current;
      if (player && typeof player.getCurrentTime === "function") {
        const cur = player.getCurrentTime() || 0;
        const dur = player.getDuration() || 0;
        setProgress(cur);
        setDuration(dur);
      }
    }, 500);

    return () => clearInterval(interval);
  }, [playing, ytReady]);

  // Controls
  const togglePlay = () => {
    const player = ytPlayerRef.current;

    if (ytReady && player && typeof player.playVideo === "function") {
      if (playing) {
        player.pauseVideo();
        silentAnchorRef.current?.pause();
        setPlaying(false);
      } else {
        try {
          silentAnchorRef.current?.play().catch(() => {});
          if (typeof player.unMute === "function") player.unMute();
          if (typeof player.setVolume === "function") player.setVolume(100);
          player.playVideo();
          setPlaying(true);
        } catch {
          setNotice("Click play again to start audio.");
          setTimeout(() => setNotice(null), 3000);
        }
      }
    } else {
      setPlaying((p) => !p);
      setNotice("Loading YouTube audio...");
      setTimeout(() => setNotice(null), 3000);
    }
  };

  const goNext = useCallback(() => {
    setIndex((prev) => getNextTrackIndex(prev, shuffle));
  }, [getNextTrackIndex, shuffle]);

  const goPrev = useCallback(() => {
    setIndex((prev) => getPrevTrackIndex(prev, shuffle));
  }, [getPrevTrackIndex, shuffle]);

  // Media Session API for lock screen controls & playback metadata
  useEffect(() => {
    if (typeof window !== "undefined" && "mediaSession" in navigator) {
      try {
        navigator.mediaSession.metadata = new MediaMetadata({
          title: track.title,
          artist: track.artist,
          album: track.album || "Mehfil Ghazal Room",
          artwork: [
            { src: track.cover_url, sizes: "512x512", type: "image/jpeg" },
          ],
        });

        navigator.mediaSession.setActionHandler("play", () => {
          setPlaying(true);
          silentAnchorRef.current?.play().catch(() => {});
          const player = ytPlayerRef.current;
          if (player && typeof player.playVideo === "function") player.playVideo();
        });

        navigator.mediaSession.setActionHandler("pause", () => {
          setPlaying(false);
          silentAnchorRef.current?.pause();
          const player = ytPlayerRef.current;
          if (player && typeof player.pauseVideo === "function") player.pauseVideo();
        });

        navigator.mediaSession.setActionHandler("previoustrack", () => {
          goPrev();
        });

        navigator.mediaSession.setActionHandler("nexttrack", () => {
          goNext();
        });
      } catch (err) {
        // Ignore unsupported media session actions
      }
    }
  }, [track, goPrev, goNext]);

  const toggleShuffle = () => {
    setShuffle((s) => {
      const next = !s;
      setNotice(next ? "Shuffle Mode On" : "Sequential Mode");
      setTimeout(() => setNotice(null), 2500);
      return next;
    });
  };

  const shareGhazal = () => {
    const shareText = `Listening to "${track.title}" by ${track.artist} on Mehfil 🕯️\n${window.location.origin}`;
    if (typeof navigator !== "undefined" && navigator.clipboard) {
      navigator.clipboard.writeText(shareText);
      setNotice("Ghazal link copied to clipboard! 📜");
      setTimeout(() => setNotice(null), 3000);
    }
  };

  const selectTrack = (i: number) => {
    setIndex(i);
    setShowTrackList(false);
    setPlaying(true);
    const player = ytPlayerRef.current;
    if (ytReady && player && typeof player.playVideo === "function") {
      player.playVideo();
    }
  };

  const seek = (e: React.MouseEvent<HTMLDivElement>) => {
    const el = barRef.current;
    const player = ytPlayerRef.current;
    if (!el || !duration) return;

    const rect = el.getBoundingClientRect();
    const ratio = Math.min(Math.max((e.clientX - rect.left) / rect.width, 0), 1);
    const seekTime = ratio * duration;

    setProgress(seekTime);
    if (ytReady && player && typeof player.seekTo === "function") {
      player.seekTo(seekTime, true);
    }
  };

  const toggleMute = () => {
    setMuted((m) => {
      const next = !m;
      const player = ytPlayerRef.current;
      if (ytReady && player) {
        if (next && typeof player.mute === "function") player.mute();
        else if (!next && typeof player.unMute === "function") player.unMute();
      }
      return next;
    });
  };

  // Keyboard Shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      if (e.code === "Space") {
        e.preventDefault();
        togglePlay();
      } else if (e.code === "ArrowRight") {
        goNext();
      } else if (e.code === "ArrowLeft") {
        goPrev();
      } else if (e.key === "m" || e.key === "M") {
        toggleMute();
      } else if (e.key === "s" || e.key === "S") {
        toggleShuffle();
      } else if (e.key === "v" || e.key === "V") {
        setShowVideo((v) => !v);
      } else if (e.key === "l" || e.key === "L") {
        setShowTrackList((t) => !t);
      } else if (e.key === "?" || e.key === "h" || e.key === "H") {
        setShowInfoModal((i) => !i);
      } else if (e.key === "g" || e.key === "G") {
        setLampGlow((g) => {
          const next = !g;
          setNotice(next ? "Warm Lamp Light On 🪔" : "Dim Midnight Light 🌙");
          setTimeout(() => setNotice(null), 2500);
          return next;
        });
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [goNext, goPrev]);

  const pct = duration ? (progress / duration) * 100 : 0;

  const filteredTracks = selectedArtist === "All"
    ? AUTHENTIC_GHAZALS
    : AUTHENTIC_GHAZALS.filter((t) => t.artist.toLowerCase().includes(selectedArtist.toLowerCase()));

  return (
    <main className="relative min-h-screen w-screen overflow-hidden bg-background text-foreground select-none flex flex-col justify-between">
      {/* YouTube Player Container */}
      <div
        className={`fixed right-4 sm:right-6 top-16 sm:top-20 z-40 w-72 sm:w-80 h-44 sm:h-48 rounded-2xl overflow-hidden border border-cream/20 shadow-2xl bg-black/90 transition-all duration-300 ${showVideo
          ? "opacity-100 scale-100 pointer-events-auto"
          : "opacity-0 scale-95 pointer-events-none absolute -left-[9999px] -top-[9999px]"
          }`}
      >
        <div id="mehfil-yt-player-element" className="w-full h-full" />
      </div>

      {/* Instructions & About Pop-up Modal */}
      {showInfoModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md transition-all animate-in fade-in duration-200">
          <div className="relative w-full max-w-md max-h-[85vh] flex flex-col rounded-3xl border border-cream/20 bg-[#160b0e] text-cream shadow-2xl overflow-hidden">
            <div className="flex items-center justify-between px-6 py-4 border-b border-cream/10 bg-black/30">
              <div className="flex items-center gap-2">
                <Sparkles className="h-5 w-5 text-amber-300" />
                <h2 className="font-display text-lg tracking-wide">Welcome to Mehfil</h2>
              </div>
              <button
                onClick={() => setShowInfoModal(false)}
                className="p-1 rounded-full text-cream/60 hover:text-cream hover:bg-cream/10 transition-colors cursor-pointer"
                title="Close guide"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-5 space-y-5 text-xs text-cream/80 leading-relaxed scrollbar-thin">
              <div>
                <h3 className="font-semibold text-cream text-sm mb-1 uppercase tracking-wider text-amber-200">
                  A Late-Night Ghazal Room
                </h3>
                <p className="text-cream/70">
                  Mehfil is a quiet, atmospheric space designed for late-night Ghazal lovers. It curates timeless masterpieces from Jagjit Singh, Mehdi Hassan, Ghulam Ali, Pankaj Udhas, Farida Khanum, and more.
                </p>
              </div>

              <div className="rounded-2xl border border-cream/10 bg-black/20 p-3.5 space-y-2">
                <h4 className="font-semibold text-cream uppercase tracking-wider text-[11px] flex items-center gap-1.5">
                  <Radio className="h-3.5 w-3.5 text-ember" /> How Room Playback Works
                </h4>
                <ul className="space-y-1.5 text-cream/70 list-disc list-inside">
                  <li><strong className="text-cream">Smart Random & Resume:</strong> Fresh visits start with a random Ghazal. Active listening resumes right where you left off.</li>
                  <li><strong className="text-cream">Shuffle Mode:</strong> Toggle shuffle anytime to randomize the order.</li>
                  <li><strong className="text-cream">Playlist:</strong> Browse and choose from all handpicked Ghazals.</li>
                </ul>
              </div>

              <div>
                <h3 className="font-semibold text-cream text-xs mb-2 uppercase tracking-wider text-amber-200">
                  Controls & Shortcuts
                </h3>
                <div className="grid grid-cols-2 gap-2 text-[11px]">
                  <div className="p-2 rounded-xl border border-cream/10 bg-cream/5 flex items-center justify-between">
                    <span>Play / Pause</span>
                    <kbd className="px-1.5 py-0.5 rounded bg-cream/15 text-cream font-mono text-[10px]">Space</kbd>
                  </div>
                  <div className="p-2 rounded-xl border border-cream/10 bg-cream/5 flex items-center justify-between">
                    <span>Next / Previous</span>
                    <kbd className="px-1.5 py-0.5 rounded bg-cream/15 text-cream font-mono text-[10px]">← / →</kbd>
                  </div>
                  <div className="p-2 rounded-xl border border-cream/10 bg-cream/5 flex items-center justify-between">
                    <span>Shuffle Mode</span>
                    <kbd className="px-1.5 py-0.5 rounded bg-cream/15 text-cream font-mono text-[10px]">S</kbd>
                  </div>
                  <div className="p-2 rounded-xl border border-cream/10 bg-cream/5 flex items-center justify-between">
                    <span>Playlist Menu</span>
                    <kbd className="px-1.5 py-0.5 rounded bg-cream/15 text-cream font-mono text-[10px]">L</kbd>
                  </div>
                </div>
              </div>

              <div className="pt-2 border-t border-cream/10">
                <h3 className="font-semibold text-cream text-xs mb-1.5 uppercase tracking-wider text-amber-200 flex items-center gap-1.5">
                  <MessageSquare className="h-3.5 w-3.5" /> Suggest a Ghazal / Add Songs
                </h3>
                <p className="text-cream/70 mb-2.5">
                  Have a favorite Ghazal link or suggestion you’d love to add to Mehfil? Send your suggestions to:
                </p>
                <a
                  href="mailto:anantdadhich66@gmail.com"
                  className="inline-flex items-center gap-2 rounded-full border border-cream/20 bg-cream/10 px-4 py-2 text-xs font-medium text-amber-200 hover:bg-cream/20 transition-all select-all"
                >
                  <Mail className="h-3.5 w-3.5" /> anantdadhich66@gmail.com
                </a>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Track List Drawer Modal with Artist Quick Filters */}
      {showTrackList && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md transition-all animate-in fade-in duration-200">
          <div className="relative w-full max-w-lg max-h-[85vh] flex flex-col rounded-3xl border border-cream/20 bg-[#160b0e] text-cream shadow-2xl overflow-hidden">
            <div className="flex items-center justify-between px-6 py-4 border-b border-cream/10 bg-black/30">
              <div className="flex items-center gap-2">
                <ListMusic className="h-5 w-5 text-cream/80" />
                <h2 className="font-display text-lg tracking-wide">Mehfil Collection</h2>
              </div>
              <button
                onClick={() => setShowTrackList(false)}
                className="p-1 rounded-full text-cream/60 hover:text-cream hover:bg-cream/10 transition-colors"
                title="Close (L)"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Artist Quick Filter Chips */}
            <div className="flex items-center gap-2 px-4 py-3 border-b border-cream/10 overflow-x-auto scrollbar-none">
              {ARTIST_LIST.map((artistName) => (
                <button
                  key={artistName}
                  onClick={() => setSelectedArtist(artistName)}
                  className={`px-3 py-1 rounded-full text-[11px] font-medium shrink-0 transition-all ${selectedArtist === artistName
                    ? "bg-cream text-ink font-semibold"
                    : "bg-cream/10 text-cream/70 hover:bg-cream/20 hover:text-cream"
                    }`}
                >
                  {artistName}
                </button>
              ))}
            </div>

            <div className="flex-1 overflow-y-auto p-4 space-y-1 divide-y divide-cream/5 scrollbar-thin">
              {filteredTracks.map((t) => {
                const origIndex = AUTHENTIC_GHAZALS.findIndex((item) => item.id === t.id);
                return (
                  <button
                    key={t.id}
                    onClick={() => selectTrack(origIndex)}
                    className={`w-full flex items-center gap-4 p-3 rounded-xl transition-all text-left group ${origIndex === index
                      ? "bg-cream/15 text-cream font-semibold ring-1 ring-cream/30"
                      : "hover:bg-cream/5 text-cream/80 hover:text-cream"
                      }`}
                  >
                    <span className="text-xs font-mono w-6 shrink-0 text-cream/40 group-hover:text-cream/70">
                      {String(origIndex + 1).padStart(2, "0")}
                    </span>
                    <img
                      src={t.cover_url}
                      alt={t.title}
                      className="h-10 w-10 rounded-full object-cover shrink-0 ring-1 ring-cream/20"
                    />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm">{t.title}</p>
                      <p className="truncate text-xs text-cream/50">{t.artist}</p>
                    </div>
                    {origIndex === index && (
                      <span className="h-2 w-2 rounded-full bg-ember shadow-[0_0_8px_var(--ember)] animate-pulse" />
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* Atmospheric Background Layer with drift */}
      <div
        className="absolute inset-[-4%] bg-cover bg-center animate-breathe will-change-transform brightness-115"
        style={{
          backgroundImage: `url(${activeBg})`,
          transform: `translate3d(${drift.x * -14}px, ${drift.y * -4}px, 0) scale(1.06)`,
          transition: "transform 1.4s cubic-bezier(0.16,1,0.3,1)",
        }}
      />
      {/* Interactive Golden Candle / Lamp Glow Overlay */}
      <div
        className={`pointer-events-none absolute inset-0 transition-opacity duration-1000 z-10 ${lampGlow ? "opacity-100" : "opacity-0"
          }`}
        style={{
          background:
            "radial-gradient(ellipse 85% 65% at 50% 38%, rgba(251, 191, 36, 0.22), rgba(245, 158, 11, 0.12) 45%, rgba(0, 0, 0, 0.4) 90%)",
        }}
      />
      <div className="pointer-events-none absolute inset-0 bg-scene-veil z-10" />
      <div className="pointer-events-none absolute inset-0 bg-grain opacity-[0.16] mix-blend-overlay z-10" />

      {/* Top Header Bar */}
      <header className="relative z-20 flex items-center justify-between gap-3 px-4 pt-4 text-xs uppercase tracking-[0.18em] text-cream/80 sm:px-8 sm:pt-7 sm:text-xs">
        {/* Left: Time + Live Listeners + Sleep Timer */}
        <div className="flex items-center gap-2.5 sm:gap-3.5 shrink-0 rounded-full border border-cream/15 bg-black/40 px-3.5 py-1.5 backdrop-blur-xl shadow-lg">
          <span className="tabular-nums font-semibold text-cream text-xs sm:text-xs">{now ?? "—"}</span>
          <span className="flex items-center gap-1.5 text-[11px] sm:text-xs text-cream/85">
            <span className="h-1.5 w-1.5 rounded-full bg-ember shadow-[0_0_8px_var(--ember)] animate-pulse-soft" />
            {listeners} <span className="inline">listening</span>
          </span>
          {sleepSecondsLeft !== null && (
            <span className="flex items-center gap-1 text-[11px] text-amber-300 font-mono bg-cream/15 px-2 py-0.5 rounded-full">
              <Moon className="h-3 w-3" /> {fmt(sleepSecondsLeft)}
            </span>
          )}
        </div>

        {/* Desktop Navigation Links (md:flex) */}
        <nav className="hidden md:flex items-center gap-3 sm:gap-4 lg:gap-5 text-[11px] sm:text-xs font-medium tracking-[0.18em]">
          <button
            onClick={() => {
              setLampGlow((g) => {
                const next = !g;
                setNotice(next ? "Warm Lamp Light On 🪔" : "Dim Midnight Light 🌙");
                setTimeout(() => setNotice(null), 2500);
                return next;
              });
            }}
            className="link-quiet flex items-center gap-1 cursor-pointer"
            title="Toggle Warm Lamp Light (G)"
          >
            <Flame className={`h-3.5 w-3.5 ${lampGlow ? "text-amber-400 animate-pulse" : "text-cream/50"}`} />
            <span>{lampGlow ? "Warm Light" : "Dim Light"}</span>
          </button>
          <button
            onClick={() => {
              setBgSelection((curr) => {
                const next = curr === "classic" ? "clean" : curr === "clean" ? "haveli" : "classic";
                const label =
                  next === "classic"
                    ? "Classic Room"
                    : next === "clean"
                      ? "Warm Room"
                      : "Haveli Room";
                setNotice(`${label} Atmosphere`);
                setTimeout(() => setNotice(null), 2500);
                return next;
              });
            }}
            className="link-quiet flex items-center gap-1 cursor-pointer"
            title="Switch Room Atmosphere"
          >
            <ImageIcon className="h-3.5 w-3.5 text-amber-300" />
            <span>
              {bgSelection === "classic"
                ? "Classic Room"
                : bgSelection === "clean"
                  ? "Warm Room"
                  : "Haveli Room"}
            </span>
          </button>
          <button
            onClick={() => setShowInfoModal(true)}
            className="link-quiet flex items-center gap-1 cursor-pointer"
            title="Guide & Info (?)"
          >
            <HelpCircle className="h-3.5 w-3.5 text-amber-300" />
            <span>Guide</span>
          </button>
          <button
            onClick={() => setShowVideo((v) => !v)}
            className="link-quiet flex items-center gap-1.5 cursor-pointer"
            title="Toggle YouTube Video View (V)"
          >
            {showVideo ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
            <span>{showVideo ? "Hide Video" : "Show Video"}</span>
          </button>
          <button
            onClick={() => setShowTrackList((t) => !t)}
            className="link-quiet flex items-center gap-1.5 cursor-pointer"
            title="Browse all Ghazals (L)"
          >
            <ListMusic className="h-3.5 w-3.5" />
            <span>Playlist</span>
          </button>
          <a
            className="link-quiet flex items-center gap-1 text-emerald-400 hover:text-emerald-300 transition-colors"
            href={SPOTIFY_PLAYLIST_URL}
            target="_blank"
            rel="noreferrer noopener"
            title="Spotify Ghazal Playlist"
          >
            <span>Spotify</span> <ExternalLink className="h-3 w-3 opacity-75" />
          </a>
          <a
            className="link-quiet flex items-center gap-1 text-red-400 hover:text-red-300 transition-colors"
            href={YOUTUBE_PLAYLIST_URL}
            target="_blank"
            rel="noreferrer noopener"
            title="YouTube Music Ghazal Mix"
          >
            <span>YouTube</span> <ExternalLink className="h-3 w-3 opacity-75" />
          </a>
        </nav>

        {/* Mobile Hamburger Menu Toggle (md:hidden) */}
        <div className="flex md:hidden items-center gap-2">
          <button
            onClick={() => setMobileNavOpen((o) => !o)}
            className="flex items-center gap-1.5 rounded-full border border-cream/20 bg-black/50 px-3.5 py-1.5 text-cream/90 hover:text-cream hover:bg-cream/20 transition-all shadow-lg backdrop-blur-xl cursor-pointer"
            aria-label="Toggle navigation menu"
          >
            {mobileNavOpen ? <X className="h-4 w-4" /> : <Menu className="h-4 w-4" />}
            <span className="text-[11px] uppercase tracking-widest font-semibold">Menu</span>
          </button>
        </div>
      </header>

      {/* Mobile Glassmorphic Navigation Dropdown Overlay */}
      {mobileNavOpen && (
        <div className="fixed top-16 right-4 z-40 w-72 rounded-3xl border border-cream/20 bg-[#140a0c]/95 p-4.5 text-cream shadow-[0_25px_60px_rgba(0,0,0,0.95)] backdrop-blur-3xl animate-in fade-in slide-in-from-top-3 duration-200 md:hidden space-y-3">
          <div className="flex items-center justify-between border-b border-cream/10 pb-2.5">
            <span className="text-[11px] uppercase tracking-widest text-amber-300/80 font-semibold">Mehfil Navigation</span>
            <button
              onClick={() => setMobileNavOpen(false)}
              className="text-cream/50 hover:text-cream p-1 cursor-pointer"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          <div className="flex flex-col gap-2.5 text-xs sm:text-sm font-medium">
            <button
              onClick={() => {
                setLampGlow((g) => !g);
                setMobileNavOpen(false);
                setNotice(!lampGlow ? "Warm Lamp Light On 🪔" : "Dim Midnight Light 🌙");
                setTimeout(() => setNotice(null), 2500);
              }}
              className="flex items-center gap-2.5 p-2.5 rounded-2xl border border-amber-500/20 bg-amber-950/30 hover:bg-amber-900/40 text-amber-200 transition-all text-left cursor-pointer"
            >
              <Flame className="h-4 w-4 text-amber-400 animate-pulse" />
              <span>{lampGlow ? "Warm Lamp Light On 🪔" : "Dim Midnight Light 🌙"}</span>
            </button>

            <button
              onClick={() => {
                setBgSelection((curr) => (curr === "classic" ? "clean" : curr === "clean" ? "haveli" : "classic"));
                setMobileNavOpen(false);
                setNotice("Switched Room Atmosphere");
                setTimeout(() => setNotice(null), 2500);
              }}
              className="flex items-center gap-2.5 p-2.5 rounded-2xl border border-cream/10 bg-cream/5 hover:bg-cream/15 text-cream/90 transition-all text-left cursor-pointer"
            >
              <ImageIcon className="h-4 w-4 text-amber-300" />
              <span>
                {bgSelection === "classic"
                  ? "Room: Classic"
                  : bgSelection === "clean"
                    ? "Room: Warm"
                    : "Room: Haveli"}
              </span>
            </button>

            <button
              onClick={() => {
                setShowInfoModal(true);
                setMobileNavOpen(false);
              }}
              className="flex items-center gap-2.5 p-2.5 rounded-2xl border border-cream/10 bg-cream/5 hover:bg-cream/15 text-cream/90 transition-all text-left cursor-pointer"
            >
              <HelpCircle className="h-4 w-4 text-amber-300" />
              <span>Guide & Info</span>
            </button>

            <button
              onClick={() => {
                setShowVideo((v) => !v);
                setMobileNavOpen(false);
              }}
              className="flex items-center gap-2.5 p-2.5 rounded-2xl border border-cream/10 bg-cream/5 hover:bg-cream/15 text-cream/90 transition-all text-left cursor-pointer"
            >
              {showVideo ? <EyeOff className="h-4 w-4 text-amber-300" /> : <Eye className="h-4 w-4 text-amber-300" />}
              <span>{showVideo ? "Hide Video View" : "Show Video View"}</span>
            </button>

            <button
              onClick={() => {
                setShowTrackList(true);
                setMobileNavOpen(false);
              }}
              className="flex items-center gap-2.5 p-2.5 rounded-2xl border border-cream/10 bg-cream/5 hover:bg-cream/15 text-cream/90 transition-all text-left cursor-pointer"
            >
              <ListMusic className="h-4 w-4 text-amber-300" />
              <span>Browse Playlist</span>
            </button>

            <a
              href={SPOTIFY_PLAYLIST_URL}
              target="_blank"
              rel="noreferrer noopener"
              onClick={() => setMobileNavOpen(false)}
              className="flex items-center justify-between p-2.5 rounded-2xl bg-emerald-950/40 border border-emerald-500/25 text-emerald-300 hover:bg-emerald-900/40 transition-all font-medium"
            >
              <span>Spotify Playlist</span>
              <ExternalLink className="h-4 w-4 opacity-80" />
            </a>

            <a
              href={YOUTUBE_PLAYLIST_URL}
              target="_blank"
              rel="noreferrer noopener"
              onClick={() => setMobileNavOpen(false)}
              className="flex items-center justify-between p-2.5 rounded-2xl bg-red-950/40 border border-red-500/25 text-red-300 hover:bg-red-900/40 transition-all font-medium"
            >
              <span>YouTube Music Mix</span>
              <ExternalLink className="h-4 w-4 opacity-80" />
            </a>
          </div>
        </div>
      )}

      {/* Center Title */}
      <div
        className="absolute inset-x-0 top-[22%] sm:top-[18%] md:top-[16%] lg:top-[14%] z-20 flex flex-col items-center text-center pointer-events-none px-4"
        style={{
          transform: `translate3d(${drift.x * -5}px, ${drift.y * -4}px, 0)`,
          transition: "transform 1.6s cubic-bezier(0.16,1,0.3,1)",
        }}
      >
        <h1
          className={`font-display text-cream text-[16vw] sm:text-[12vw] md:text-[10vw] lg:text-[8.5vw] xl:text-[7.5vw] leading-[0.85] tracking-wide transition-all duration-700 ${lampGlow
            ? "drop-shadow-[0_0_35px_rgba(251,191,36,0.45)] text-amber-50"
            : "drop-shadow-[0_20px_60px_rgba(0,0,0,0.85)]"
            }`}
        >
          महफ़िल
        </h1>
        <p className="mt-2 text-[10px] sm:text-xs md:text-sm uppercase tracking-[0.38em] sm:tracking-[0.45em] text-cream/80 sm:mt-3 drop-shadow-md font-medium">
          A Late-Night Ghazal Room
        </p>
      </div>

      {/* Floating Pill Player Dock */}
      <div className="fixed inset-x-0 bottom-4 sm:bottom-8 md:bottom-10 z-30 flex flex-col items-center gap-2 px-3 sm:px-6">
        {notice && (
          <p className="rounded-full border border-cream/15 bg-black/60 px-4 py-1.5 text-[11px] sm:text-xs tracking-wide text-cream/90 backdrop-blur-2xl shadow-lg animate-in fade-in duration-200">
            {notice}
          </p>
        )}

        <div className="w-full max-w-[680px] rounded-full border border-cream/25 bg-[#160b0e]/95 px-4 py-3 shadow-[0_25px_60px_rgba(0,0,0,0.9)] backdrop-blur-3xl sm:px-6 sm:py-3.5">
          <div className="flex items-center gap-2.5 sm:gap-4 md:gap-5">
            {/* Circular Track Cover Art */}
            <div
              className={`relative shrink-0 cursor-pointer overflow-hidden rounded-full aspect-square h-10 w-10 sm:h-12 sm:w-12 md:h-14 md:w-14 ring-2 ring-cream/35 shadow-md flex items-center justify-center bg-black/90 ${playing ? "animate-spin-slow" : ""
                }`}
              onClick={() => setShowTrackList(true)}
              title="View playlist"
            >
              <img
                src={track.cover_url}
                alt={`${track.title} artwork`}
                width={512}
                height={512}
                loading="lazy"
                className="h-full w-full object-cover object-center rounded-full scale-130"
              />
            </div>

            {/* Song Title, Artist & Progress Bar */}
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold text-cream sm:text-base md:text-[16px]">
                {track.title}
              </p>
              <p className="truncate text-[12px] text-cream/70 sm:text-xs">{track.artist}</p>

              {/* Progress Bar */}
              <div
                ref={barRef}
                onClick={seek}
                className="group mt-1.5 cursor-pointer py-1"
                role="presentation"
              >
                <div className="relative h-[3.5px] w-full rounded-full bg-cream/20">
                  <div
                    className="absolute inset-y-0 left-0 rounded-full bg-cream/90"
                    style={{ width: `${pct}%` }}
                  />
                  <span
                    className="absolute top-1/2 h-2.5 w-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-cream opacity-0 transition-opacity group-hover:opacity-100"
                    style={{ left: `${pct}%` }}
                  />
                </div>
              </div>

              {/* Progress Timestamp */}
              <div className="mt-0.5 flex justify-start text-[11px] sm:text-xs tabular-nums text-cream/60">
                <span>
                  {fmt(progress)} / {fmt(duration)}
                </span>
              </div>
            </div>

            {/* Playback Control Buttons */}
            <div className="flex shrink-0 items-center gap-1.5 sm:gap-2.5 md:gap-3">
              <button
                onClick={shareGhazal}
                className="p-1 text-cream/60 transition-colors hover:text-cream cursor-pointer"
                title="Share Ghazal link"
              >
                <Share2 className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
              </button>

              <button
                aria-label={shuffle ? "Disable shuffle" : "Enable shuffle"}
                onClick={toggleShuffle}
                className={`p-1 transition-colors cursor-pointer ${shuffle ? "text-ember" : "text-cream/40 hover:text-cream/80"
                  }`}
                title={shuffle ? "Shuffle On (S)" : "Shuffle Off (S)"}
              >
                <Shuffle className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
              </button>

              <button
                aria-label="Previous track"
                onClick={goPrev}
                className="p-1 text-cream/70 transition-colors hover:text-cream cursor-pointer"
                title="Previous Track (Left Arrow)"
              >
                <SkipBack className="h-3.5 w-3.5 sm:h-4 sm:w-4" fill="currentColor" />
              </button>

              <button
                aria-label={playing ? "Pause" : "Play"}
                onClick={togglePlay}
                className="flex h-9 w-9 sm:h-10 sm:w-10 md:h-11 md:w-11 items-center justify-center rounded-full bg-cream text-ink shadow-[0_6px_20px_rgba(0,0,0,0.45)] transition-transform hover:scale-105 active:scale-95 cursor-pointer"
                title="Play/Pause (Spacebar)"
              >
                {playing ? (
                  <Pause className="h-3.5 w-3.5 sm:h-4 sm:w-4" fill="currentColor" />
                ) : (
                  <Play className="ml-0.5 h-3.5 w-3.5 sm:h-4 sm:w-4" fill="currentColor" />
                )}
              </button>

              <button
                aria-label="Next track"
                onClick={goNext}
                className="p-1 text-cream/70 transition-colors hover:text-cream cursor-pointer"
                title="Next Track (Right Arrow)"
              >
                <SkipForward className="h-3.5 w-3.5 sm:h-4 sm:w-4" fill="currentColor" />
              </button>

              <button
                onClick={() => {
                  const currentMins = sleepSecondsLeft !== null ? Math.round(sleepSecondsLeft / 60) : null;
                  const nextMins = currentMins === null ? 15 : currentMins === 15 ? 30 : currentMins === 30 ? 60 : null;
                  handleSetSleepTimer(nextMins);
                }}
                className={`p-1 transition-colors cursor-pointer ${sleepSecondsLeft !== null ? "text-amber-300" : "text-cream/60 hover:text-cream"
                  }`}
                title="Sleep Timer (15m / 30m / 60m / Off)"
              >
                <Moon className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
              </button>

              <button
                aria-label={muted ? "Unmute" : "Mute"}
                onClick={toggleMute}
                className="hidden p-1 text-cream/60 transition-colors hover:text-cream sm:block cursor-pointer"
                title="Mute/Unmute (M)"
              >
                {muted ? <VolumeX className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}
              </button>
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}
