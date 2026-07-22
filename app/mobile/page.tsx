"use client";

import {
  PointerEvent as ReactPointerEvent,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";

type SocketMessage = {
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

  const latencyCanvasRef =
    useRef<HTMLCanvasElement | null>(null);

  const socketRef =
    useRef<WebSocket | null>(null);

  const peerConnectionRef =
    useRef<RTCPeerConnection | null>(null);

  const viewerIdRef = useRef("");

  const pendingOfferRef =
    useRef<SocketMessage | null>(null);

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

  const mouseDeltaRef = useRef({
    dx: 0,
    dy: 0,
  });

  const mouseAnimationFrameRef =
    useRef<number | null>(null);

  const visualLatencyStartedAtRef =
    useRef<number | null>(null);

  const visualLatencyFrameRef =
    useRef<number | null>(null);

  const markerBaselineRef =
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

  const [visualLatency, setVisualLatency] =
    useState<number | null>(null);

  const [
    isMeasuringVisualLatency,
    setIsMeasuringVisualLatency,
  ] = useState(false);

  const rttHistoryRef =
    useRef<number[]>([]);

  const addLog = useCallback(
    (message: string) => {
      console.log(message);

      setLogs((currentLogs) => {
        return [
          ...currentLogs,
          message,
        ].slice(-12);
      });
    },
    []
  );

  const getApiBase = useCallback(() => {
    return `http://${window.location.hostname}:8010`;
  }, []);

  const recordLatency = useCallback(
    (
      latency: number,
      type: "key" | "mouse"
    ) => {
      const rounded =
        Math.round(latency * 10) / 10;

      if (type === "key") {
        setKeyRtt(rounded);
      } else {
        setMouseRtt(rounded);
      }

      const history = [
        ...rttHistoryRef.current,
        latency,
      ].slice(-30);

      rttHistoryRef.current = history;

      const total = history.reduce(
        (sum, value) => sum + value,
        0
      );

      setAverageRtt(
        Math.round(
          (total / history.length) * 10
        ) / 10
      );
    },
    []
  );

  const sendKey = useCallback(
    async (
      key: string,
      action: "down" | "up" | "press"
    ) => {
      const startedAt = performance.now();

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

        const result =
          (await response.json()) as InputResponse;

        const rtt =
          performance.now() - startedAt;

        recordLatency(rtt, "key");

        console.log("key input", {
          key,
          action,
          rtt,
          processingMs:
            result.processing_ms,
        });
      } catch (error) {
        console.error(
          "key input failed:",
          error
        );

        addLog(
          `キー送信失敗: ${key}`
        );
      }
    },
    [
      addLog,
      getApiBase,
      recordLatency,
    ]
  );

  const sendMouseMove = useCallback(
    async (
      dx: number,
      dy: number
    ) => {
      if (dx === 0 && dy === 0) {
        return;
      }

      const startedAt = performance.now();

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

        const result =
          (await response.json()) as InputResponse;

        const rtt =
          performance.now() - startedAt;

        recordLatency(rtt, "mouse");

        console.log("mouse input", {
          dx,
          dy,
          rtt,
          processingMs:
            result.processing_ms,
        });
      } catch (error) {
        console.error(
          "mouse input failed:",
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
        mouseDeltaRef.current.dx += dx;
        mouseDeltaRef.current.dy += dy;

        if (
          mouseAnimationFrameRef.current !==
          null
        ) {
          return;
        }

        mouseAnimationFrameRef.current =
          requestAnimationFrame(
            flushMouseMovement
          );
      },
      [flushMouseMovement]
    );

  const focusGame = useCallback(async () => {
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
        "UE5をフォーカスしました"
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

  const stopVisualLatencyDetection =
    useCallback(() => {
      if (
        visualLatencyFrameRef.current !==
        null
      ) {
        cancelAnimationFrame(
          visualLatencyFrameRef.current
        );

        visualLatencyFrameRef.current =
          null;
      }

      visualLatencyStartedAtRef.current =
        null;

      markerBaselineRef.current = null;

      setIsMeasuringVisualLatency(false);
    }, []);

  const readMarkerBrightness =
    useCallback((): number | null => {
      const video = videoRef.current;
      const canvas =
        latencyCanvasRef.current;

      if (!video || !canvas) {
        return null;
      }

      if (
        video.readyState <
          HTMLMediaElement.HAVE_CURRENT_DATA ||
        video.videoWidth === 0 ||
        video.videoHeight === 0
      ) {
        return null;
      }

      const context = canvas.getContext(
        "2d",
        {
          willReadFrequently: true,
        }
      );

      if (!context) {
        return null;
      }

      /*
       * Windows画面左上の約180×180pxを監視。
       * マーカーは画面左上から20pxの位置にある。
       */
      const sourceWidth = Math.min(
        180,
        video.videoWidth
      );

      const sourceHeight = Math.min(
        180,
        video.videoHeight
      );

      context.drawImage(
        video,
        0,
        0,
        sourceWidth,
        sourceHeight,
        0,
        0,
        canvas.width,
        canvas.height
      );

      const imageData =
        context.getImageData(
          0,
          0,
          canvas.width,
          canvas.height
        );

      let brightnessTotal = 0;
      let pixelCount = 0;

      for (
        let index = 0;
        index < imageData.data.length;
        index += 4
      ) {
        const red =
          imageData.data[index];

        const green =
          imageData.data[index + 1];

        const blue =
          imageData.data[index + 2];

        brightnessTotal +=
          (red + green + blue) / 3;

        pixelCount += 1;
      }

      if (pixelCount === 0) {
        return null;
      }

      return brightnessTotal / pixelCount;
    },
    []
  );

  const detectVisualLatency = useCallback(
    function detectVisualLatencyFrame() {
      const startedAt =
        visualLatencyStartedAtRef.current;

      if (startedAt === null) {
        stopVisualLatencyDetection();
        return;
      }

      const brightness =
        readMarkerBrightness();

      const baseline =
        markerBaselineRef.current;

      if (
        brightness !== null &&
        baseline !== null
      ) {
        const increase =
          brightness - baseline;

        /*
        * マーカーが黒から白へ変わった場合、
        * 基準値より明るさが大きく上昇します。
        */
        if (increase > 45) {
          const latency =
            performance.now() - startedAt;

          const rounded =
            Math.round(latency * 10) / 10;

          setVisualLatency(rounded);

          addLog(
            `Visual Latency: ${rounded} ms`
          );

          stopVisualLatencyDetection();
          return;
        }
      }

      /*
      * 5秒経過しても検出できなければ終了します。
      */
      if (
        performance.now() - startedAt >
        5000
      ) {
        addLog(
          "映像マーカーを検出できませんでした"
        );

        stopVisualLatencyDetection();
        return;
      }

      visualLatencyFrameRef.current =
        requestAnimationFrame(
          detectVisualLatencyFrame
        );
    },
    [
      addLog,
      readMarkerBrightness,
      stopVisualLatencyDetection,
    ]
  );

  const measureVisualLatency =
    useCallback(async () => {
      if (isMeasuringVisualLatency) {
        return;
      }

      const video = videoRef.current;

      if (
        !video ||
        video.readyState <
          HTMLMediaElement.HAVE_CURRENT_DATA
      ) {
        addLog(
          "映像が再生されていません"
        );
        return;
      }

      const baseline =
        readMarkerBrightness();

      if (baseline === null) {
        addLog(
          "マーカー領域を読み取れません"
        );
        return;
      }

      markerBaselineRef.current =
        baseline;

      setVisualLatency(null);
      setIsMeasuringVisualLatency(true);

      visualLatencyStartedAtRef.current =
        performance.now();

      visualLatencyFrameRef.current =
        requestAnimationFrame(
          detectVisualLatency
        );

      try {
        const response = await fetch(
          `${getApiBase()}/latency-flash`,
          {
            method: "POST",
          }
        );

        if (!response.ok) {
          throw new Error(
            `HTTP ${response.status}`
          );
        }
      } catch (error) {
        console.error(
          "visual latency request failed:",
          error
        );

        addLog(
          "映像遅延計測の送信に失敗しました"
        );

        stopVisualLatencyDetection();
      }
    }, [
      addLog,
      detectVisualLatency,
      getApiBase,
      isMeasuringVisualLatency,
      readMarkerBrightness,
      stopVisualLatencyDetection,
    ]);

  const handleWebRtcOffer =
    useCallback(
      async (
        data: SocketMessage
      ) => {
        if (
          !data.sdp ||
          !data.viewer_id
        ) {
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
            setConnectionStatus(
              `WebRTC: ${peerConnection.connectionState}`
            );

            addLog(
              `peer: ${peerConnection.connectionState}`
            );
          };

        peerConnection.oniceconnectionstatechange =
          () => {
            addLog(
              `ice: ${peerConnection.iceConnectionState}`
            );
          };

        peerConnection.ontrack = (
          event
        ) => {
          const video =
            videoRef.current;

          if (!video) {
            return;
          }

          const stream =
            event.streams[0] ??
            new MediaStream([
              event.track,
            ]);

          video.srcObject = stream;

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
                "映像再生に失敗しました"
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

        for (const candidate of pendingCandidatesRef.current) {
          try {
            await peerConnection.addIceCandidate(
              new RTCIceCandidate(
                candidate
              )
            );
          } catch (error) {
            console.error(
              "pending ICE failed:",
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

        socketRef.current?.send(
          JSON.stringify({
            type: "webrtc_answer",
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
          ) as SocketMessage;

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

          if (!viewerIdRef.current) {
            pendingOfferRef.current =
              data;
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
            !data.candidate ||
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

        addLog(
          "メッセージ処理に失敗しました"
        );
      }
    };

    socket.onerror = () => {
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

      peerConnectionRef.current?.close();

      peerConnectionRef.current =
        null;

      socketRef.current = null;

      pendingOfferRef.current =
        null;

      pendingCandidatesRef.current =
        [];

      stopVisualLatencyDetection();
    };
  }, [
    addLog,
    handleWebRtcOffer,
    stopVisualLatencyDetection,
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

    document.addEventListener(
      "visibilitychange",
      handleVisibilityChange
    );

    return () => {
      document.removeEventListener(
        "visibilitychange",
        handleVisibilityChange
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

  const stopJoystick =
    useCallback(() => {
      joystickPointerIdRef.current =
        null;

      setJoystickOffset({
        x: 0,
        y: 0,
      });

      for (
        const key of
        activeMovementKeysRef.current
      ) {
        void sendKey(
          key,
          "up"
        );
      }

      activeMovementKeysRef.current =
        new Set();
    }, [sendKey]);

  const handleJoystickDown = (
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

  const handleJoystickMove = (
    event: ReactPointerEvent<HTMLDivElement>
  ) => {
    if (
      joystickPointerIdRef.current !==
      event.pointerId
    ) {
      return;
    }

    event.preventDefault();

    const rawX =
      event.clientX -
      joystickCenterRef.current.x;

    const rawY =
      event.clientY -
      joystickCenterRef.current.y;

    const distance = Math.hypot(
      rawX,
      rawY
    );

    const ratio =
      distance > JOYSTICK_RADIUS
        ? JOYSTICK_RADIUS /
          distance
        : 1;

    const x = rawX * ratio;
    const y = rawY * ratio;

    setJoystickOffset({
      x,
      y,
    });

    updateMovementKeys(x, y);
  };

  const handleJoystickUp = (
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

  const handleLookDown = (
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

  const handleLookMove = (
    event: ReactPointerEvent<HTMLDivElement>
  ) => {
    if (
      lookPointerIdRef.current !==
      event.pointerId
    ) {
      return;
    }

    const previous =
      previousLookPointRef.current;

    if (!previous) {
      return;
    }

    event.preventDefault();

    const dx =
      (event.clientX - previous.x) *
      MOUSE_SENSITIVITY;

    const dy =
      (event.clientY - previous.y) *
      MOUSE_SENSITIVITY;

    previousLookPointRef.current = {
      x: event.clientX,
      y: event.clientY,
    };

    queueMouseMovement(dx, dy);
  };

  const stopLook = () => {
    lookPointerIdRef.current = null;
    previousLookPointRef.current = null;
  };

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
        className="absolute inset-0 h-full w-full bg-black object-contain"
      />

      <canvas
        ref={latencyCanvasRef}
        width={48}
        height={48}
        className="hidden"
      />

      <div className="absolute left-3 top-3 z-30 rounded-lg bg-black/70 px-3 py-2 text-xs">
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

      <div className="absolute right-3 top-3 z-40 rounded-lg bg-black/75 px-3 py-2 text-right text-xs">
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
          Average RTT:{" "}
          {averageRtt !== null
            ? `${averageRtt} ms`
            : "-"}
        </div>

        <div className="mt-1 font-semibold">
          Visual Latency:{" "}
          {visualLatency !== null
            ? `${visualLatency} ms`
            : "-"}
        </div>

        <button
          type="button"
          onClick={() => {
            void measureVisualLatency();
          }}
          disabled={
            isMeasuringVisualLatency
          }
          className="mt-2 rounded bg-yellow-400 px-3 py-2 font-semibold text-black disabled:opacity-50"
        >
          {isMeasuringVisualLatency
            ? "計測中..."
            : "映像遅延を計測"}
        </button>
      </div>

      <button
        type="button"
        onClick={() => {
          void focusGame();
        }}
        className="absolute left-1/2 top-3 z-50 -translate-x-1/2 rounded bg-white/85 px-4 py-2 text-sm font-semibold text-black"
      >
        Focus Game
      </button>

      <div
        onPointerDown={
          handleLookDown
        }
        onPointerMove={
          handleLookMove
        }
        onPointerUp={stopLook}
        onPointerCancel={stopLook}
        className="absolute inset-y-0 right-0 z-10 w-1/2"
      />

      <div
        onPointerDown={
          handleJoystickDown
        }
        onPointerMove={
          handleJoystickMove
        }
        onPointerUp={
          handleJoystickUp
        }
        onPointerCancel={
          handleJoystickUp
        }
        className="absolute bottom-8 left-8 z-30 flex h-36 w-36 items-center justify-center rounded-full border-2 border-white/60 bg-black/35"
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
          onPointerDown={(event) => {
            event.preventDefault();

            void sendKey(
              "shift",
              "down"
            );
          }}
          onPointerUp={(event) => {
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
          className="h-16 w-16 rounded-full border border-white/60 bg-black/55 text-sm font-semibold"
        >
          Shift
        </button>

        <button
          type="button"
          onPointerDown={(event) => {
            event.preventDefault();

            void sendKey(
              "space",
              "down"
            );

            window.setTimeout(() => {
              void sendKey(
                "space",
                "up"
              );
            }, 100);
          }}
          className="h-20 w-20 rounded-full border-2 border-white/70 bg-white/25 text-sm font-bold"
        >
          Jump
        </button>
      </div>

      <details className="absolute bottom-1 left-1/2 z-50 max-h-36 w-[45vw] -translate-x-1/2 overflow-auto rounded bg-black/75 px-2 py-1 text-[10px]">
        <summary>
          WebRTCログ
        </summary>

        {logs.map((log, index) => (
          <div key={`${index}-${log}`}>
            {log}
          </div>
        ))}
      </details>
    </main>
  );
}