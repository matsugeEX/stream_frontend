"use client";

import { useState } from "react";

export default function MobileControllerPage() {
  const [log, setLog] = useState("ready");

  const sendKey = (key: string, action: "down" | "up") => {
    const apiBase = `http://${window.location.hostname}:8001`;

    const url = `${apiBase}/input-get?key=${encodeURIComponent(
      key
    )}&action=${action}`;

    setLog(`${key} ${action}`);

    const img = new Image();
    img.src = url;
  };

  const Button = ({ label, keyName }: { label: string; keyName: string }) => {
    return (
      <button
        className="h-20 w-20 select-none rounded-2xl bg-zinc-800 text-2xl text-white active:bg-zinc-600"
        onPointerDown={(e) => {
          e.preventDefault();
          sendKey(keyName, "down");
        }}
        onPointerUp={(e) => {
          e.preventDefault();
          sendKey(keyName, "up");
        }}
        onPointerCancel={(e) => {
          e.preventDefault();
          sendKey(keyName, "up");
        }}
        onPointerLeave={(e) => {
          e.preventDefault();
          sendKey(keyName, "up");
        }}
      >
        {label}
      </button>
    );
  };

  return (
    <main className="flex h-screen w-screen flex-col items-center justify-center gap-8 bg-zinc-950 text-white">
      <h1 className="text-2xl font-bold">Mobile Controller</h1>

      <div className="grid grid-cols-3 gap-3">
        <div />
        <Button label="W" keyName="w" />
        <div />

        <Button label="A" keyName="a" />
        <Button label="S" keyName="s" />
        <Button label="D" keyName="d" />
      </div>

      <div className="flex gap-4">
        <button
          className="h-20 w-28 select-none rounded-2xl bg-zinc-800 text-white active:bg-zinc-600"
          onPointerDown={(e) => {
            e.preventDefault();
            sendKey(" ", "down");
          }}
          onPointerUp={(e) => {
            e.preventDefault();
            sendKey(" ", "up");
          }}
          onPointerCancel={(e) => {
            e.preventDefault();
            sendKey(" ", "up");
          }}
        >
          Jump
        </button>

        <button
          className="h-20 w-28 select-none rounded-2xl bg-zinc-800 text-white active:bg-zinc-600"
          onPointerDown={(e) => {
            e.preventDefault();
            sendKey("Shift", "down");
          }}
          onPointerUp={(e) => {
            e.preventDefault();
            sendKey("Shift", "up");
          }}
          onPointerCancel={(e) => {
            e.preventDefault();
            sendKey("Shift", "up");
          }}
        >
          Shift
        </button>
      </div>

      <p className="text-sm text-zinc-400">{log}</p>
    </main>
  );
}