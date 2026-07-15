"use client";

import { useEffect, useRef, useState } from "react";

export default function MobilePage() {
  const roomName = "test";

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const socketRef = useRef<WebSocket | null>(null);
  const peerConnectionRef = useRef<RTCPeerConnection | null>(null);
  const viewerIdRef = useRef("");

  const leftStickRef = useRef<HTMLDivElement | null>(null);
  const leftTouchIdRef = useRef<number | null>(null);
  const lookTouchIdRef = useRef<number | null>(null);

  const stickCenterRef = useRef({
    x: 0,
    y: 0,
  });

  const lastLookRef = useRef({
    x: 0,
    y: 0,
  });

  const pendingMouseRef = useRef({
    dx: 0,
    dy: 0,
  });

  const mouseFrameRef = useRef<number | null>(null);
  const activeKeysRef = useRef<Set<string>>(new Set());

  const [viewerId, setViewerId] = useState("");
  const [viewerCount, setViewerCount] = useState(0);
  const [logs, setLogs] = useState<string[]>([]);

  const getApiBase = () => {
    return `http://${window.location.hostname}:8010`;
  };

  const addLog = (message: string) => {
    console.log(message);
    setLogs((previous) => [message, ...previous].slice(0, 8));
  };

  const focusGame = async () => {
    addLog("focus game");
    try {
      const response = await fetch(`${getApiBase()}/focus`, {
        method: "POST",
      });

      const result = await response.json();

      addLog(`focus: ${result.status}`);
    } catch (error) {
      console.error("focus failed:", error);
      addLog("focus failed");
    }
  };

  const sendKey = async (
    key: string,
    action: "down" | "up"
  ) => {
    try {
      const response = await fetch(`${getApiBase()}/input`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          key,
          action,
        }),
      });

      if (!response.ok) {
        addLog(`key error: ${response.status}`);
      }
    } catch (error) {
      console.error("sendKey failed:", error);
      addLog("key fetch failed");
    }
  };

  const sendMouseMove = async (
    dx: number,
    dy: number
  ) => {
    if (dx === 0 && dy === 0) {
      return;
    }

    try {
      const response = await fetch(
        `${getApiBase()}/mouse-move`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            dx,
            dy,
          }),
        }
      );

      if (!response.ok) {
        addLog(`mouse error: ${response.status}`);
      }
    } catch (error) {
      console.error("sendMouseMove failed:", error);
      addLog("mouse move failed");
    }
  };

  const scheduleMouseMove = (
    dx: number,
    dy: number
  ) => {
    pendingMouseRef.current.dx += dx;
    pendingMouseRef.current.dy += dy;

    if (mouseFrameRef.current !== null) {
      return;
    }

    mouseFrameRef.current = requestAnimationFrame(() => {
      const movement = pendingMouseRef.current;

      pendingMouseRef.current = {
        dx: 0,
        dy: 0,
      };

      mouseFrameRef.current = null;

      // 視点感度
      const sensitivity = 1.8;

      const sendDx = Math.round(
        movement.dx * sensitivity
      );

      const sendDy = Math.round(
        movement.dy * sensitivity
      );

      void sendMouseMove(sendDx, sendDy);
    });
  };

  const updateMovement = (
    dx: number,
    dy: number
  ) => {
    const threshold = 25;
    const nextKeys = new Set<string>();

    if (dy < -threshold) {
      nextKeys.add("w");
    }

    if (dy > threshold) {
      nextKeys.add("s");
    }

    if (dx < -threshold) {
      nextKeys.add("a");
    }

    if (dx > threshold) {
      nextKeys.add("d");
    }

    for (const key of activeKeysRef.current) {
      if (!nextKeys.has(key)) {
        void sendKey(key, "up");
      }
    }

    for (const key of nextKeys) {
      if (!activeKeysRef.current.has(key)) {
        void sendKey(key, "down");
      }
    }

    activeKeysRef.current = nextKeys;
  };

  const stopMovement = () => {
    for (const key of activeKeysRef.current) {
      void sendKey(key, "up");
    }

    activeKeysRef.current.clear();
  };

  const releaseAllInputs = () => {
    stopMovement();

    void sendKey("Shift", "up");
    void sendKey(" ", "up");

    fetch(`${getApiBase()}/release-all`, {
      method: "POST",
    }).catch((error) => {
      console.error("release all failed:", error);
    });
  };

  useEffect(() => {
    const wsBase = `ws://${window.location.hostname}:8000`;
    const socket = new WebSocket(
      `${wsBase}/ws/stream/${roomName}/`
    );

    socketRef.current = socket;

    socket.onopen = () => {
      addLog("websocket open");

      socket.send(
        JSON.stringify({
          type: "join_viewer",
        })
      );
    };

    socket.onmessage = async (event) => {
      try {
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
          if (
            data.viewer_id !== viewerIdRef.current
          ) {
            return;
          }

          peerConnectionRef.current?.close();

          const peerConnection =
            new RTCPeerConnection({
              iceServers: [
                {
                  urls: "stun:stun.l.google.com:19302",
                },
              ],
            });

          peerConnectionRef.current =
            peerConnection;

          peerConnection.ontrack = (trackEvent) => {
            addLog("video track received");

            if (!videoRef.current) {
              return;
            }

            videoRef.current.srcObject =
              trackEvent.streams[0];

            videoRef.current
              .play()
              .catch((error) => {
                console.error(
                  "video play failed:",
                  error
                );

                addLog("video play failed");
              });
          };

          peerConnection.onicecandidate = (
            candidateEvent
          ) => {
            if (!candidateEvent.candidate) {
              return;
            }

            socketRef.current?.send(
              JSON.stringify({
                type: "webrtc_candidate",
                viewer_id:
                  viewerIdRef.current,
                candidate:
                  candidateEvent.candidate,
              })
            );
          };

          await peerConnection.setRemoteDescription(
            new RTCSessionDescription(data.sdp)
          );

          const answer =
            await peerConnection.createAnswer();

          await peerConnection.setLocalDescription(
            answer
          );

          socketRef.current?.send(
            JSON.stringify({
              type: "webrtc_answer",
              viewer_id: viewerIdRef.current,
              sdp: answer,
            })
          );

          addLog("webrtc answer sent");
        }

        if (
          data.type === "webrtc_candidate"
        ) {
          if (
            data.viewer_id !== viewerIdRef.current
          ) {
            return;
          }

          const peerConnection =
            peerConnectionRef.current;

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
          "websocket message failed:",
          error
        );

        addLog("message error");
      }
    };

    socket.onerror = () => {
      addLog("websocket error");
    };

    socket.onclose = () => {
      addLog("websocket closed");
    };

    const handleVisibilityChange = () => {
      if (document.hidden) {
        releaseAllInputs();
      }
    };

    const handlePageHide = () => {
      releaseAllInputs();
    };

    document.addEventListener(
      "visibilitychange",
      handleVisibilityChange
    );

    window.addEventListener(
      "pagehide",
      handlePageHide
    );

    return () => {
      releaseAllInputs();

      document.removeEventListener(
        "visibilitychange",
        handleVisibilityChange
      );

      window.removeEventListener(
        "pagehide",
        handlePageHide
      );

      socket.close();
      peerConnectionRef.current?.close();

      if (mouseFrameRef.current !== null) {
        cancelAnimationFrame(
          mouseFrameRef.current
        );
      }
    };
  }, []);

  return (
    <main className="fixed inset-0 select-none overflow-hidden bg-black text-white touch-none">
      <video
        ref={videoRef}
        autoPlay
        playsInline
        muted
        className="absolute inset-0 h-full w-full bg-black object-cover"
      />

      <div className="absolute left-3 top-3 z-30 rounded bg-black/60 px-3 py-1 text-xs">
        room: {roomName} / viewers:{" "}
        {viewerCount} /{" "}
        {viewerId
          ? "connected"
          : "connecting..."}
      </div>

      <div className="absolute left-3 top-12 z-30 max-w-[90vw] rounded bg-black/70 px-3 py-2 text-xs">
        {logs.map((log, index) => (
          <div key={`${log}-${index}`}>
            {log}
          </div>
        ))}
      </div>

      <button
        type="button"
        className="absolute left-3 top-36 z-30 rounded bg-white px-4 py-2 text-sm text-black"
        onClick={focusGame}
      >
        Focus Game
      </button>

      <div className="absolute inset-0 z-20 flex">
        {/* 左半分：移動 */}
        <div className="relative h-full w-1/2">
          <div
            ref={leftStickRef}
            className="absolute bottom-10 left-10 h-40 w-40 rounded-full border-4 border-white/30 bg-white/10"
            onTouchStart={(event) => {
              event.preventDefault();
              event.stopPropagation();

              const touch =
                event.changedTouches[0];

              leftTouchIdRef.current =
                touch.identifier;

              const rectangle =
                leftStickRef.current?.getBoundingClientRect();

              if (!rectangle) {
                return;
              }

              stickCenterRef.current = {
                x:
                  rectangle.left +
                  rectangle.width / 2,
                y:
                  rectangle.top +
                  rectangle.height / 2,
              };

              updateMovement(
                touch.clientX -
                  stickCenterRef.current.x,
                touch.clientY -
                  stickCenterRef.current.y
              );
            }}
            onTouchMove={(event) => {
              event.preventDefault();
              event.stopPropagation();

              for (const touch of Array.from(
                event.changedTouches
              )) {
                if (
                  touch.identifier !==
                  leftTouchIdRef.current
                ) {
                  continue;
                }

                updateMovement(
                  touch.clientX -
                    stickCenterRef.current.x,
                  touch.clientY -
                    stickCenterRef.current.y
                );
              }
            }}
            onTouchEnd={(event) => {
              event.preventDefault();
              event.stopPropagation();

              leftTouchIdRef.current = null;
              stopMovement();
            }}
            onTouchCancel={(event) => {
              event.preventDefault();
              event.stopPropagation();

              leftTouchIdRef.current = null;
              stopMovement();
            }}
          >
            <div className="absolute left-1/2 top-1/2 h-16 w-16 -translate-x-1/2 -translate-y-1/2 rounded-full bg-white/40" />
          </div>
        </div>

        {/* 右半分：視点操作 */}
        <div
          className="relative h-full w-1/2"
          onTouchStart={(event) => {
            event.preventDefault();

            const touch =
              event.changedTouches[0];

            lookTouchIdRef.current =
              touch.identifier;

            lastLookRef.current = {
              x: touch.clientX,
              y: touch.clientY,
            };
          }}
          onTouchMove={(event) => {
            event.preventDefault();

            for (const touch of Array.from(
              event.changedTouches
            )) {
              if (
                touch.identifier !==
                lookTouchIdRef.current
              ) {
                continue;
              }

              const dx =
                touch.clientX -
                lastLookRef.current.x;

              const dy =
                touch.clientY -
                lastLookRef.current.y;

              lastLookRef.current = {
                x: touch.clientX,
                y: touch.clientY,
              };

              scheduleMouseMove(dx, dy);
            }
          }}
          onTouchEnd={(event) => {
            event.preventDefault();
            lookTouchIdRef.current = null;
          }}
          onTouchCancel={(event) => {
            event.preventDefault();
            lookTouchIdRef.current = null;
          }}
        >
          <div className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 rounded bg-black/40 px-2 py-1 text-xs text-white/60">
            Swipe to look
          </div>

          <button
            type="button"
            className="absolute bottom-10 right-8 h-20 w-20 rounded-full border border-white/40 bg-white/20 active:bg-white/50"
            onTouchStart={(event) => {
              event.preventDefault();
              event.stopPropagation();

              void sendKey(" ", "down");
            }}
            onTouchEnd={(event) => {
              event.preventDefault();
              event.stopPropagation();

              void sendKey(" ", "up");
            }}
            onTouchCancel={(event) => {
              event.preventDefault();
              event.stopPropagation();

              void sendKey(" ", "up");
            }}
          >
            Jump
          </button>

          <button
            type="button"
            className="absolute bottom-10 right-32 h-20 w-20 rounded-full border border-white/40 bg-white/20 active:bg-white/50"
            onTouchStart={(event) => {
              event.preventDefault();
              event.stopPropagation();

              void sendKey(
                "Shift",
                "down"
              );
            }}
            onTouchEnd={(event) => {
              event.preventDefault();
              event.stopPropagation();

              void sendKey("Shift", "up");
            }}
            onTouchCancel={(event) => {
              event.preventDefault();
              event.stopPropagation();

              void sendKey("Shift", "up");
            }}
          >
            Shift
          </button>
        </div>
      </div>
    </main>
  );
}