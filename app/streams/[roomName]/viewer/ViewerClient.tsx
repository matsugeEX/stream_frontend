"use client";

import { useEffect, useRef, useState } from "react";

type Props = {
  roomName: string;
};

export default function ViewerClient({ roomName }: Props) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const socketRef = useRef<WebSocket | null>(null);
  const peerConnectionRef = useRef<RTCPeerConnection | null>(null);
  const viewerIdRef = useRef<string>("");

  const [viewerId, setViewerId] = useState("");
  const [viewerCount, setViewerCount] = useState(0);

  useEffect(() => {
    const socket = new WebSocket(
      `ws://localhost:8000/ws/stream/${roomName}/`
    );

    socketRef.current = socket;

    const sendInputEvent = (key: string, state: "down" | "up") => {
      if (!viewerIdRef.current) return;

      socketRef.current?.send(
        JSON.stringify({
          type: "input_event",
          viewer_id: viewerIdRef.current,
          key,
          state,
        })
      );
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      const key = event.key.toLowerCase();

      if (!["w", "a", "s", "d"].includes(key)) return;
      if (event.repeat) return;

      sendInputEvent(key, "down");
    };

    const handleKeyUp = (event: KeyboardEvent) => {
      const key = event.key.toLowerCase();

      if (!["w", "a", "s", "d"].includes(key)) return;

      sendInputEvent(key, "up");
    };

    socket.onopen = () => {
      socket.send(
        JSON.stringify({
          type: "join_viewer",
        })
      );
    };

    socket.onmessage = async (event) => {
      const data = JSON.parse(event.data);

      if (data.type === "joined_as_viewer") {
        setViewerId(data.viewer_id);
        viewerIdRef.current = data.viewer_id;
      }

      if (data.type === "viewer_count") {
        setViewerCount(data.count);
      }

      if (data.type === "webrtc_offer") {
        if (data.viewer_id !== viewerIdRef.current) return;

        peerConnectionRef.current?.close();

        const pc = new RTCPeerConnection({
          iceServers: [
            {
              urls: "stun:stun.l.google.com:19302",
            },
          ],
        });

        peerConnectionRef.current = pc;

        pc.ontrack = (event) => {
          if (videoRef.current) {
            videoRef.current.srcObject = event.streams[0];
          }
        };

        pc.onicecandidate = (event) => {
          if (event.candidate) {
            socketRef.current?.send(
              JSON.stringify({
                type: "webrtc_candidate",
                viewer_id: viewerIdRef.current,
                candidate: event.candidate,
              })
            );
          }
        };

        await pc.setRemoteDescription(
          new RTCSessionDescription(data.sdp)
        );

        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);

        socketRef.current?.send(
          JSON.stringify({
            type: "webrtc_answer",
            viewer_id: viewerIdRef.current,
            sdp: answer,
          })
        );
      }

      if (data.type === "webrtc_candidate") {
        if (data.viewer_id !== viewerIdRef.current) return;

        const pc = peerConnectionRef.current;
        if (!pc) return;

        await pc.addIceCandidate(
          new RTCIceCandidate(data.candidate)
        );
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("keyup", handleKeyUp);

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("keyup", handleKeyUp);

      socket.close();
      peerConnectionRef.current?.close();
    };
  }, [roomName]);

  return (
    <main>
      <h1>視聴ルーム: {roomName}</h1>

      <p>viewerId: {viewerId}</p>
      <p>viewerCount: {viewerCount}</p>

      <video
        ref={videoRef}
        autoPlay
        playsInline
        controls
        style={{
          width: "640px",
          backgroundColor: "black",
        }}
      />
    </main>
  );
}