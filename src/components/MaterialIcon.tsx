"use client";

import type { CSSProperties } from "react";

type Props = {
  /** Material Symbols name, e.g. "search", "tune", "close" */
  name: string;
  /** px, default 24. Maps to font-size + opsz */
  size?: number;
  /** Fill 0..1 (expressive: active states FILL 1) */
  fill?: boolean | 0 | 1;
  /** wight 100..700 */
  weight?: number;
  /** grade -50..200 */
  grade?: number;
  /** opsz 20..48, defaults to clamped size */
  opsz?: number;
  className?: string;
  style?: CSSProperties;
  /** aria-hidden default true (decorative) */
  decorative?: boolean;
  /** optional aria-label when interactive */
  "aria-label"?: string;
  /** optional title */
  title?: string;
};

export default function MaterialIcon({
  name,
  size = 24,
  fill = false,
  weight = 400,
  grade = 0,
  opsz,
  className = "",
  style,
  decorative = true,
  "aria-label": ariaLabel,
  title,
}: Props) {
  const normalizedOpsz = opsz ?? Math.min(48, Math.max(20, Math.round(size)));
  const fillVal = fill === true ? 1 : fill === false ? 0 : fill;
  const a11yProps = ariaLabel
    ? ({ role: "img" as const, "aria-label": ariaLabel } as const)
    : decorative
      ? ({ "aria-hidden": true } as const)
      : ({} as const);
  return (
    <span
      // material-symbols-rounded class sets font-family to Material Symbols Rounded
      className={`material-symbols-rounded select-none leading-none ${className}`}
      style={{
        fontSize: size,
        fontVariationSettings: `'FILL' ${fillVal}, 'wght' ${weight}, 'GRAD' ${grade}, 'opsz' ${normalizedOpsz}`,
        fontWeight: "normal",
        fontStyle: "normal",
        display: "inline-block",
        lineHeight: 1,
        letterSpacing: "normal",
        textTransform: "none",
        whiteSpace: "nowrap",
        wordWrap: "normal",
        direction: "ltr",
        WebkitFontSmoothing: "antialiased",
        ...style,
      }}
      title={title}
      {...a11yProps}
    >
      {name}
    </span>
  );
}
