import { useEffect, useRef } from "react";
import { Terminal } from "xterm";
import { FitAddon } from "xterm-addon-fit";
import "xterm/css/xterm.css";

export default function LiveTerminal({
  sessionId,
  onFeedback,
  onFindingSuggestion,
  onFindingAutoSaved,
  onCommandSubmitted,
  onCommandResult,
}) {
  const terminalRef = useRef(null);
  const termInstanceRef = useRef(null);
  const socketRef = useRef(null);
  const activeCommandRef = useRef(null);
  const commandOutputRef = useRef("");

  const onFeedbackRef = useRef(onFeedback);
  const onFindingSuggestionRef = useRef(onFindingSuggestion);
  const onFindingAutoSavedRef = useRef(onFindingAutoSaved);
  const onCommandSubmittedRef = useRef(onCommandSubmitted);
  const onCommandResultRef = useRef(onCommandResult);

  useEffect(() => {
    onFeedbackRef.current = onFeedback;
  }, [onFeedback]);

  useEffect(() => {
    onFindingSuggestionRef.current = onFindingSuggestion;
  }, [onFindingSuggestion]);

  useEffect(() => {
    onFindingAutoSavedRef.current = onFindingAutoSaved;
  }, [onFindingAutoSaved]);

  useEffect(() => {
    onCommandSubmittedRef.current = onCommandSubmitted;
  }, [onCommandSubmitted]);

  useEffect(() => {
    onCommandResultRef.current = onCommandResult;
  }, [onCommandResult]);

  useEffect(() => {
    if (!sessionId || !terminalRef.current) return;

    const term = new Terminal({
      cursorBlink: true,
      rows: 20,
      cols: 80,
      convertEol: true,
      theme: {
        background: "#081427",
        foreground: "#f9fafb",
      },
    });

    const fitAddon = new FitAddon();
    term.loadAddon(fitAddon);
    term.open(terminalRef.current);
    fitAddon.fit();

    termInstanceRef.current = term;

    const socket = new WebSocket(`ws://127.0.0.1:8000/ws/terminal/${sessionId}`);
    socketRef.current = socket;

    let currentLine = "";
    let isDisposed = false;

    socket.onopen = () => {
      if (isDisposed) return;
      term.writeln(`[connected to session ${sessionId}]`);
    };

    socket.onmessage = (event) => {
      if (isDisposed) return;

      try {
        const message = JSON.parse(event.data);

        if (message.type === "terminal_output") {
          if (activeCommandRef.current) {
            commandOutputRef.current += message.data;
          }
          term.write(message.data);
        } else if (message.type === "ai_feedback" && onFeedbackRef.current) {
          onFeedbackRef.current(message.data);

          if (activeCommandRef.current && onCommandResultRef.current) {
            onCommandResultRef.current({
              command: activeCommandRef.current.command,
              output: commandOutputRef.current,
              feedback: message.data,
            });
          }

          activeCommandRef.current = null;
          commandOutputRef.current = "";
        } else if (
          message.type === "finding_suggestion" &&
          onFindingSuggestionRef.current
        ) {
          onFindingSuggestionRef.current(message.data);
        } else if (
          message.type === "finding_auto_saved" &&
          onFindingAutoSavedRef.current
        ) {
          onFindingAutoSavedRef.current(message.data);
        }
      } catch {
        term.write(event.data);
      }
    };

    socket.onclose = () => {
      if (isDisposed) return;
      term.writeln("\r\n[terminal disconnected]");
    };

    socket.onerror = () => {
      if (isDisposed) return;
      term.writeln("\r\n[terminal socket error]");
    };

    const dataDisposable = term.onData((data) => {
      if (socket.readyState !== WebSocket.OPEN) {
        return;
      }

      const code = data.charCodeAt(0);

      if (code === 13) {
        const submitted = currentLine.trim();

        if (onFeedbackRef.current) onFeedbackRef.current(null);
        if (submitted && onCommandSubmittedRef.current) {
          onCommandSubmittedRef.current(submitted);
        }

        activeCommandRef.current = submitted ? { command: submitted } : null;
        commandOutputRef.current = "";

        socket.send(currentLine);
        term.write("\r\n");
        currentLine = "";
      } else if (code === 127) {
        if (currentLine.length > 0) {
          currentLine = currentLine.slice(0, -1);
          term.write("\b \b");
        }
      } else {
        currentLine += data;
        term.write(data);
      }
    });

    const handleResize = () => fitAddon.fit();
    window.addEventListener("resize", handleResize);

    return () => {
      isDisposed = true;
      window.removeEventListener("resize", handleResize);
      dataDisposable.dispose();

      if (socketRef.current) {
        socketRef.current.close();
        socketRef.current = null;
      }

      if (termInstanceRef.current) {
        termInstanceRef.current.dispose();
        termInstanceRef.current = null;
      }
    };
  }, [sessionId]);

  return (
    <div
      ref={terminalRef}
      style={{
        width: "100%",
        height: "400px",
        borderRadius: "12px",
        overflow: "hidden",
        backgroundColor: "#081427",
      }}
    />
  );
}
