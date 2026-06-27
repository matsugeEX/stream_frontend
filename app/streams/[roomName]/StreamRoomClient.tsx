"use client";

import { useEffect, useRef, useState } from "react";

type Props = {
  roomName: string;
};

type ChatMessage = {
  message: string;
};

export default function StreamRoomClient({ roomName }: Props) {
  const [message, setMessage] = useState("");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const socketRef = useRef<WebSocket | null>(null);
  const [viewerCount, setViewerCount] = useState(0);

  useEffect(() => {
    const socket = new WebSocket(
      `ws://localhost:8000/ws/chat/${roomName}/`
    );

    socketRef.current = socket;

    socket.onmessage = (event) => {
    const data = JSON.parse(event.data);

    if (data.type === "chat") {
    setMessages((prev) => [
        ...prev,
        {
        message: data.message,
        },
    ]);
    }

    if (data.type === "viewer_count") {
    setViewerCount(data.count);
    }
    };

    return () => {
      socket.close();
    };
  }, [roomName]);

  const sendMessage = () => {
    if (!message.trim()) return;
    if (!socketRef.current) return;

    socketRef.current.send(
      JSON.stringify({
        message,
      })
    );

    setMessage("");
  };

  return (
    <main className="min-h-screen bg-zinc-950 text-white p-8">
      <h1 className="text-3xl font-bold mb-6">
        Room: {roomName}
      </h1>
      <p className="text-zinc-400">
        視聴者数: {viewerCount}
      </p>

      <div className="mb-4 space-y-2">
        {messages.map((item, index) => (
          <div
            key={index}
            className="rounded bg-zinc-800 p-3"
          >
            {item.message}
          </div>
        ))}
      </div>

      <div className="flex gap-2">
        <input
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          className="flex-1 rounded bg-white px-3 py-2 text-black"
          placeholder="メッセージを入力"
        />

        <button
          onClick={sendMessage}
          className="rounded bg-blue-600 px-4 py-2"
        >
          送信
        </button>
      </div>
    </main>
  );
}