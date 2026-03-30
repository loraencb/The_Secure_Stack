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
}) {
  const terminalRef = useRef(null);
  const termInstanceRef = useRef(null);
  const fitAddonRef = useRef(null);
  const socketRef = useRef(null);
  const currentLineRef = useRef("");
  const resizeObserverRef = useRef(null);

  const onFeedbackRef = useRef(onFeedback);
  const onFindingSuggestionRef = useRef(onFindingSuggestion);
  const onFindingAutoSavedRef = useRef(onFindingAutoSaved);
  const onCommandSubmittedRef = useRef(onCommandSubmitted);

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
    if (!sessionId || !terminalRef.current) {
      return undefined;
    }

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
    fitAddonRef.current = fitAddon;

    term.loadAddon(fitAddon);
    term.open(terminalRef.current);
    fitAddon.fit();

    termInstanceRef.current = term;
    currentLineRef.current = "";

    const socket = new WebSocket(`ws://127.0.0.1:8000/ws/terminal/${sessionId}`);
    socketRef.current = socket;

    socket.onopen = () => {
      term.writeln(`[connected to session ${sessionId}]`);
      term.write("> ");
    };

    socket.onmessage = (event) => {
      try {
        const message = JSON.parse(event.data);

        if (message.type === "terminal_output") {
          term.write(message.data);
          return;
        }

        if (message.type === "ai_feedback" && onFeedbackRef.current) {
          onFeedbackRef.current(message.data);
          return;
        }

        if (
          message.type === "finding_suggestion" &&
          onFindingSuggestionRef.current
        ) {
          onFindingSuggestionRef.current(message.data);
          return;
        }

        if (
          message.type === "finding_auto_saved" &&
          onFindingAutoSavedRef.current
        ) {
          onFindingAutoSavedRef.current(message.data);
        }
      } catch {
        term.write(String(event.data));
      }
    };

    socket.onclose = () => {
      term.writeln("\r\n[terminal disconnected]");
    };

    socket.onerror = () => {
      term.writeln("\r\n[terminal socket error]");
    };

    const dataDisposable = term.onData((data) => {
      const socketReady = socket.readyState === WebSocket.OPEN;

      if (!socketReady) {
        return;
      }

      const code = data.charCodeAt(0);

      if (code === 13) {
        const submitted = currentLineRef.current.trim();

        if (onFeedbackRef.current) {
          onFeedbackRef.current(null);
        }

        if (submitted && onCommandSubmittedRef.current) {
          onCommandSubmittedRef.current(submitted);
        }

        socket.send(currentLineRef.current);
        term.write("\r\n");
        currentLineRef.current = "";
        return;
      }

      if (code === 127) {
        if (currentLineRef.current.length > 0) {
          currentLineRef.current = currentLineRef.current.slice(0, -1);
          term.write("\b \b");
        }
        return;
      }

      if (code < 32 && code !== 9) {
        return;
      }

      currentLineRef.current += data;
      term.write(data);
    });

    const handleResize = () => {
      try {
        fitAddon.fit();
      } catch {
        // ignore fit errors during teardown/resizing
      }
    };

    window.addEventListener("resize", handleResize);

    if (typeof ResizeObserver !== "undefined") {
      const resizeObserver = new ResizeObserver(() => {
        handleResize();
      });
      resizeObserver.observe(terminalRef.current);
      resizeObserverRef.current = resizeObserver;
    }

    return () => {
      window.removeEventListener("resize", handleResize);

      if (resizeObserverRef.current) {
        resizeObserverRef.current.disconnect();
        resizeObserverRef.current = null;
      }

      dataDisposable.dispose();

      if (socketRef.current) {
        socketRef.current.close();
        socketRef.current = null;
      }

      if (termInstanceRef.current) {
        termInstanceRef.current.dispose();
        termInstanceRef.current = null;
      }

      fitAddonRef.current = null;
      currentLineRef.current = "";
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