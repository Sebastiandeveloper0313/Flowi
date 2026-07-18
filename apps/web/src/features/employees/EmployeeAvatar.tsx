import { useState } from "react";

import type { EmployeeMeta } from "./roles";

/**
 * An employee's face, everywhere one appears: the character portrait when the
 * image exists, the old tinted emoji tile as a fallback so a missing file never
 * leaves a broken-image icon. Size and rounding come from the caller so the
 * same component fits the roster card, the page pill, and the chat hero.
 */
export function EmployeeAvatar({
  meta,
  className = "size-11 rounded-xl text-xl",
}: {
  meta: EmployeeMeta;
  className?: string;
}) {
  const [broken, setBroken] = useState(false);

  if (meta.avatar && !broken) {
    return (
      <span className={`block shrink-0 overflow-hidden bg-white ${className}`}>
        {/* A whisper of zoom trims the portraits' white margins; any more and
            the characters loom. */}
        <img
          src={meta.avatar}
          alt={meta.name}
          draggable={false}
          onError={() => setBroken(true)}
          className="size-full scale-[1.08] object-cover object-[50%_45%]"
        />
      </span>
    );
  }
  return (
    <span className={`grid shrink-0 place-items-center ${meta.tint} ${className}`}>
      {meta.emoji}
    </span>
  );
}
