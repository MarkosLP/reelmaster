import { AbsoluteFill, useCurrentFrame } from "remotion";
import type { CompositionSnapshot, SnapshotScene } from "../snapshot/types";
import { motionProgress, type MotionGraphic } from "../snapshot/motion";
import { lineAt } from "./timing";

const lime = "#C6FF6B",
  ice = "#85DCEB",
  white = "#F4F4F0",
  muted = "#657080";
function Check({
  x,
  y,
  progress = 1,
  size = 65,
}: {
  x: number;
  y: number;
  progress?: number;
  size?: number;
}) {
  return (
    <path
      d={`M ${x - size * 0.45} ${y} l ${size * 0.3} ${size * 0.3} l ${size * 0.65} ${-size * 0.7}`}
      fill="none"
      stroke={lime}
      strokeWidth={10}
      strokeLinecap="round"
      strokeLinejoin="round"
      pathLength={1}
      strokeDasharray={1}
      strokeDashoffset={1 - progress}
    />
  );
}
function Symbol({ kind, x, y }: { kind: number; x: number; y: number }) {
  if (kind % 3 === 0)
    return (
      <g>
        <path
          d={`M ${x - 50} ${y - 40} h 100 v 70 h -60 l -28 24 v -24 h -12 z`}
          fill="none"
          stroke={ice}
          strokeWidth={6}
        />
        <text x={x} y={y + 13} textAnchor="middle" fontSize={56} fill={white}>
          ?
        </text>
      </g>
    );
  if (kind % 3 === 1)
    return (
      <g>
        {[0, 1, 2].map((i) => (
          <g key={i}>
            <path
              d={`M ${x - 52} ${y - 30 + i * 30} l 8 8 l 12 -17`}
              fill="none"
              stroke={lime}
              strokeWidth={5}
            />
            <path
              d={`M ${x - 15} ${y - 30 + i * 30} h 66`}
              stroke={white}
              strokeWidth={6}
            />
          </g>
        ))}
      </g>
    );
  return (
    <g>
      {[50, 85, 68].map((h, i) => (
        <rect
          key={i}
          x={x - 48 + i * 36}
          y={y + 45 - h}
          width={22}
          height={h}
          rx={5}
          fill={i === 1 ? lime : ice}
        />
      ))}
    </g>
  );
}

export function MotionSceneView({
  scene,
  graphic,
  theme,
}: {
  scene: SnapshotScene;
  graphic: MotionGraphic;
  theme: CompositionSnapshot["theme"];
}) {
  const frame = useCurrentFrame();
  const p = (a: number, b: number) =>
    motionProgress(frame, scene.durationFrames, a, b);
  const t = frame / Math.max(1, scene.durationFrames - 1);
  const titleExit = p(0.18, 0.3);
  const line = lineAt(scene.lines, frame);
  const intro = graphic.layout === "time-hook",
    recap = graphic.layout === "recap";
  return (
    <AbsoluteFill
      style={{
        background: "#0D1015",
        color: white,
        fontFamily: "ReelSans, Arial, sans-serif",
        overflow: "hidden",
      }}
    >
      <AbsoluteFill
        style={{
          background: `radial-gradient(ellipse at ${35 + t * 20}% 48%, #1c2b32 0%, #111820 37%, #0D1015 74%)`,
        }}
      />
      <div
        style={{
          position: "absolute",
          left: 90,
          top: 140,
          fontSize: 23,
          letterSpacing: 6,
          color: "#B6C0CC",
        }}
      >
        REELMASTER
      </div>
      {graphic.ordinal && (
        <div
          style={{
            position: "absolute",
            right: 130,
            top: 128,
            fontSize: 38,
            fontWeight: 700,
            color: lime,
          }}
        >
          {String(graphic.ordinal).padStart(2, "0")}
          <span style={{ color: muted, fontSize: 23 }}>
            {" "}
            / {String(graphic.count).padStart(2, "0")}
          </span>
        </div>
      )}
      {!intro && !recap && (
        <div
          style={{
            position: "absolute",
            left: 90,
            top: 260 - 40 * titleExit,
            right: 140,
            fontSize: 65 - 28 * titleExit,
            fontWeight: 750,
            lineHeight: 1.12,
            letterSpacing: -1.8,
            opacity: 1 - 0.35 * titleExit,
            transform: `translateY(${25 * (1 - p(0, 0.1))}px)`,
          }}
        >
          {graphic.title}
        </div>
      )}

      <svg
        viewBox="0 0 1080 1920"
        style={{
          position: "absolute",
          inset: 0,
          width: "100%",
          height: "100%",
        }}
      >
        {intro && (
          <g>
            <g
              transform={`translate(515 880) scale(${0.88 + 0.12 * p(0, 0.18)})`}
            >
              <circle r={305} fill="#121C24" stroke="#2D4148" strokeWidth={3} />
              <circle
                r={305}
                fill="none"
                stroke={lime}
                strokeWidth={9}
                pathLength={1}
                strokeDasharray={1}
                strokeDashoffset={1 - p(0.06, 0.94)}
                transform="rotate(-90)"
                strokeLinecap="round"
              />
              {Array.from({ length: 12 }, (_, i) => (
                <path
                  key={i}
                  d="M 0 -263 v 16"
                  stroke={i % 3 === 0 ? white : muted}
                  strokeWidth={i % 3 === 0 ? 6 : 3}
                  transform={`rotate(${i * 30})`}
                />
              ))}
              <path
                d="M 0 0 V -195"
                stroke={ice}
                strokeWidth={10}
                strokeLinecap="round"
                transform={`rotate(${-65 + 135 * p(0.12, 0.94)})`}
              />
              <path
                d="M 0 0 L 120 63"
                stroke={white}
                strokeWidth={14}
                strokeLinecap="round"
              />
              <circle r={17} fill={lime} />
            </g>
            <text
              x={94}
              y={445}
              fontSize={150}
              letterSpacing={-7}
              fontWeight={800}
              fill={white}
              opacity={p(0, 0.09)}
            >
              {graphic.title.split("\n")[0]}
            </text>
            <text
              x={96}
              y={535}
              fontSize={61}
              letterSpacing={-2}
              fill={lime}
              opacity={p(0.08, 0.2)}
            >
              {graphic.title.split("\n")[1]}
            </text>
            <text
              x={515}
              y={1290}
              textAnchor="middle"
              fontSize={37}
              letterSpacing={10}
              fill={ice}
              opacity={p(0.28, 0.45)}
            >
              IA
            </text>
          </g>
        )}

        {graphic.layout === "question-answer" && (
          <g>
            <g
              opacity={1 - 0.6 * p(0.35, 0.55)}
              transform={`translate(${120 * p(0.2, 0.4)} ${95 * p(0.2, 0.4)}) scale(${1 - 0.18 * p(0.2, 0.4)})`}
            >
              <path
                d="M 140 460 H 480 Q 505 460 505 485 V 645 Q 505 670 480 670 H 255 L 195 730 V 670 H 140 Q 115 670 115 645 V 485 Q 115 460 140 460"
                fill="#1B2933"
                stroke={ice}
                strokeWidth={4}
              />
              <text
                x={310}
                y={622}
                textAnchor="middle"
                fontSize={141}
                fontWeight={700}
                fill={white}
              >
                ?
              </text>
            </g>
            <path
              d="M 340 700 C 340 790 520 700 520 790"
              fill="none"
              stroke={ice}
              strokeWidth={5}
              pathLength={1}
              strokeDasharray={1}
              strokeDashoffset={1 - p(0.13, 0.38)}
            />
            <circle
              cx={520}
              cy={885}
              r={111 + 8 * Math.sin(t * Math.PI)}
              fill="#172823"
              stroke={lime}
              strokeWidth={4}
            />
            <circle
              cx={520}
              cy={885}
              r={133}
              fill="none"
              stroke="#3C5840"
              strokeWidth={2}
              strokeDasharray="8 15"
              transform={`rotate(${60 * p(0.1, 0.85)} 520 885)`}
            />
            <text
              x={520}
              y={912}
              textAnchor="middle"
              fontSize={78}
              fontWeight={750}
              fill={lime}
            >
              IA
            </text>
            <path
              d="M 520 1010 C 520 1120 710 1010 710 1120"
              fill="none"
              stroke={lime}
              strokeWidth={5}
              pathLength={1}
              strokeDasharray={1}
              strokeDashoffset={1 - p(0.43, 0.67)}
            />
            <g
              opacity={p(0.53, 0.68)}
              transform={`translate(0 ${25 * (1 - p(0.53, 0.72))})`}
            >
              <path
                d="M 420 1100 H 845 Q 875 1100 875 1130 V 1280 Q 875 1310 845 1310 H 465 L 415 1350 V 1310 Q 390 1310 390 1280 V 1130 Q 390 1100 420 1100"
                fill="#23362B"
                stroke="#6A9854"
                strokeWidth={3}
              />
              <Check x={468} y={1185} progress={p(0.65, 0.83)} size={65} />
              {[170, 230, 140].map((w, i) => (
                <path
                  key={i}
                  d={`M 560 ${1158 + i * 43} h ${w * p(0.66 + i * 0.045, 0.81 + i * 0.045)}`}
                  stroke={i === 0 ? white : ice}
                  strokeWidth={10}
                  strokeLinecap="round"
                />
              ))}
            </g>
          </g>
        )}

        {graphic.layout === "organize" && (
          <g>
            <path
              d="M 190 490 V 1240 Q 190 1280 230 1280 H 860"
              stroke="#3A4A56"
              strokeWidth={3}
              fill="none"
              pathLength={1}
              strokeDasharray={1}
              strokeDashoffset={1 - p(0.2, 0.88)}
            />
            {Array.from({ length: graphic.count }, (_, i) => {
              const settle = p(0.14 + i * 0.12, 0.48 + i * 0.12),
                x = 120 + (i % 2) * 140,
                y = 525 + i * 230;
              return (
                <g
                  key={i}
                  transform={`translate(${x + (260 - x) * settle} ${y + (535 + i * 220 - y) * settle}) rotate(${(i % 2 === 0 ? -12 : 11) * (1 - settle)} 270 75)`}
                >
                  <rect
                    width={580}
                    height={165}
                    rx={22}
                    fill="#1D2933"
                    stroke={settle > 0.98 ? "#516D58" : "#52606E"}
                    strokeWidth={3}
                  />
                  <rect
                    x={35}
                    y={48}
                    width={66}
                    height={66}
                    rx={14}
                    fill="#0F181C"
                    stroke="#617666"
                    strokeWidth={3}
                  />
                  <Check
                    x={67}
                    y={80}
                    size={48}
                    progress={p(0.52 + i * 0.12, 0.65 + i * 0.12)}
                  />
                  <path
                    d={`M 140 65 h ${275 - i * 35} M 140 104 h ${195 + i * 20}`}
                    stroke={i === 1 ? ice : white}
                    strokeOpacity={0.85}
                    strokeWidth={11}
                    strokeLinecap="round"
                  />
                </g>
              );
            })}
            <g opacity={p(0.82, 0.96)}>
              <circle cx={795} cy={1260} r={57} fill="#23362B" />
              <Check x={795} y={1260} size={64} progress={p(0.84, 0.98)} />
            </g>
          </g>
        )}

        {graphic.layout === "data-report" && (
          <g>
            {Array.from({ length: 18 }, (_, i) => {
              const merge = p(0.12, 0.52),
                sx = 150 + (i % 6) * 128,
                sy = 490 + Math.floor(i / 6) * 114;
              const ex = 295 + (i % 3) * 175,
                ey = 970 - Math.floor(i / 3) * 39;
              return (
                <rect
                  key={i}
                  x={sx + (ex - sx) * merge}
                  y={sy + (ey - sy) * merge}
                  width={24 + 38 * merge}
                  height={24}
                  rx={5}
                  fill={i % 3 === 1 ? lime : ice}
                  opacity={1 - p(0.52, 0.65)}
                />
              );
            })}
            <g
              opacity={p(0.42, 0.57)}
              transform={`translate(${70 * p(0.6, 0.83)} ${-20 * p(0.6, 0.83)}) scale(${1 - 0.2 * p(0.6, 0.83)})`}
            >
              <path
                d="M 220 680 V 1040 H 830"
                fill="none"
                stroke="#56697A"
                strokeWidth={4}
              />
              {[180, 300, 240].map((h, i) => (
                <rect
                  key={i}
                  x={290 + i * 175}
                  y={1020 - h * p(0.4 + i * 0.04, 0.64 + i * 0.04)}
                  width={95}
                  height={h * p(0.4 + i * 0.04, 0.64 + i * 0.04)}
                  rx={10}
                  fill={i === 1 ? lime : ice}
                />
              ))}
            </g>
            <g opacity={p(0.62, 0.78)}>
              <path
                d="M 250 510 H 700 L 820 630 V 1220 Q 820 1250 790 1250 H 250 Q 220 1250 220 1220 V 540 Q 220 510 250 510 Z"
                fill="none"
                stroke={white}
                strokeWidth={5}
                pathLength={1}
                strokeDasharray={1}
                strokeDashoffset={1 - p(0.59, 0.88)}
              />
              <path
                d="M 700 510 V 630 H 820"
                fill="none"
                stroke={white}
                strokeWidth={5}
              />
              {[350, 430, 260].map((w, i) => (
                <path
                  key={i}
                  d={`M 290 ${1050 + i * 51} h ${w * p(0.74 + i * 0.035, 0.87 + i * 0.035)}`}
                  stroke={i === 0 ? ice : muted}
                  strokeWidth={9}
                  strokeLinecap="round"
                />
              ))}
            </g>
            <g opacity={p(0.85, 0.96)}>
              <circle cx={812} cy={1230} r={58} fill="#23362B" />
              <Check x={812} y={1230} progress={p(0.86, 0.98)} size={68} />
            </g>
          </g>
        )}

        {recap && (
          <g>
            {Array.from({ length: graphic.count }, (_, i) => {
              const appear = p(i * 0.08, 0.16 + i * 0.08);
              return (
                <g
                  key={i}
                  opacity={appear}
                  transform={`translate(0 ${35 * (1 - appear)})`}
                >
                  <circle
                    cx={240 + i * 270}
                    cy={560}
                    r={100}
                    fill="#1C2A31"
                    stroke={i === 1 ? lime : ice}
                    strokeWidth={3}
                  />
                  <Symbol kind={i} x={240 + i * 270} y={560} />
                </g>
              );
            })}
            <path
              d="M 240 700 Q 240 780 510 780 Q 780 780 780 700 M 510 780 V 850"
              fill="none"
              stroke="#567062"
              strokeWidth={4}
              pathLength={1}
              strokeDasharray={1}
              strokeDashoffset={1 - p(0.26, 0.59)}
            />
            <text
              x={510}
              y={1015}
              textAnchor="middle"
              fontSize={126}
              fontWeight={800}
              letterSpacing={-5}
              fill={white}
              opacity={p(0.3, 0.49)}
            >
              {graphic.title.split("\n")[0]}
            </text>
            <text
              x={510}
              y={1155}
              textAnchor="middle"
              fontSize={126}
              fontWeight={800}
              letterSpacing={-5}
              fill={lime}
              opacity={p(0.43, 0.62)}
            >
              {graphic.title.split("\n")[1]}
            </text>
            <path
              d="M 300 1225 H 720"
              stroke={lime}
              strokeWidth={7}
              strokeLinecap="round"
              pathLength={1}
              strokeDasharray={1}
              strokeDashoffset={1 - p(0.62, 0.95)}
            />
          </g>
        )}
      </svg>
      {line && (
        <div
          style={{
            position: "absolute",
            left: 90,
            right: 140,
            top: 1455,
            minHeight: 155,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            textAlign: "center",
            fontSize: theme.captionStyle.fontSize,
            fontWeight: 750,
            lineHeight: 1.35,
            color: theme.captionStyle.textColor,
            textShadow: "0 3px 18px #000",
            background: "#0D1015",
            borderRadius: 20,
            padding: "12px 20px",
            boxSizing: "border-box",
          }}
        >
          {line.tokens.map((token) => token.text).join(" ")}
        </div>
      )}
      <div
        style={{
          position: "absolute",
          left: 90,
          right: 140,
          bottom: 220,
          height: 3,
          background: "#2B3540",
        }}
      >
        <div style={{ width: `${t * 100}%`, height: 3, background: lime }} />
      </div>
    </AbsoluteFill>
  );
}
