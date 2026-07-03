"use client";

import { useEffect, useRef } from "react";

type Props = {
  roomName: string;
};

export default function StreamRoomClient({ roomName }: Props) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const socketRef = useRef<WebSocket | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const peerConnectionsRef = useRef<Record<string, RTCPeerConnection>>({});

  const squareRef = useRef({
    x: 100,
    y: 100,
    size: 40,
    speed: 10,
  });

  const draw = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const square = squareRef.current;

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    ctx.fillStyle = "black";
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    ctx.fillStyle = "red";
    ctx.fillRect(square.x, square.y, square.size, square.size);
  };

  const createOfferForViewer = async (viewerId: string) => {
    if (!streamRef.current) return;

    const pc = new RTCPeerConnection({
      iceServers: [{ urls: "stun:stun.l.google.com:19302" }],
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

  const handleInputEvent = (key: string) => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const square = squareRef.current;

    if (key === "ArrowUp") square.y -= square.speed;
    if (key === "ArrowDown") square.y += square.speed;
    if (key === "ArrowLeft") square.x -= square.speed;
    if (key === "ArrowRight") square.x += square.speed;

    square.x = Math.max(0, Math.min(canvas.width - square.size, square.x));
    square.y = Math.max(0, Math.min(canvas.height - square.size, square.y));

    draw();
  };

  useEffect(() => {
    draw();

    const canvas = canvasRef.current;
    if (canvas) {
      streamRef.current = canvas.captureStream(60);
    }

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

      if (data.type === "input_event") {
        handleInputEvent(data.key);
      }
    };

    return () => {
      socket.close();

      Object.values(peerConnectionsRef.current).forEach((pc) => {
        pc.close();
      });

      peerConnectionsRef.current = {};
    };
  }, [roomName]);

  return (
    <div>
      <h1>Streamer Room: {roomName}</h1>

      <canvas
        ref={canvasRef}
        width={640}
        height={360}
        style={{
          border: "1px solid white",
          background: "black",
        }}
      />
    </div>
  );
}