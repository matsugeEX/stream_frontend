"use client";

import { useEffect, useState } from "react";

export default function StreamRoomPage() {
  const [viewerCount, setViewerCount] = useState(0);

  useEffect(() => {
    const socket = new WebSocket("ws://localhost:8000/ws/stream/test/");

    socket.onopen = () => {
      socket.send(JSON.stringify({ type: "join_streamer" }));
    };

    socket.onmessage = (event) => {
      const data = JSON.parse(event.data);

      if (data.type === "viewer_count") {
        setViewerCount(data.count);
      }
    };

    return () => {
      socket.close();
    };
  }, []);

  return (
    <main>
      <h1>配信ルーム</h1>
      <p>現在の視聴者数: {viewerCount}</p>
    </main>
  );
}