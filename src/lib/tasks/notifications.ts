"use client";

import { toast } from "sonner";

export async function requestNotificationPermission(): Promise<NotificationPermission> {
  if (typeof window === "undefined" || !("Notification" in window)) return "denied";
  if (Notification.permission !== "default") return Notification.permission;
  try {
    return await Notification.requestPermission();
  } catch {
    return "denied";
  }
}

export function canUseNotification(): boolean {
  if (typeof window === "undefined" || !("Notification" in window)) return false;
  return Notification.permission === "granted";
}

/** 브라우저 기본 알림음(Web Audio beep). 자산 파일 없이 즉시 재생. */
function playBeep() {
  try {
    const AudioCtx = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioCtx) return;
    const ctx = new AudioCtx();
    const now = ctx.currentTime;
    const playTone = (freq: number, startOffset: number, duration: number) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0.0001, now + startOffset);
      gain.gain.exponentialRampToValueAtTime(0.25, now + startOffset + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + startOffset + duration);
      osc.connect(gain).connect(ctx.destination);
      osc.start(now + startOffset);
      osc.stop(now + startOffset + duration + 0.05);
    };
    playTone(880, 0, 0.2);
    playTone(660, 0.25, 0.3);
    setTimeout(() => ctx.close(), 800);
  } catch {
    // ignore audio errors
  }
}

export function notifyFocusComplete(title: string) {
  if (canUseNotification()) {
    try {
      new Notification("집중 시간 종료", {
        body: title,
        tag: "focus-complete",
      });
    } catch {
      // ignore
    }
  }
  playBeep();
  toast("⏰ 집중 시간이 끝났습니다.", {
    description: title,
    duration: 8000,
  });
}
