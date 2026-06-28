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
  const pcRef = useRef<RTCPeerConnection | null>(null);
  const [viewerCount, setViewerCount] = useState(0);

  useEffect(() => {
    const socket = new WebSocket(
      `ws://localhost:8000/ws/chat/${roomName}/`
    );

    socketRef.current = socket;

    const pc = new RTCPeerConnection();
    pcRef.current = pc;

    pc.onconnectionstatechange = () => {
      console.log("connectionState", pc.connectionState);
    };

    pc.oniceconnectionstatechange = () => {
      console.log("iceConnectionState", pc.iceConnectionState);
    };

    pc.ondatachannel = (event) => {
      console.log("datachannel received", event.channel);
    };

    pc.onicecandidate = (event) => {
      if (event.candidate) {
        socketRef.current?.send(
          JSON.stringify({
            type: "webrtc_candidate",
            candidate: event.candidate,
          })
        );

        console.log("candidate sent", event.candidate);
      }
    };

    socket.onmessage = async (event) => {
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

      if (data.type === "webrtc_offer") {
        console.log("offer received", data.sdp);

        await pcRef.current?.setRemoteDescription(
          new RTCSessionDescription(data.sdp)
        );

        const answer = await pcRef.current?.createAnswer();

        await pcRef.current?.setLocalDescription(answer);

        socketRef.current?.send(
          JSON.stringify({
            type: "webrtc_answer",
            sdp: answer,
          })
        );

        console.log("answer sent", answer);
      }

      if (data.type === "webrtc_answer") {
        console.log("answer received", data.sdp);

        await pcRef.current?.setRemoteDescription(
          new RTCSessionDescription(data.sdp)
        );
      }

      if (data.type === "webrtc_candidate") {
        console.log("candidate received", data.candidate);

        await pcRef.current?.addIceCandidate(
          new RTCIceCandidate(data.candidate)
        );
      }
    };

    return () => {
      socket.close();
      pc.close();
    };
  }, [roomName]);

  const sendMessage = () => {
    if (!message.trim()) return;
    if (!socketRef.current) return;

    socketRef.current.send(
      JSON.stringify({
        type: "chat",
        message,
      })
    );

    setMessage("");
  };

  const createOffer = async () => {
    if (!pcRef.current) return;
    if (!socketRef.current) return;

    pcRef.current.createDataChannel("test");

    const offer = await pcRef.current.createOffer();
    await pcRef.current.setLocalDescription(offer);

    socketRef.current.send(
      JSON.stringify({
        type: "webrtc_offer",
        sdp: offer,
      })
    );

    console.log("offer sent", offer);
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
        <button
          onClick={createOffer}
          className="rounded bg-green-600 px-4 py-2"
        >
          Offer作成
        </button>
      </div>
    </main>
  );
}