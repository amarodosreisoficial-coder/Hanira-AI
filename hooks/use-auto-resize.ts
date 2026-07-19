"use client";

import { useCallback, useEffect, useRef } from "react";

export function useAutoResize(maxHeight = 180) {
  const ref = useRef<HTMLTextAreaElement>(null);

  const resize = useCallback(() => {
    const element = ref.current;
    if (!element) return;
    element.style.height = "0px";
    element.style.height = `${Math.min(element.scrollHeight, maxHeight)}px`;
  }, [maxHeight]);

  useEffect(resize, [resize]);

  return { ref, resize };
}
