"use client";

import { useEffect, useRef } from "react";

type Props = {
  roomName: string;
};

export default function StreamRoomClient({ roomName }: Props) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const socketRef = useRef<WebSocket | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const peerConnectionsRef = useRef<Record<string, RTCPeerConnection>>({});

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

  useEffect(() => {
    const startScreenShare = async () => {
      const stream = await navigator.mediaDevices.getDisplayMedia({
        video: true,
        audio: false,
      });

      streamRef.current = stream;

      if (videoRef.current) {
        videoRef.current.srcObject = stream;
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
          await fetch("http://127.0.0.1:9000/input", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              key: data.key,
            }),
          });
        }
      };
    };

    startScreenShare();

    return () => {
      socketRef.current?.close();

      streamRef.current?.getTracks().forEach((track) => {
        track.stop();
      });

      Object.values(peerConnectionsRef.current).forEach((pc) => {
        pc.close();
      });

      peerConnectionsRef.current = {};
    };
  }, [roomName]);

  return (
    <div>
      <h1>Streamer Room: {roomName}</h1>

      <video
        ref={videoRef}
        autoPlay
        playsInline
        muted
        style={{
          width: "640px",
          background: "black",
          border: "1px solid white",
        }}
      />
    </div>
  );
}