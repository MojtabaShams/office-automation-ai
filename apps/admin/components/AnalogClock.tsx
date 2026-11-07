"use client";

import React, { useEffect, useState } from "react";
import { useTheme } from "../theme-context";

export default function AnalogClock() {
  const { isDarkMode } = useTheme();
  const [now, setNow] = useState<Date | null>(null);

  useEffect(() => {
    setNow(new Date());
    const timer = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  if (!now) {
    // اسکلتون ساده برای جلوگیری از hydration error
    return (
      <div className="flex flex-col items-center gap-3">
        <div className={`h-36 w-36 rounded-full border-2 ${isDarkMode ? "border-white/15 bg-[#0f2a26]" : "border-[#d5dad4] bg-[#f8f6f0]"}`} />
        <div className="h-5 w-24 rounded bg-current opacity-10" />
      </div>
    );
  }

  const seconds = now.getSeconds();
  const minutes = now.getMinutes();
  const hours = now.getHours() % 12;

  const secondDeg = seconds * 6;
  const minuteDeg = minutes * 6 + seconds * 0.1;
  const hourDeg = hours * 30 + minutes * 0.5;

  const digital = new Intl.DateTimeFormat("en-US", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: true,
  }).format(now);

  const face = isDarkMode
    ? "bg-[#0f2a26] border-white/15"
    : "bg-[#f8f6f0] border-[#d5dad4]";

  const hand = isDarkMode ? "bg-white/90" : "bg-[#28443d]";
  const secondHand = "bg-[#c45c4a]";
  const center = isDarkMode ? "bg-[#4ade80]" : "bg-[#15554f]";
  const numberColor = isDarkMode ? "text-white/70" : "text-[#28443d]/70";

  return (
    <div className="flex flex-col items-center gap-3">
      <div className={`relative h-36 w-36 rounded-full border-2 shadow-inner ${face}`}>
        {[12, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11].map((num, i) => {
          const angle = (i * 30 - 90) * (Math.PI / 180);
          const x = 50 + 37 * Math.cos(angle);
          const y = 50 + 37 * Math.sin(angle);
          return (
            <span
              key={num}
              className={`absolute text-[0.65rem] font-medium ${numberColor}`}
              style={{
                left: `${x}%`,
                top: `${y}%`,
                transform: "translate(-50%, -50%)",
              }}
            >
              {num}
            </span>
          );
        })}

        <div
          className={`absolute left-1/2 top-1/2 h-[30px] w-1.5 -translate-x-1/2 -translate-y-full rounded-full origin-bottom ${hand}`}
          style={{ transform: `translateX(-50%) rotate(${hourDeg}deg)` }}
        />
        <div
          className={`absolute left-1/2 top-1/2 h-[42px] w-1 -translate-x-1/2 -translate-y-full rounded-full origin-bottom ${hand}`}
          style={{ transform: `translateX(-50%) rotate(${minuteDeg}deg)` }}
        />
        <div
          className={`absolute left-1/2 top-1/2 h-[48px] w-0.5 -translate-x-1/2 -translate-y-full rounded-full origin-bottom ${secondHand}`}
          style={{ transform: `translateX(-50%) rotate(${secondDeg}deg)` }}
        />
        <div className={`absolute left-1/2 top-1/2 h-2.5 w-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full ${center}`} />
      </div>

      <div className={`text-base font-bold tracking-wider ${isDarkMode ? "text-[#7dd3c0]" : "text-[#15554f]"}`}>
        {digital}
      </div>
    </div>
  );
}