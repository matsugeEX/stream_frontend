"use client";

import { useEffect, useRef } from "react";

export default function InputControllerPage() {
  const pressedKeysRef = useRef<Set<string>>(new Set());

  const sendInput = async (key: string, action: "down" | "up") => {
    try {
      await fetch("http://localhost:8001/input", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          key,
          action,
        }),
      });
    } catch (error) {
      console.error("input send failed:", error);
    }
  };

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
    console.log("keydown:", event.key);

    const key = event.key;

    if (pressedKeysRef.current.has(key)) {
        return;
    }

    pressedKeysRef.current.add(key);
    sendInput(key, "down");
    };

    const handleKeyUp = (event: KeyboardEvent) => {
    console.log("keyup:", event.key);

    const key = event.key;

    pressedKeysRef.current.delete(key);
    sendInput(key, "up");
    };

    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("keyup", handleKeyUp);

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("keyup", handleKeyUp);

      pressedKeysRef.current.forEach((key) => {
        sendInput(key, "up");
      });

      pressedKeysRef.current.clear();
    };
  }, []);

  return (
    <main className="min-h-screen bg-zinc-950 text-white flex items-center justify-center">
      <div className="text-center space-y-4">
        <h1 className="text-3xl font-bold">Browser Input Controller</h1>

        <p className="text-zinc-300">
          この画面を開いた状態でキーを押すと、FastAPI に入力が送信されます。
        </p>

        <div className="text-zinc-400 text-sm">
          <p>W / A / S / D：移動</p>
          <p>Shift：ダッシュ</p>
          <p>Space：ジャンプ</p>
          <p>矢印キー：方向入力</p>
        </div>
      </div>
    </main>
  );
}