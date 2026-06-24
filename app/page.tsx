"use client";

import { useEffect, useRef, useState } from "react";

type ChatMessage = {
  message: string;
};

export default function Home() {
  const socketRef = useRef<WebSocket | null>(null);
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState<string[]>([]);
  const [isConnected, setIsConnected] = useState(false);

  useEffect(() => {
    const socket = new WebSocket("ws://localhost:8000/ws/chat/");
    socketRef.current = socket;

    socket.onopen = () => {
      console.log("WebSocket connected");
      setIsConnected(true);
    };

    socket.onmessage = (event) => {
      const data: ChatMessage = JSON.parse(event.data);
      setMessages((prev) => [...prev, data.message]);
    };

    socket.onerror = (event) => {
      console.log("WebSocket error", event);
    };

    socket.onclose = () => {
      console.log("WebSocket closed");
      setIsConnected(false);
    };

    return () => {
      socket.close();
    };
  }, []);

  const sendMessage = () => {
    if (!socketRef.current) return;
    if (socketRef.current.readyState !== WebSocket.OPEN) return;
    if (!input.trim()) return;

    socketRef.current.send(
      JSON.stringify({
        message: input,
      })
    );

    setInput("");
  };

  return (
    <main className="min-h-screen bg-zinc-950 text-white p-8">
      <div className="mx-auto max-w-2xl">
        <h1 className="text-3xl font-bold mb-4">
          Realtime Stream Chat
        </h1>

        <p className="mb-4">
          status: {isConnected ? "connected" : "disconnected"}
        </p>

        <div className="flex gap-2 mb-6">
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                sendMessage();
              }
            }}
            className="flex-1 rounded bg-white px-3 py-2 text-black"
            placeholder="コメントを入力"
          />

          <button
            onClick={sendMessage}
            className="rounded bg-blue-500 px-4 py-2 font-bold"
          >
            送信
          </button>
        </div>

        <div className="rounded border border-zinc-700 p-4">
          <h2 className="mb-3 font-bold">Comments</h2>

          <div className="space-y-2">
            {messages.map((message, index) => (
              <div
                key={index}
                className="rounded bg-zinc-800 px-3 py-2"
              >
                {message}
              </div>
            ))}
          </div>
        </div>
      </div>
    </main>
  );
}