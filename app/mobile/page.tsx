"use client";

import { useEffect, useRef, useState } from "react";

export default function MobilePage() {
  const roomName = "test";

  const API_BASE = "http://192.168.1.5:8010";

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const socketRef = useRef<WebSocket | null>(null);
  const peerConnectionRef = useRef<RTCPeerConnection | null>(null);
  const viewerIdRef = useRef<string>("");

  const leftStickRef = useRef<HTMLDivElement | null>(null);
  const leftTouchIdRef = useRef<number | null>(null);
  const lookTouchIdRef = useRef<number | null>(null);

  const stickCenterRef = useRef({ x: 0, y: 0 });
  const lastLookRef = useRef({ x: 0, y: 0 });
  const activeKeysRef = useRef<Set<string>>(new Set());

  const [viewerId, setViewerId] = useState("");
  const [viewerCount, setViewerCount] = useState(0);
  const [logs, setLogs] = useState<string[]>([]);

  const addLog = (message: string) => {
    console.log(message);
    setLogs((prev) => [message, ...prev].slice(0, 10));
  };

  const focusGame = async () => {
    addLog("focus game");

    try {
      const response = await fetch(`${API_BASE}/focus`, {
        method: "POST",
      });

      addLog(`focus response ${response.status}`);
    } catch (error) {
      console.error("focus failed:", error);
      addLog("focus failed");
    }
  };

  useEffect(() => {
    const wsBase = `ws://${window.location.hostname}:8000`;
    const socket = new WebSocket(`${wsBase}/ws/stream/${roomName}/`);

    socketRef.current = socket;

    socket.onopen = () => {
      addLog("websocket open");
      socket.send(JSON.stringify({ type: "join_viewer" }));
    };

    socket.onmessage = async (event) => {
      const data = JSON.parse(event.data);

      if (data.type === "joined_as_viewer") {
        setViewerId(data.viewer_id);
        viewerIdRef.current = data.viewer_id;
        addLog("joined as viewer");
      }

      if (data.type === "viewer_count") {
        setViewerCount(data.count);
      }

      if (data.type === "webrtc_offer") {
        if (data.viewer_id !== viewerIdRef.current) return;

        peerConnectionRef.current?.close();

        const pc = new RTCPeerConnection({
          iceServers: [{ urls: "stun:stun.l.google.com:19302" }],
        });

        peerConnectionRef.current = pc;

        pc.ontrack = (event) => {
          addLog("video track received");

          if (videoRef.current) {
            videoRef.current.srcObject = event.streams[0];
            videoRef.current.play().catch((error) => {
              console.error("video play failed:", error);
              addLog("video play failed");
            });
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

        await pc.setRemoteDescription(new RTCSessionDescription(data.sdp));

        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);

        socketRef.current?.send(
          JSON.stringify({
            type: "webrtc_answer",
            viewer_id: viewerIdRef.current,
            sdp: answer,
          })
        );

        addLog("webrtc answer sent");
      }

      if (data.type === "webrtc_candidate") {
        if (data.viewer_id !== viewerIdRef.current) return;

        const pc = peerConnectionRef.current;
        if (!pc) return;

        await pc.addIceCandidate(new RTCIceCandidate(data.candidate));
      }
    };

    socket.onerror = () => {
      addLog("websocket error");
    };

    socket.onclose = () => {
      addLog("websocket closed");
    };

    return () => {
      socket.close();
      peerConnectionRef.current?.close();
    };
  }, []);

  const sendKey = async (key: string, action: "down" | "up") => {
    addLog(`key ${key} ${action}`);

    try {
      const response = await fetch(`${API_BASE}/input`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ key, action }),
      });

      addLog(`key response ${response.status}`);
    } catch (error) {
      console.error("sendKey failed:", error);
      addLog("key fetch failed");
    }
  };

  const sendMouseMove = async (dx: number, dy: number) => {
    try {
      await fetch(`${API_BASE}/mouse-move`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ dx, dy }),
      });
    } catch (error) {
      console.error("sendMouseMove failed:", error);
      addLog("mouse move failed");
    }
  };

  const sendMouseButton = async (
    button: "left" | "right",
    action: "down" | "up"
  ) => {
    addLog(`mouse ${button} ${action}`);

    try {
      const response = await fetch(`${API_BASE}/mouse-button`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ button, action }),
      });

      addLog(`mouse button response ${response.status}`);
    } catch (error) {
      console.error("sendMouseButton failed:", error);
      addLog("mouse button failed");
    }
  };

  const updateMovement = async (dx: number, dy: number) => {
    const threshold = 25;
    const nextKeys = new Set<string>();

    if (dy < -threshold) nextKeys.add("w");
    if (dy > threshold) nextKeys.add("s");
    if (dx < -threshold) nextKeys.add("a");
    if (dx > threshold) nextKeys.add("d");

    for (const key of activeKeysRef.current) {
      if (!nextKeys.has(key)) {
        await sendKey(key, "up");
      }
    }

    for (const key of nextKeys) {
      if (!activeKeysRef.current.has(key)) {
        await sendKey(key, "down");
      }
    }

    activeKeysRef.current = nextKeys;
  };

  const stopMovement = async () => {
    for (const key of activeKeysRef.current) {
      await sendKey(key, "up");
    }

    activeKeysRef.current.clear();
  };

  return (
    <main className="fixed inset-0 overflow-hidden bg-black text-white select-none touch-none">
      <video
        ref={videoRef}
        autoPlay
        playsInline
        muted
        className="absolute inset-0 h-full w-full bg-black object-cover"
      />

      <div className="absolute left-3 top-3 z-30 rounded bg-black/60 px-3 py-1 text-xs">
        room: {roomName} / viewers: {viewerCount} /{" "}
        {viewerId ? "connected" : "connecting..."}
      </div>

      <div className="absolute left-3 top-12 z-30 max-w-[90vw] rounded bg-black/70 px-3 py-2 text-xs">
        {logs.map((log, index) => (
          <div key={index}>{log}</div>
        ))}
      </div>

      <button
        className="absolute left-3 top-40 z-30 rounded bg-white px-4 py-2 text-sm text-black"
        onClick={focusGame}
      >
        Focus Game
      </button>

      <div className="absolute inset-0 z-20 flex">
        <div className="relative h-full w-1/2">
          <div
            ref={leftStickRef}
            className="absolute bottom-10 left-10 h-40 w-40 rounded-full border-4 border-white/30 bg-white/10"
            onTouchStart={(e) => {
              e.preventDefault();
              e.stopPropagation();

              addLog("left stick start");

              const touch = e.changedTouches[0];
              leftTouchIdRef.current = touch.identifier;

              const rect = leftStickRef.current!.getBoundingClientRect();
              stickCenterRef.current = {
                x: rect.left + rect.width / 2,
                y: rect.top + rect.height / 2,
              };
            }}
            onTouchMove={(e) => {
              e.preventDefault();
              e.stopPropagation();

              for (const touch of Array.from(e.changedTouches)) {
                if (touch.identifier === leftTouchIdRef.current) {
                  const dx = touch.clientX - stickCenterRef.current.x;
                  const dy = touch.clientY - stickCenterRef.current.y;
                  updateMovement(dx, dy);
                }
              }
            }}
            onTouchEnd={(e) => {
              e.preventDefault();
              e.stopPropagation();

              addLog("left stick end");

              leftTouchIdRef.current = null;
              stopMovement();
            }}
            onTouchCancel={(e) => {
              e.preventDefault();
              e.stopPropagation();

              addLog("left stick cancel");

              leftTouchIdRef.current = null;
              stopMovement();
            }}
          >
            <div className="absolute left-1/2 top-1/2 h-16 w-16 -translate-x-1/2 -translate-y-1/2 rounded-full bg-white/40" />
          </div>
        </div>

        <div
          className="relative h-full w-1/2"
          onTouchStart={(e) => {
            e.preventDefault();

            addLog("look start");

            const touch = e.changedTouches[0];
            lookTouchIdRef.current = touch.identifier;

            lastLookRef.current = {
              x: touch.clientX,
              y: touch.clientY,
            };
          }}
          onTouchMove={(e) => {
            e.preventDefault();

            for (const touch of Array.from(e.changedTouches)) {
              if (touch.identifier === lookTouchIdRef.current) {
                const dx = touch.clientX - lastLookRef.current.x;
                const dy = touch.clientY - lastLookRef.current.y;

                lastLookRef.current = {
                  x: touch.clientX,
                  y: touch.clientY,
                };

                sendMouseMove(dx * 2, dy * 2);
              }
            }
          }}
          onTouchEnd={(e) => {
            e.preventDefault();
            addLog("look end");
            lookTouchIdRef.current = null;
          }}
          onTouchCancel={(e) => {
            e.preventDefault();
            addLog("look cancel");
            lookTouchIdRef.current = null;
          }}
        >
          <button
            className="absolute bottom-10 right-10 h-20 w-20 rounded-full border border-white/40 bg-white/20 active:bg-white/50"
            onTouchStart={(e) => {
              e.preventDefault();
              e.stopPropagation();
              sendKey(" ", "down");
            }}
            onTouchEnd={(e) => {
              e.preventDefault();
              e.stopPropagation();
              sendKey(" ", "up");
            }}
          >
            Jump
          </button>

          <button
            className="absolute bottom-24 right-36 h-20 w-20 rounded-full border border-white/40 bg-white/20 active:bg-white/50"
            onTouchStart={(e) => {
              e.preventDefault();
              e.stopPropagation();
              sendKey("Shift", "down");
            }}
            onTouchEnd={(e) => {
              e.preventDefault();
              e.stopPropagation();
              sendKey("Shift", "up");
            }}
          >
            Shift
          </button>

          <button
            className="absolute bottom-2 right-36 h-20 w-20 rounded-full border border-white/40 bg-white/20 active:bg-white/50"
            onTouchStart={(e) => {
              e.preventDefault();
              e.stopPropagation();
              sendMouseButton("left", "down");
            }}
            onTouchEnd={(e) => {
              e.preventDefault();
              e.stopPropagation();
              sendMouseButton("left", "up");
            }}
          >
            Attack
          </button>

          <button
            className="absolute bottom-12 right-60 h-20 w-20 rounded-full border border-white/40 bg-white/20 active:bg-white/50"
            onTouchStart={(e) => {
              e.preventDefault();
              e.stopPropagation();
              sendMouseButton("right", "down");
            }}
            onTouchEnd={(e) => {
              e.preventDefault();
              e.stopPropagation();
              sendMouseButton("right", "up");
            }}
          >
            Aim
          </button>
        </div>
      </div>
    </main>
  );
}