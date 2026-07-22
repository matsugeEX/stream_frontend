"use client";

import {
  PointerEvent as ReactPointerEvent,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";

type WebSocketMessage = {
  type: string;
  viewer_id?: string;
  viewer_count?: number;
  sdp?: RTCSessionDescriptionInit;
  candidate?: RTCIceCandidateInit;
};

type InputResponse = {
  status?: string;
  processing_ms?: number;
};

type Point = {
  x: number;
  y: number;
};

const ROOM_NAME = "test";

const JOYSTICK_RADIUS = 55;
const JOYSTICK_DEAD_ZONE = 15;
const MOUSE_SENSITIVITY = 1.5;

export default function MobilePage() {
  const videoRef =
    useRef<HTMLVideoElement | null>(null);

  const socketRef =
    useRef<WebSocket | null>(null);

  const peerConnectionRef =
    useRef<RTCPeerConnection | null>(null);

  const viewerIdRef = useRef("");

  const pendingOfferRef =
    useRef<WebSocketMessage | null>(null);

  const pendingCandidatesRef =
    useRef<RTCIceCandidateInit[]>([]);

  const joystickPointerIdRef =
    useRef<number | null>(null);

  const joystickCenterRef =
    useRef<Point>({
      x: 0,
      y: 0,
    });

  const activeMovementKeysRef =
    useRef<Set<string>>(new Set());

  const lookPointerIdRef =
    useRef<number | null>(null);

  const previousLookPointRef =
    useRef<Point | null>(null);

  const mouseDeltaRef =
    useRef({
      dx: 0,
      dy: 0,
    });

  const mouseAnimationFrameRef =
    useRef<number | null>(null);

  const [viewerId, setViewerId] =
    useState("");

  const [viewerCount, setViewerCount] =
    useState(0);

  const [connectionStatus, setConnectionStatus] =
    useState("接続準備中");

  const [logs, setLogs] =
    useState<string[]>([]);

  const [joystickOffset, setJoystickOffset] =
    useState<Point>({
      x: 0,
      y: 0,
    });

  const [keyRtt, setKeyRtt] =
    useState<number | null>(null);

  const [mouseRtt, setMouseRtt] =
    useState<number | null>(null);

  const [averageRtt, setAverageRtt] =
    useState<number | null>(null);

  const rttHistoryRef =
    useRef<number[]>([]);

  const addLog = useCallback(
    (message: string) => {
      console.log(message);

      setLogs((currentLogs) => {
        const nextLogs = [
          ...currentLogs,
          message,
        ];

        return nextLogs.slice(-10);
      });
    },
    []
  );

  const recordLatency = useCallback(
    (
      value: number,
      type: "key" | "mouse"
    ) => {
      const roundedValue =
        Math.round(value * 10) / 10;

      if (type === "key") {
        setKeyRtt(roundedValue);
      } else {
        setMouseRtt(roundedValue);
      }

      const history = [
        ...rttHistoryRef.current,
        value,
      ].slice(-30);

      rttHistoryRef.current = history;

      const average =
        history.reduce(
          (total, current) =>
            total + current,
          0
        ) / history.length;

      setAverageRtt(
        Math.round(average * 10) / 10
      );
    },
    []
  );

  const getApiBase = useCallback(() => {
    return `http://${window.location.hostname}:8010`;
  }, []);

  const sendKey = useCallback(
    async (
      key: string,
      action: "down" | "up"
    ) => {
      const startedAt =
        performance.now();

      try {
        const response = await fetch(
          `${getApiBase()}/input`,
          {
            method: "POST",
            headers: {
              "Content-Type":
                "application/json",
            },
            body: JSON.stringify({
              key,
              action,
            }),
          }
        );

        if (!response.ok) {
          throw new Error(
            `HTTP ${response.status}`
          );
        }

        const data =
          (await response.json()) as InputResponse;

        const rtt =
          performance.now() - startedAt;

        recordLatency(rtt, "key");

        console.log("key input:", {
          key,
          action,
          rtt,
          processing_ms:
            data.processing_ms,
        });
      } catch (error) {
        console.error(
          "key input failed:",
          error
        );

        addLog(
          `キー送信失敗: ${key} ${action}`
        );
      }
    },
    [
      addLog,
      getApiBase,
      recordLatency,
    ]
  );

  const sendMouseMove =
    useCallback(
      async (
        dx: number,
        dy: number
      ) => {
        if (dx === 0 && dy === 0) {
          return;
        }

        const startedAt =
          performance.now();

        try {
          const response = await fetch(
            `${getApiBase()}/mouse-move`,
            {
              method: "POST",
              headers: {
                "Content-Type":
                  "application/json",
              },
              body: JSON.stringify({
                dx,
                dy,
              }),
            }
          );

          if (!response.ok) {
            throw new Error(
              `HTTP ${response.status}`
            );
          }

          const data =
            (await response.json()) as InputResponse;

          const rtt =
            performance.now() -
            startedAt;

          recordLatency(
            rtt,
            "mouse"
          );

          console.log("mouse move:", {
            dx,
            dy,
            rtt,
            processing_ms:
              data.processing_ms,
          });
        } catch (error) {
          console.error(
            "mouse move failed:",
            error
          );
        }
      },
      [
        getApiBase,
        recordLatency,
      ]
    );

  const flushMouseMovement =
    useCallback(() => {
      mouseAnimationFrameRef.current =
        null;

      const dx =
        mouseDeltaRef.current.dx;

      const dy =
        mouseDeltaRef.current.dy;

      mouseDeltaRef.current = {
        dx: 0,
        dy: 0,
      };

      void sendMouseMove(
        Math.round(dx),
        Math.round(dy)
      );
    }, [sendMouseMove]);

  const queueMouseMovement =
    useCallback(
      (
        dx: number,
        dy: number
      ) => {
        mouseDeltaRef.current.dx +=
          dx;

        mouseDeltaRef.current.dy +=
          dy;

        if (
          mouseAnimationFrameRef.current !==
          null
        ) {
          return;
        }

        mouseAnimationFrameRef.current =
          window.requestAnimationFrame(
            flushMouseMovement
          );
      },
      [flushMouseMovement]
    );

  const focusGame =
    useCallback(async () => {
      try {
        const response = await fetch(
          `${getApiBase()}/focus`,
          {
            method: "POST",
          }
        );

        if (!response.ok) {
          throw new Error(
            `HTTP ${response.status}`
          );
        }

        addLog(
          "UE5ウィンドウをフォーカスしました"
        );
      } catch (error) {
        console.error(
          "focus failed:",
          error
        );

        addLog(
          "UE5のフォーカスに失敗しました"
        );
      }
    }, [addLog, getApiBase]);

  const releaseAllKeys =
    useCallback(async () => {
      activeMovementKeysRef.current.clear();

      try {
        await fetch(
          `${getApiBase()}/release-all`,
          {
            method: "POST",
          }
        );
      } catch (error) {
        console.error(
          "release all failed:",
          error
        );
      }
    }, [getApiBase]);

  const handleWebRtcOffer =
    useCallback(
      async (
        data: WebSocketMessage
      ) => {
        if (
          !data.sdp ||
          !data.viewer_id
        ) {
          addLog(
            "offerのデータが不足しています"
          );
          return;
        }

        addLog(
          `offer受信: ${data.viewer_id.slice(
            0,
            8
          )}`
        );

        peerConnectionRef.current?.close();

        pendingCandidatesRef.current =
          [];

        const peerConnection =
          new RTCPeerConnection({
            iceServers: [
              {
                urls:
                  "stun:stun.l.google.com:19302",
              },
            ],
          });

        peerConnectionRef.current =
          peerConnection;

        peerConnection.onconnectionstatechange =
          () => {
            const state =
              peerConnection.connectionState;

            setConnectionStatus(
              `WebRTC: ${state}`
            );

            addLog(
              `peer: ${state}`
            );
          };

        peerConnection.oniceconnectionstatechange =
          () => {
            addLog(
              `ice: ${peerConnection.iceConnectionState}`
            );
          };

        peerConnection.onicegatheringstatechange =
          () => {
            console.log(
              "ice gathering:",
              peerConnection.iceGatheringState
            );
          };

        peerConnection.ontrack = (
          event
        ) => {
          addLog(
            "映像トラックを受信しました"
          );

          const video =
            videoRef.current;

          if (!video) {
            addLog(
              "video要素が見つかりません"
            );
            return;
          }

          const receivedStream =
            event.streams[0] ??
            new MediaStream([
              event.track,
            ]);

          video.srcObject =
            receivedStream;

          video
            .play()
            .then(() => {
              addLog(
                "映像再生を開始しました"
              );
            })
            .catch((error) => {
              console.error(
                "video play failed:",
                error
              );

              addLog(
                "映像の自動再生に失敗しました"
              );
            });
        };

        peerConnection.onicecandidate =
          (event) => {
            if (!event.candidate) {
              return;
            }

            const socket =
              socketRef.current;

            if (
              !socket ||
              socket.readyState !==
                WebSocket.OPEN
            ) {
              return;
            }

            socket.send(
              JSON.stringify({
                type:
                  "webrtc_candidate",
                viewer_id:
                  viewerIdRef.current,
                candidate:
                  event.candidate.toJSON(),
              })
            );
          };

        await peerConnection.setRemoteDescription(
          new RTCSessionDescription(
            data.sdp
          )
        );

        addLog(
          "Remote Description設定完了"
        );

        for (const candidate of pendingCandidatesRef.current) {
          try {
            await peerConnection.addIceCandidate(
              new RTCIceCandidate(
                candidate
              )
            );
          } catch (error) {
            console.error(
              "pending candidate failed:",
              error
            );
          }
        }

        pendingCandidatesRef.current =
          [];

        const answer =
          await peerConnection.createAnswer();

        await peerConnection.setLocalDescription(
          answer
        );

        const socket =
          socketRef.current;

        if (
          !socket ||
          socket.readyState !==
            WebSocket.OPEN
        ) {
          addLog(
            "answer送信時にWebSocketが切断されています"
          );
          return;
        }

        socket.send(
          JSON.stringify({
            type:
              "webrtc_answer",
            viewer_id:
              viewerIdRef.current,
            sdp:
              peerConnection.localDescription,
          })
        );

        addLog(
          "WebRTC answerを送信しました"
        );
      },
      [addLog]
    );

  useEffect(() => {
    const hostname =
      window.location.hostname;

    const socket = new WebSocket(
      `ws://${hostname}:8000/ws/stream/${ROOM_NAME}/`
    );

    socketRef.current = socket;

    socket.onopen = () => {
      setConnectionStatus(
        "WebSocket接続済み"
      );

      addLog(
        "WebSocket connected"
      );

      socket.send(
        JSON.stringify({
          type: "join_viewer",
        })
      );
    };

    socket.onmessage = async (
      event
    ) => {
      try {
        const data =
          JSON.parse(
            event.data
          ) as WebSocketMessage;

        console.log(
          "viewer websocket message:",
          data
        );

        if (
          data.type ===
            "joined_as_viewer" &&
          data.viewer_id
        ) {
          viewerIdRef.current =
            data.viewer_id;

          setViewerId(
            data.viewer_id
          );

          addLog(
            `viewer参加: ${data.viewer_id.slice(
              0,
              8
            )}`
          );

          const pendingOffer =
            pendingOfferRef.current;

          if (
            pendingOffer &&
            pendingOffer.viewer_id ===
              data.viewer_id
          ) {
            pendingOfferRef.current =
              null;

            await handleWebRtcOffer(
              pendingOffer
            );
          }

          return;
        }

        if (
          data.type ===
            "viewer_count" &&
          typeof data.viewer_count ===
            "number"
        ) {
          setViewerCount(
            data.viewer_count
          );
          return;
        }

        if (
          data.type ===
          "webrtc_offer"
        ) {
          if (!data.viewer_id) {
            return;
          }

          addLog(
            `offer宛先: ${data.viewer_id.slice(
              0,
              8
            )}`
          );

          if (
            !viewerIdRef.current
          ) {
            pendingOfferRef.current =
              data;

            addLog(
              "viewer ID確定までofferを保留"
            );
            return;
          }

          if (
            data.viewer_id !==
            viewerIdRef.current
          ) {
            return;
          }

          await handleWebRtcOffer(
            data
          );

          return;
        }

        if (
          data.type ===
          "webrtc_candidate"
        ) {
          if (
            !data.viewer_id ||
            !data.candidate
          ) {
            return;
          }

          if (
            data.viewer_id !==
            viewerIdRef.current
          ) {
            return;
          }

          const peerConnection =
            peerConnectionRef.current;

          if (
            !peerConnection ||
            !peerConnection.remoteDescription
          ) {
            pendingCandidatesRef.current.push(
              data.candidate
            );

            addLog(
              "ICE Candidateを保留"
            );

            return;
          }

          try {
            await peerConnection.addIceCandidate(
              new RTCIceCandidate(
                data.candidate
              )
            );
          } catch (error) {
            console.error(
              "addIceCandidate failed:",
              error
            );

            addLog(
              "ICE Candidate追加失敗"
            );
          }
        }
      } catch (error) {
        console.error(
          "websocket message failed:",
          error
        );

        addLog(
          "WebSocketメッセージ処理失敗"
        );
      }
    };

    socket.onerror = (
      event
    ) => {
      console.error(
        "websocket error:",
        event
      );

      setConnectionStatus(
        "WebSocketエラー"
      );

      addLog(
        "WebSocket error"
      );
    };

    socket.onclose = () => {
      setConnectionStatus(
        "WebSocket切断"
      );

      addLog(
        "WebSocket closed"
      );
    };

    return () => {
      socket.close();

      socketRef.current =
        null;

      peerConnectionRef.current?.close();

      peerConnectionRef.current =
        null;

      pendingOfferRef.current =
        null;

      pendingCandidatesRef.current =
        [];

      const video =
        videoRef.current;

      if (video) {
        video.srcObject =
          null;
      }
    };
  }, [
    addLog,
    handleWebRtcOffer,
  ]);

  useEffect(() => {
    const handleVisibilityChange =
      () => {
        if (
          document.visibilityState ===
          "hidden"
        ) {
          void releaseAllKeys();
        }
      };

    const handleBeforeUnload =
      () => {
        void releaseAllKeys();
      };

    document.addEventListener(
      "visibilitychange",
      handleVisibilityChange
    );

    window.addEventListener(
      "beforeunload",
      handleBeforeUnload
    );

    return () => {
      document.removeEventListener(
        "visibilitychange",
        handleVisibilityChange
      );

      window.removeEventListener(
        "beforeunload",
        handleBeforeUnload
      );

      void releaseAllKeys();

      if (
        mouseAnimationFrameRef.current !==
        null
      ) {
        cancelAnimationFrame(
          mouseAnimationFrameRef.current
        );
      }
    };
  }, [releaseAllKeys]);

  const updateMovementKeys =
    useCallback(
      (
        offsetX: number,
        offsetY: number
      ) => {
        const nextKeys =
          new Set<string>();

        if (
          offsetY <
          -JOYSTICK_DEAD_ZONE
        ) {
          nextKeys.add("w");
        }

        if (
          offsetY >
          JOYSTICK_DEAD_ZONE
        ) {
          nextKeys.add("s");
        }

        if (
          offsetX <
          -JOYSTICK_DEAD_ZONE
        ) {
          nextKeys.add("a");
        }

        if (
          offsetX >
          JOYSTICK_DEAD_ZONE
        ) {
          nextKeys.add("d");
        }

        const currentKeys =
          activeMovementKeysRef.current;

        for (const key of currentKeys) {
          if (!nextKeys.has(key)) {
            void sendKey(
              key,
              "up"
            );
          }
        }

        for (const key of nextKeys) {
          if (!currentKeys.has(key)) {
            void sendKey(
              key,
              "down"
            );
          }
        }

        activeMovementKeysRef.current =
          nextKeys;
      },
      [sendKey]
    );

  const handleJoystickPointerDown = (
    event: ReactPointerEvent<HTMLDivElement>
  ) => {
    event.preventDefault();

    joystickPointerIdRef.current =
      event.pointerId;

    event.currentTarget.setPointerCapture(
      event.pointerId
    );

    const rect =
      event.currentTarget.getBoundingClientRect();

    joystickCenterRef.current = {
      x:
        rect.left +
        rect.width / 2,
      y:
        rect.top +
        rect.height / 2,
    };
  };

  const handleJoystickPointerMove = (
    event: ReactPointerEvent<HTMLDivElement>
  ) => {
    if (
      joystickPointerIdRef.current !==
      event.pointerId
    ) {
      return;
    }

    event.preventDefault();

    const center =
      joystickCenterRef.current;

    const rawX =
      event.clientX - center.x;

    const rawY =
      event.clientY - center.y;

    const distance = Math.hypot(
      rawX,
      rawY
    );

    const ratio =
      distance > JOYSTICK_RADIUS
        ? JOYSTICK_RADIUS /
          distance
        : 1;

    const offsetX =
      rawX * ratio;

    const offsetY =
      rawY * ratio;

    setJoystickOffset({
      x: offsetX,
      y: offsetY,
    });

    updateMovementKeys(
      offsetX,
      offsetY
    );
  };

  const stopJoystick =
    useCallback(() => {
      joystickPointerIdRef.current =
        null;

      setJoystickOffset({
        x: 0,
        y: 0,
      });

      const currentKeys =
        activeMovementKeysRef.current;

      for (const key of currentKeys) {
        void sendKey(
          key,
          "up"
        );
      }

      activeMovementKeysRef.current =
        new Set();
    }, [sendKey]);

  const handleJoystickPointerUp = (
    event: ReactPointerEvent<HTMLDivElement>
  ) => {
    if (
      joystickPointerIdRef.current !==
      event.pointerId
    ) {
      return;
    }

    event.preventDefault();

    stopJoystick();
  };

  const handleLookPointerDown = (
    event: ReactPointerEvent<HTMLDivElement>
  ) => {
    event.preventDefault();

    lookPointerIdRef.current =
      event.pointerId;

    previousLookPointRef.current = {
      x: event.clientX,
      y: event.clientY,
    };

    event.currentTarget.setPointerCapture(
      event.pointerId
    );
  };

  const handleLookPointerMove = (
    event: ReactPointerEvent<HTMLDivElement>
  ) => {
    if (
      lookPointerIdRef.current !==
      event.pointerId
    ) {
      return;
    }

    const previousPoint =
      previousLookPointRef.current;

    if (!previousPoint) {
      return;
    }

    event.preventDefault();

    const dx =
      (event.clientX -
        previousPoint.x) *
      MOUSE_SENSITIVITY;

    const dy =
      (event.clientY -
        previousPoint.y) *
      MOUSE_SENSITIVITY;

    previousLookPointRef.current = {
      x: event.clientX,
      y: event.clientY,
    };

    queueMouseMovement(dx, dy);
  };

  const stopLook = useCallback(() => {
    lookPointerIdRef.current =
      null;

    previousLookPointRef.current =
      null;
  }, []);

  const handleLookPointerUp = (
    event: ReactPointerEvent<HTMLDivElement>
  ) => {
    if (
      lookPointerIdRef.current !==
      event.pointerId
    ) {
      return;
    }

    event.preventDefault();

    stopLook();
  };

  const pressMomentaryKey =
    useCallback(
      (
        key: string
      ) => {
        void sendKey(
          key,
          "down"
        );

        window.setTimeout(() => {
          void sendKey(
            key,
            "up"
          );
        }, 100);
      },
      [sendKey]
    );

  return (
    <main
      className="relative h-dvh w-screen overflow-hidden bg-black text-white"
      style={{
        touchAction: "none",
      }}
    >
      <video
        ref={videoRef}
        autoPlay
        playsInline
        muted
        className="absolute inset-0 h-full w-full object-contain bg-black"
      />

      <div className="pointer-events-none absolute inset-0 bg-black/5" />

      <div className="absolute left-3 top-3 z-30 max-w-[55vw] rounded-lg bg-black/70 px-3 py-2 text-xs">
        <div>
          状態: {connectionStatus}
        </div>

        <div>
          Viewer:{" "}
          {viewerId
            ? viewerId.slice(0, 8)
            : "-"}
        </div>

        <div>
          視聴者数: {viewerCount}
        </div>
      </div>

      <div className="absolute right-3 top-3 z-30 rounded-lg bg-black/70 px-3 py-2 text-right text-xs">
        <div>
          Key RTT:{" "}
          {keyRtt !== null
            ? `${keyRtt} ms`
            : "-"}
        </div>

        <div>
          Mouse RTT:{" "}
          {mouseRtt !== null
            ? `${mouseRtt} ms`
            : "-"}
        </div>

        <div>
          Average:{" "}
          {averageRtt !== null
            ? `${averageRtt} ms`
            : "-"}
        </div>
      </div>

      <button
        type="button"
        onClick={() => {
          void focusGame();
        }}
        className="absolute left-1/2 top-3 z-40 -translate-x-1/2 rounded-lg bg-white/80 px-4 py-2 text-sm font-semibold text-black active:bg-white"
      >
        Focus Game
      </button>

      <div
        onPointerDown={
          handleLookPointerDown
        }
        onPointerMove={
          handleLookPointerMove
        }
        onPointerUp={
          handleLookPointerUp
        }
        onPointerCancel={
          handleLookPointerUp
        }
        className="absolute inset-y-0 right-0 z-10 w-1/2"
        style={{
          touchAction: "none",
        }}
      />

      <div
        onPointerDown={
          handleJoystickPointerDown
        }
        onPointerMove={
          handleJoystickPointerMove
        }
        onPointerUp={
          handleJoystickPointerUp
        }
        onPointerCancel={
          handleJoystickPointerUp
        }
        className="absolute bottom-8 left-8 z-30 flex h-36 w-36 items-center justify-center rounded-full border-2 border-white/60 bg-black/35"
        style={{
          touchAction: "none",
        }}
      >
        <div
          className="h-16 w-16 rounded-full border border-white/70 bg-white/35"
          style={{
            transform: `translate(${joystickOffset.x}px, ${joystickOffset.y}px)`,
          }}
        />
      </div>

      <div className="absolute bottom-8 right-6 z-40 flex items-end gap-3">
        <button
          type="button"
          onPointerDown={(
            event
          ) => {
            event.preventDefault();

            void sendKey(
              "shift",
              "down"
            );
          }}
          onPointerUp={(
            event
          ) => {
            event.preventDefault();

            void sendKey(
              "shift",
              "up"
            );
          }}
          onPointerCancel={() => {
            void sendKey(
              "shift",
              "up"
            );
          }}
          className="h-16 w-16 rounded-full border border-white/60 bg-black/55 text-sm font-semibold active:bg-white/40"
        >
          Shift
        </button>

        <button
          type="button"
          onPointerDown={(
            event
          ) => {
            event.preventDefault();

            pressMomentaryKey(
              "space"
            );
          }}
          className="h-20 w-20 rounded-full border-2 border-white/70 bg-white/25 text-sm font-bold active:bg-white/50"
        >
          Jump
        </button>
      </div>

      <details className="absolute bottom-1 left-1/2 z-50 max-h-36 w-[45vw] -translate-x-1/2 overflow-auto rounded bg-black/70 px-2 py-1 text-[10px]">
        <summary>
          WebRTCログ
        </summary>

        {logs.map(
          (log, index) => (
            <div key={`${log}-${index}`}>
              {log}
            </div>
          )
        )}
      </details>
    </main>
  );
}