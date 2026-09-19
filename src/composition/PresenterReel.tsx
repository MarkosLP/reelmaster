import {
  AbsoluteFill,
  OffthreadVideo,
  useCurrentFrame,
  interpolate,
} from "remotion";
import type { PresenterEditPlan } from "../snapshot/presenter";
import "./fonts";

function Support({
  kind,
  progress,
}: {
  kind: PresenterEditPlan["overlays"][number]["kind"];
  progress: number;
}) {
  const accent = "#a5ff65";
  const stroke = {
    fill: "none",
    stroke: accent,
    strokeWidth: 7,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
  };
  return (
    <div
      style={{
        position: "absolute",
        left: 110,
        right: 150,
        top: 205,
        height: 150,
        opacity: progress,
        transform: `translateY(${(1 - progress) * 15}px)`,
      }}
    >
      <svg
        viewBox="0 0 820 250"
        width="100%"
        height="100%"
        style={{ filter: "drop-shadow(0 3px 10px #000)" }}
      >
        {kind === "weather-recipe" && (
          <g {...stroke}>
            <circle cx="130" cy="90" r="36" />
            <path d="M130 25v-18 M65 90H45 M195 90h20 M85 45l-14-14 M175 45l14-14" />
            <path d="M75 143h116q35 0 35-28q0-25-30-25M380 150h140l-12-66H392z M404 65q-12-16 0-32 M447 65q-12-16 0-32 M490 65q-12-16 0-32" />
          </g>
        )}
        {kind === "checklist" &&
          [0, 1, 2].map((n) => (
            <g key={n} transform={`translate(${n * 255},25)`} {...stroke}>
              <path
                d="M20 65l24 24 46-50"
                strokeDasharray="100"
                strokeDashoffset={100 * (1 - progress)}
              />
              <path
                d="M15 123h170 M15 155h115"
                stroke="#fff"
                strokeOpacity=".9"
              />
            </g>
          ))}
        {kind === "data-report" && (
          <g {...stroke}>
            {[65, 100, 145, 195].map((h, n) => (
              <rect
                key={n}
                x={30 + n * 60}
                y={220 - h * progress}
                width="34"
                height={h * progress}
                rx="5"
                fill={accent}
                stroke="none"
              />
            ))}
            <path d="M340 125h85m-25-25 25 25-25 25 M510 20h140l45 45v155H510z M650 20v45h45 M540 112h115 M540 150h90 M540 185h100" />
          </g>
        )}
      </svg>
    </div>
  );
}

export function PresenterReel({
  plan,
  videoUrl,
}: {
  plan: PresenterEditPlan;
  videoUrl: string;
}) {
  const f = useCurrentFrame();
  const segment = [...plan.segments]
    .reverse()
    .find((s) => s.outputStartFrame <= f);
  const caption = plan.captions.find(
    (c) => f >= c.startFrame && f < c.endFrame,
  );
  const overlay = plan.overlays.find(
    (o) => f >= o.startFrame && f < o.endFrame,
  );
  return (
    <AbsoluteFill
      style={{
        backgroundColor: "#0a1011",
        fontFamily: "ReelSans",
        color: "white",
        overflow: "hidden",
      }}
    >
      <OffthreadVideo
        muted
        src={videoUrl}
        style={{
          width: "100%",
          height: "100%",
          objectFit: "cover",
          transform: `scale(${segment?.scale ?? 1})`,
          transformOrigin: "50% 46%",
        }}
      />
      <AbsoluteFill
        style={{
          background:
            "linear-gradient(180deg,rgba(0,0,0,.34) 0%,transparent 22%,transparent 56%,rgba(3,9,10,.65) 78%,rgba(3,9,10,.85) 100%)",
        }}
      />
      <div
        style={{
          position: "absolute",
          left: 80,
          top: 145,
          display: "flex",
          alignItems: "center",
          gap: 16,
          fontSize: 27,
          fontWeight: 700,
          letterSpacing: 3,
        }}
      >
        <span
          style={{
            width: 9,
            height: 9,
            borderRadius: 9,
            background: "#a5ff65",
          }}
        />{" "}
        IA EN TU DÍA
      </div>
      {overlay && (
        <Support
          kind={overlay.kind}
          progress={interpolate(
            f - overlay.startFrame,
            [
              0,
              9,
              overlay.endFrame - overlay.startFrame - 6,
              overlay.endFrame - overlay.startFrame,
            ],
            [0, 1, 1, 0],
            { extrapolateLeft: "clamp", extrapolateRight: "clamp" },
          )}
        />
      )}
      {caption && (
        <div
          style={{
            position: "absolute",
            top: 1480,
            left: 90,
            width: 820,
            minHeight: 150,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            textAlign: "center",
          }}
        >
          <div
            style={{
              fontSize: 66,
              lineHeight: 1.12,
              fontWeight: 800,
              letterSpacing: -1.5,
              textShadow: "0 3px 8px #000",
              backgroundColor: "rgba(6,13,15,.88)",
              borderRadius: 18,
              padding: "18px 25px",
              borderBottom: "4px solid #a5ff65",
              boxSizing: "border-box",
            }}
          >
            {caption.text}
          </div>
        </div>
      )}
    </AbsoluteFill>
  );
}
