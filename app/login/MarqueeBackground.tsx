import "./MarqueeBackground.css";

const WORDS = [
  "Assalamualaikum",
  "السلام عليكم",
  "अस्सलामु अलैकुम",
  "আস-সালামু আলাইকুম",
  "அஸ்ஸலாமு அலைக்கும்",
  "Ασσαλαμου αλέικουμ",
  "阿萨拉姆阿来库姆",
  "アッサラーム・アライクム",
  "Assalamu Alaikum",
  "앗살라무 알라이쿰",
];

const ROWS = [
  {
    top: "2dvh",
    size: "clamp(60px, 12dvh, 150px)",
    color: "#6b7280",
    opacity: 0.62,
    duration: 340,
    delay: 0,
    rtl: false,
  },
  {
    top: "14dvh",
    size: "clamp(20px, 2.8dvh, 40px)",
    color: "#1f2937",
    opacity: 0.7,
    duration: 265,
    delay: -25,
    rtl: true,
  },
  {
    top: "24dvh",
    size: "clamp(40px, 8dvh, 100px)",
    color: "#9ca3af",
    opacity: 0.18,
    duration: 320,
    delay: -10,
    rtl: false,
  },
  {
    top: "38dvh",
    size: "clamp(22px, 3.5dvh, 50px)",
    color: "#374151",
    opacity: 0.55,
    duration: 280,
    delay: -35,
    rtl: false,
  },
  {
    top: "50dvh",
    size: "clamp(80px, 18dvh, 200px)",
    color: "#e5e7eb",
    opacity: 0.88,
    duration: 380,
    delay: -50,
    rtl: true,
  },
  {
    top: "62dvh",
    size: "clamp(20px, 2.5dvh, 35px)",
    color: "#111827",
    opacity: 0.75,
    duration: 260,
    delay: -15,
    rtl: false,
  },
  {
    top: "73dvh",
    size: "clamp(35px, 6dvh, 80px)",
    color: "#9ca3af",
    opacity: 0.25,
    duration: 300,
    delay: -40,
    rtl: true,
  },
  {
    top: "84dvh",
    size: "clamp(20px, 4dvh, 55px)",
    color: "#4b5563",
    opacity: 0.45,
    duration: 290,
    delay: -5,
    rtl: false,
  },
];

// 100 entries per half guarantees the track is wider than 100vw at any font size.
const repeated = Array(10).fill(WORDS).flat();
// Duplicate for the seamless loop: animate translateX(0) → translateX(-50%).
const track = [...repeated, ...repeated];

export default function MarqueeBackground() {
  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 0,
        overflow: "hidden",
        pointerEvents: "none",
        userSelect: "none",
        backgroundColor: "#f9fafb",
      }}
      aria-hidden="true"
    >
      {ROWS.map((row, i) => (
        <div
          key={i}
          style={{
            position: "absolute",
            top: row.top,
            left: 0,
            right: 0,
            overflow: "hidden",
            lineHeight: 1.2,
          }}
        >
          <div
            className={`marquee-track${row.rtl ? " marquee-rtl" : ""}`}
            style={{
              display: "flex",
              gap: "3rem",
              width: "max-content",
              fontSize: row.size,
              color: row.color,
              opacity: row.opacity,
              fontWeight: 600,
              animationDuration: `${row.duration}s`,
              animationDelay: `${row.delay}s`,
            }}
          >
            {track.map((word, j) => (
              <span key={j} style={{ whiteSpace: "nowrap" }}>
                {word}
              </span>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
