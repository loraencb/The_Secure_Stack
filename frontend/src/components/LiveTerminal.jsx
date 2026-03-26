import { useEffect, useRef } from "react";
import { Terminal } from "xterm";
import { FitAddon } from "xterm-addon-fit";
import "xterm/css/xterm.css";

export default function LiveTerminal({ sessionId, onFeedback }) {
  const terminalRef = useRef(null);

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

    const socket = new WebSocket(`ws://127.0.0.1:8000/ws/terminal/${sessionId}`);

    let currentLine = "";

    socket.onopen = () => {
      term.writeln(`[connected to session ${sessionId}]`);
      term.write("> ");
    };

    socket.onmessage = (event) => {
    try {
        const message = JSON.parse(event.data);

        if (message.type === "terminal_output") {
        term.write(message.data);
        } else if (message.type === "ai_feedback" && onFeedback) {
        onFeedback(message.data);
        }
    } catch {
        // fallback if backend sends plain text
        term.write(event.data);
    }
    };
    
    socket.onclose = () => {
      term.writeln("\r\n[terminal disconnected]");
    };

    socket.onerror = () => {
      term.writeln("\r\n[terminal socket error]");
    };

    term.onData((data) => {
      const code = data.charCodeAt(0);

      if (code === 13) {
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
      window.removeEventListener("resize", handleResize);
      socket.close();
      term.dispose();
    };
  }, [sessionId, onFeedback]);

  return (
    <div
      ref={terminalRef}
      style={{
        width: "100%",
        height: "400px",
        borderRadius: "12px",
        overflow: "hidden",
      }}
    />
  );
}