"use client";

import { useEffect, useRef, useState } from "react";

type Props = {
  roomName: string;
};

export default function StreamRoomClient({
  roomName,
}: Props) {
  const videoRef =
    useRef<HTMLVideoElement | null>(null);

  const socketRef =
    useRef<WebSocket | null>(null);

  const streamRef =
    useRef<MediaStream | null>(null);

  const peerConnectionsRef = useRef<
    Record<string, RTCPeerConnection>
  >({});

  const [isSharing, setIsSharing] =
    useState(false);

  const [status, setStatus] =
    useState("画面共有を開始してください");

  const createOfferForViewer = async (
    viewerId: string
  ) => {
    const stream = streamRef.current;

    if (!stream) {
      console.warn(
        "画面共有ストリームがありません"
      );
      return;
    }

    const oldConnection =
      peerConnectionsRef.current[viewerId];

    if (oldConnection) {
      oldConnection.close();
    }

    const peerConnection =
      new RTCPeerConnection({
        iceServers: [
          {
            urls: "stun:stun.l.google.com:19302",
          },
        ],
      });

    peerConnectionsRef.current[viewerId] =
      peerConnection;

    stream.getTracks().forEach((track) => {
      peerConnection.addTrack(track, stream);
    });

    peerConnection.onicecandidate = (
      event
    ) => {
      if (!event.candidate) {
        return;
      }

      socketRef.current?.send(
        JSON.stringify({
          type: "webrtc_candidate",
          viewer_id: viewerId,
          candidate: event.candidate,
        })
      );
    };

    peerConnection.onconnectionstatechange =
      () => {
        console.log(
          "connection state:",
          viewerId,
          peerConnection.connectionState
        );
      };

    const offer =
      await peerConnection.createOffer();

    await peerConnection.setLocalDescription(
      offer
    );

    socketRef.current?.send(
      JSON.stringify({
        type: "webrtc_offer",
        viewer_id: viewerId,
        sdp: offer,
      })
    );

    console.log(
      "offer sent:",
      viewerId
    );
  };

  const connectWebSocket = () => {
    if (
      socketRef.current &&
      socketRef.current.readyState ===
        WebSocket.OPEN
    ) {
      return;
    }

    const hostname =
      window.location.hostname;

    const socket = new WebSocket(
      `ws://${hostname}:8000/ws/stream/${roomName}/`
    );

    socketRef.current = socket;

    socket.onopen = () => {
      console.log("websocket connected");

      setStatus(
        "配信サーバーに接続しました"
      );

      socket.send(
        JSON.stringify({
          type: "join_streamer",
        })
      );
    };

    socket.onmessage = async (event) => {
      try {
        const data = JSON.parse(event.data);

        console.log(
          "websocket message:",
          data
        );

        if (
          data.type === "viewer_joined"
        ) {
          await createOfferForViewer(
            data.viewer_id
          );
        }

        if (
          data.type === "webrtc_answer"
        ) {
          const peerConnection =
            peerConnectionsRef.current[
              data.viewer_id
            ];

          if (!peerConnection) {
            return;
          }

          await peerConnection.setRemoteDescription(
            new RTCSessionDescription(
              data.sdp
            )
          );
        }

        if (
          data.type ===
          "webrtc_candidate"
        ) {
          const peerConnection =
            peerConnectionsRef.current[
              data.viewer_id
            ];

          if (!peerConnection) {
            return;
          }

          await peerConnection.addIceCandidate(
            new RTCIceCandidate(
              data.candidate
            )
          );
        }
      } catch (error) {
        console.error(
          "message handling failed:",
          error
        );
      }
    };

    socket.onerror = (error) => {
      console.error(
        "websocket error:",
        error
      );

      setStatus(
        "WebSocket接続に失敗しました"
      );
    };

    socket.onclose = () => {
      console.log("websocket closed");

      setStatus(
        "配信サーバーとの接続が終了しました"
      );
    };
  };

  const startScreenShare = async () => {
    try {
      setStatus(
        "共有する画面を選択してください"
      );

      const stream =
        await navigator.mediaDevices.getDisplayMedia(
          {
            video: {
              frameRate: {
                ideal: 60,
                max: 60,
              },
            },
            audio: false,
          }
        );

      streamRef.current = stream;

      if (videoRef.current) {
        videoRef.current.srcObject =
          stream;

        await videoRef.current.play();
      }

      const videoTrack =
        stream.getVideoTracks()[0];

      if (videoTrack) {
        videoTrack.onended = () => {
          stopScreenShare();
        };
      }

      setIsSharing(true);
      setStatus(
        "画面共有中です。スマホを接続してください"
      );

      connectWebSocket();
    } catch (error) {
      console.error(
        "screen share failed:",
        error
      );

      if (
        error instanceof DOMException &&
        error.name === "NotAllowedError"
      ) {
        setStatus(
          "画面共有がキャンセルされました"
        );
      } else {
        setStatus(
          "画面共有の開始に失敗しました"
        );
      }
    }
  };

  const stopScreenShare = () => {
    streamRef.current
      ?.getTracks()
      .forEach((track) => {
        track.stop();
      });

    streamRef.current = null;

    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }

    Object.values(
      peerConnectionsRef.current
    ).forEach((peerConnection) => {
      peerConnection.close();
    });

    peerConnectionsRef.current = {};

    socketRef.current?.close();
    socketRef.current = null;

    setIsSharing(false);
    setStatus(
      "画面共有を停止しました"
    );
  };

  useEffect(() => {
    return () => {
      streamRef.current
        ?.getTracks()
        .forEach((track) => {
          track.stop();
        });

      socketRef.current?.close();

      Object.values(
        peerConnectionsRef.current
      ).forEach((peerConnection) => {
        peerConnection.close();
      });

      peerConnectionsRef.current = {};
    };
  }, []);

  return (
    <main className="min-h-screen bg-black p-6 text-white">
      <h1 className="mb-4 text-2xl font-bold">
        Streamer Room: {roomName}
      </h1>

      <p className="mb-4 text-sm">
        {status}
      </p>

      <div className="mb-4 flex gap-3">
        {!isSharing ? (
          <button
            type="button"
            onClick={startScreenShare}
            className="rounded bg-blue-600 px-5 py-3 font-semibold text-white"
          >
            画面共有を開始
          </button>
        ) : (
          <button
            type="button"
            onClick={stopScreenShare}
            className="rounded bg-red-600 px-5 py-3 font-semibold text-white"
          >
            画面共有を停止
          </button>
        )}
      </div>

      <video
        ref={videoRef}
        autoPlay
        playsInline
        muted
        className="w-full max-w-4xl border border-white bg-black"
      />
    </main>
  );
}