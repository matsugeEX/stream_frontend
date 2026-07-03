import { RefObject, useEffect, useRef, useState } from "react";

export function useVisualLatency(
  videoRef: RefObject<HTMLVideoElement | null>
) {
  const measureCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const lastSquareXRef = useRef<number | null>(null);
  const pendingInputTimeRef = useRef<number | null>(null);

  const [latencyMs, setLatencyMs] = useState<number | null>(null);

  const markInputTime = () => {
    pendingInputTimeRef.current = performance.now();
  };

  useEffect(() => {
    let animationId: number;

    const detectSquare = () => {
      const video = videoRef.current;
      const canvas = measureCanvasRef.current;

      if (!video || !canvas || video.readyState < 2) {
        animationId = requestAnimationFrame(detectSquare);
        return;
      }

      const ctx = canvas.getContext("2d");
      if (!ctx) {
        animationId = requestAnimationFrame(detectSquare);
        return;
      }

      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

      const imageData = ctx.getImageData(
        0,
        0,
        canvas.width,
        canvas.height
      );

      const data = imageData.data;

      let minX = Infinity;
      let found = false;

      for (let y = 0; y < canvas.height; y += 4) {
        for (let x = 0; x < canvas.width; x += 4) {
          const index = (y * canvas.width + x) * 4;

          const r = data[index];
          const g = data[index + 1];
          const b = data[index + 2];

          if (r > 150 && g < 80 && b < 80) {
            minX = Math.min(minX, x);
            found = true;
          }
        }
      }

      if (found) {
        const currentX = minX;
        const previousX = lastSquareXRef.current;

        if (
          previousX !== null &&
          currentX !== previousX &&
          pendingInputTimeRef.current !== null
        ) {
          const latency = performance.now() - pendingInputTimeRef.current;
          setLatencyMs(Math.round(latency));
          pendingInputTimeRef.current = null;
        }

        lastSquareXRef.current = currentX;
      }

      animationId = requestAnimationFrame(detectSquare);
    };

    detectSquare();

    return () => {
      cancelAnimationFrame(animationId);
    };
  }, [videoRef]);

  return {
    measureCanvasRef,
    latencyMs,
    markInputTime,
  };
}