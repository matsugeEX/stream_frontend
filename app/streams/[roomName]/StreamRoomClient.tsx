"use client";

import { useEffect, useRef, useState } from "react";

type Props = {
  roomName: string;
};

export default function StreamRoomClient({ roomName }: Props) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const socketRef = useRef<WebSocket | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const peerConnectionsRef = useRef<Record<string, RTCPeerConnection>>({});

  const [isStreaming, setIsStreaming] = useState(false);

  const createOfferForViewer = async (viewerId: string) => {
    if (!streamRef.current) return;

    const pc = new RTCPeerConnection({
      iceServers: [
        {
          urls: "stun:stun.l.google.com:19302",
        },
      ],
    });

    peerConnectionsRef.current[viewerId] = pc;

    streamRef.current.getTracks().forEach((track) => {
      pc.addTrack(track, streamRef.current!);
    });

    pc.onicecandidate = (event) => {
      if (event.candidate) {
        socketRef.current?.send(
          JSON.stringify({
            type: "webrtc_candidate",
            viewer_id: viewerId,
            candidate: event.candidate,
          })
        );
      }
    };

    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);

    socketRef.current?.send(
      JSON.stringify({
        type: "webrtc_offer",
        viewer_id: viewerId,
        sdp: offer,
      })
    );
  };

  useEffect(() => {
    const socket = new WebSocket(
      `ws://localhost:8000/ws/stream/${roomName}/`
    );

    socketRef.current = socket;

    socket.onopen = () => {
      socket.send(
        JSON.stringify({
          type: "join_streamer",
        })
      );
    };

    socket.onmessage = async (event) => {
      const data = JSON.parse(event.data);

      if (data.type === "viewer_joined") {
        await createOfferForViewer(data.viewer_id);
      }

      if (data.type === "webrtc_answer") {
        const pc = peerConnectionsRef.current[data.viewer_id];

        if (!pc) return;

        await pc.setRemoteDescription(
          new RTCSessionDescription(data.sdp)
        );
      }

      if (data.type === "webrtc_candidate") {
        const pc = peerConnectionsRef.current[data.viewer_id];

        if (!pc) return;

        await pc.addIceCandidate(
          new RTCIceCandidate(data.candidate)
        );
      }

      if (data.type === "viewer_left") {
        const pc = peerConnectionsRef.current[data.viewer_id];

        if (pc) {
          pc.close();
          delete peerConnectionsRef.current[data.viewer_id];
        }
      }
    };

    return () => {
      socket.close();

      Object.values(peerConnectionsRef.current).forEach((pc) => {
        pc.close();
      });

      streamRef.current?.getTracks().forEach((track) => {
        track.stop();
      });
    };
  }, [roomName]);

  const startStreaming = async () => {
    const stream = await navigator.mediaDevices.getDisplayMedia({
      video: true,
      audio: false,
    });

    streamRef.current = stream;

    if (videoRef.current) {
      videoRef.current.srcObject = stream;
    }

    setIsStreaming(true);
  };

  return (
    <main>
      <h1>配信ルーム: {roomName}</h1>

      <video
        ref={videoRef}
        autoPlay
        muted
        playsInline
        style={{
          width: "640px",
          backgroundColor: "black",
        }}
      />

      <div>
        <button onClick={startStreaming} disabled={isStreaming}>
          {isStreaming ? "配信中" : "画面共有開始"}
        </button>
      </div>
    </main>
  );
}