"use client";

import { useRef, useState } from "react";

export default function ControllerPage() {
  const API_BASE = "http://192.168.1.5:8001";;

  const areaRef = useRef<HTMLElement | null>(null);
  const mouseDeltaRef = useRef({ dx: 0, dy: 0 });
  const animationFrameRef = useRef<number | null>(null);

  const [isPointerLocked, setIsPointerLocked] = useState(false);

  const focusGame = async () => {
    try {
      await fetch(`${API_BASE}/focus`, {
        method: "POST",
      });
    } catch (error) {
      console.error("focus failed:", error);
    }
  };

  const sendKey = async (key: string, action: "down" | "up") => {
    try {
      await fetch(`${API_BASE}/input`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ key, action }),
      });
    } catch (error) {
      console.error("key input failed:", error);
    }
  };

  const sendMouseMove = async (dx: number, dy: number) => {
    if (dx === 0 && dy === 0) return;

    try {
      await fetch(`${API_BASE}/mouse-move`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ dx, dy }),
      });
    } catch (error) {
      console.error("mouse move failed:", error);
    }
  };

  const sendMouseClick = async (
    button: "left" | "right" | "middle",
    action: "down" | "up"
  ) => {
    try {
      await fetch(`${API_BASE}/mouse-click`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ button, action }),
      });
    } catch (error) {
      console.error("mouse click failed:", error);
    }
  };

  const startMouseLoop = () => {
    if (animationFrameRef.current !== null) return;

    const loop = async () => {
      const { dx, dy } = mouseDeltaRef.current;

      mouseDeltaRef.current = { dx: 0, dy: 0 };

      if (dx !== 0 || dy !== 0) {
        await sendMouseMove(dx, dy);
      }

      animationFrameRef.current = requestAnimationFrame(loop);
    };

    animationFrameRef.current = requestAnimationFrame(loop);
  };

  const handleStart = async () => {
    await focusGame();

    areaRef.current?.focus();
    await areaRef.current?.requestPointerLock();

    setIsPointerLocked(true);
    startMouseLoop();
  };

  return (
    <main
      ref={areaRef}
      tabIndex={0}
      onClick={handleStart}
      onKeyDown={(event) => {
        event.preventDefault();
        sendKey(event.key, "down");
      }}
      onKeyUp={(event) => {
        event.preventDefault();
        sendKey(event.key, "up");
      }}
      onMouseMove={(event) => {
        mouseDeltaRef.current.dx += event.movementX;
        mouseDeltaRef.current.dy += event.movementY;
      }}
      onMouseDown={(event) => {
        event.preventDefault();

        if (event.button === 0) sendMouseClick("left", "down");
        if (event.button === 1) sendMouseClick("middle", "down");
        if (event.button === 2) sendMouseClick("right", "down");
      }}
      onMouseUp={(event) => {
        event.preventDefault();

        if (event.button === 0) sendMouseClick("left", "up");
        if (event.button === 1) sendMouseClick("middle", "up");
        if (event.button === 2) sendMouseClick("right", "up");
      }}
      onContextMenu={(event) => {
        event.preventDefault();
      }}
      className="min-h-screen bg-zinc-950 text-white flex items-center justify-center outline-none"
    >
      <div className="text-center">
        <h1 className="text-3xl font-bold mb-4">Controller</h1>

        <p>クリックするとUE5側にフォーカスし、マウス操作を開始します</p>

        <p className="mt-2 text-zinc-400">
          WASD / Shift / Space / Mouse
        </p>

        <p className="mt-4 text-sm text-zinc-500">
          Pointer Lock: {isPointerLocked ? "ON" : "OFF"}
        </p>

        <p className="mt-2 text-sm text-zinc-500">
          解除するには Esc を押してください
        </p>
      </div>
    </main>
  );
}