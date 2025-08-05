import React, { useEffect, useRef, useState } from "react";
import "./App.css";

function App() {
  const [nickname, setNickname] = useState("");
  const [inputNickname, setInputNickname] = useState("");
  const [message, setMessage] = useState("");
  const [chatLog, setChatLog] = useState([]);
  const [imageFile, setImageFile] = useState(null);

  const [mediaRecorder, setMediaRecorder] = useState(null);
  const [isRecording, setIsRecording] = useState(false);
  const [recordingType, setRecordingType] = useState(""); // "stt" or "talk"
  const audioChunks = useRef([]);
  const ws = useRef(null);
  const messagesEndRef = useRef(null);

  useEffect(() => {
    if (!nickname) return;
    ws.current = new WebSocket(`ws://localhost:8000/ws/${nickname}`);

    ws.current.onmessage = (event) => {
      const data = JSON.parse(event.data);
      setChatLog((prev) => [...prev, data]);

      // @talk 응답일 때 오디오 재생 처리 (data.type === "audio" 인 경우)
      if (data.type === "audio" && data.audioData) {
        // audio 재생용 오디오 태그 별도로 관리해도 됨.
        // 여기선 그냥 chatLog 렌더링 시 오디오 컨트롤 보여줌
      }
    };

    ws.current.onclose = () => {
      console.log("WebSocket 연결 종료");
    };

    return () => ws.current?.close();
  }, [nickname]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [chatLog]);

  const sendMessage = () => {
    if (!message.trim() || !ws.current || ws.current.readyState !== WebSocket.OPEN) return;

    // @tts 명령어 텍스트만 서버에 보냄
    if (message.startsWith("@tts")) {
      ws.current.send(
        JSON.stringify({
          type: "text",
          nickname,
          message: message.trim(),
        })
      );
      setMessage("");
      return;
    }

    // 일반 텍스트
    ws.current.send(
      JSON.stringify({
        type: "text",
        nickname,
        message: message.trim(),
      })
    );
    setMessage("");
  };

  const sendImage = () => {
    if (!imageFile || !nickname.trim()) return;

    const reader = new FileReader();
    reader.onload = () => {
      const base64Data = reader.result.split(",")[1];
      ws.current?.send(
        JSON.stringify({
          type: "image",
          nickname,
          imageData: base64Data,
          timestamp: new Date().toISOString(),
        })
      );
      setImageFile(null);
    };
    reader.readAsDataURL(imageFile);
  };

  const startRecording = (type) => {
    if (isRecording) return;
    setRecordingType(type);
    setIsRecording(true);
    audioChunks.current = [];

    navigator.mediaDevices
      .getUserMedia({ audio: true })
      .then((stream) => {
        const recorder = new MediaRecorder(stream);
        setMediaRecorder(recorder);

        recorder.ondataavailable = (e) => {
          if (e.data.size > 0) audioChunks.current.push(e.data);
        };

        recorder.onstop = () => {
          const blob = new Blob(audioChunks.current, { type: "audio/webm" });
          const reader = new FileReader();
          reader.onloadend = () => {
            const base64Audio = reader.result.split(",")[1];
            const command = type === "stt" ? "@stt" : "@talk";

            ws.current.send(
              JSON.stringify({
                type: "audio",
                nickname,
                message: command,
                audioData: base64Audio,
                timestamp: new Date().toISOString(),
              })
            );
          };
          reader.readAsDataURL(blob);
          setIsRecording(false);
        };

        recorder.start();
      })
      .catch((err) => {
        console.error("녹음 권한 거부 또는 오류:", err);
        setIsRecording(false);
      });
  };

  const stopRecording = () => {
    if (mediaRecorder && mediaRecorder.state !== "inactive") {
      mediaRecorder.stop();
    }
  };

  return (
    <div className="container">
      <h2>Chat</h2>

      {!nickname && (
        <div>
          <input
            value={inputNickname}
            onChange={(e) => setInputNickname(e.target.value)}
            placeholder="Enter nickname"
            onKeyDown={(e) => e.key === "Enter" && setNickname(inputNickname.trim())}
          />
          <button onClick={() => setNickname(inputNickname.trim())}>Enter</button>
        </div>
      )}

      <div className="chat-box" style={{ minHeight: "350px", overflowY: "auto" }}>
        {chatLog.map((msg, i) => (
          <div key={i} style={{ marginBottom: "10px" }}>
            <strong>{msg.nickname}</strong>:
            <div style={{ marginTop: "3px" }}>
              {msg.type === "audio" && msg.audioData ? (
                <>
                  <div>{msg.message}</div>
                  <audio controls>
                    <source src={`data:audio/mp3;base64,${msg.audioData}`} type="audio/mp3" />
                    브라우저에서 오디오를 지원하지 않습니다.
                  </audio>
                </>
              ) : msg.type === "image" && msg.imageData ? (
                <img
                  src={`data:image/png;base64,${msg.imageData}`}
                  alt="Uploaded"
                  style={{ maxWidth: "300px", borderRadius: "8px", marginTop: "5px" }}
                />
              ) : (
                msg.message
              )}
            </div>
          </div>
        ))}
        <div ref={messagesEndRef} />
      </div>

      <div className="input-bar" style={{ marginTop: "10px" }}>
        <input
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && sendMessage()}
          placeholder="메시지를 입력하세요. (@tts 사용 가능)"
          style={{ width: "75%", marginRight: "5px" }}
          disabled={isRecording}
        />
        <button onClick={sendMessage} disabled={isRecording || !message.trim()}>
          Send
        </button>
      </div>

      <div className="input-bar" style={{ marginTop: "10px" }}>
        <input
          type="file"
          accept="image/*"
          onChange={(e) => setImageFile(e.target.files[0])}
          disabled={isRecording}
        />
        <button onClick={sendImage} disabled={!imageFile || isRecording}>
          Send Image
        </button>
      </div>

      <div className="input-bar" style={{ marginTop: "10px", gap: "10px" }}>
        <button onClick={() => startRecording("stt")} disabled={isRecording}>
          Start STT
        </button>
        <button onClick={() => startRecording("talk")} disabled={isRecording}>
          Start Talk
        </button>
        <button onClick={stopRecording} disabled={!isRecording}>
          Stop & Send
        </button>
      </div>
    </div>
  );
}

export default App;
