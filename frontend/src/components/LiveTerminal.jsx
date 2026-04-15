import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from "react";
import { Terminal } from "xterm";
import { FitAddon } from "xterm-addon-fit";
import "xterm/css/xterm.css";
import { buildWebSocketUrl, getAuthToken } from "../api/Client";

const DEFAULT_SHELL_USER = "root";
const DEFAULT_SHELL_PATH = "~/secure-stack-lab";
const ANSI_ESCAPE_PATTERN = /\u001b\[[0-9;?]*[ -/]*[@-~]/g;
const BACKEND_PROMPT_PATTERN =
  /(^|\r?\n)\[stderr\]\s*([A-Za-z0-9_.-]+)@([A-Za-z0-9_.-]+):([^\r\n]*?)([#\$])\s*(?=$|\r?\n)/g;

function buildShellMeta(containerLabel) {
  return {
    user: DEFAULT_SHELL_USER,
    host: containerLabel || "workspace",
    path: DEFAULT_SHELL_PATH,
    marker: "#",
  };
}

function formatShellPrompt({ user, host, path, marker }) {
  return (
    `\x1b[1;32m${user}@${host}\x1b[0m:` +
    `\x1b[1;34m${path}\x1b[0m` +
    `\x1b[1;37m${marker}\x1b[0m `
  );
}

const LiveTerminal = forwardRef(function LiveTerminal({
  sessionId,
  containerLabel,
  onFeedback,
  onFindingSuggestion,
  onFindingAutoSaved,
  onCommandSubmitted,
  onCommandResult,
}, ref) {
  const terminalRef = useRef(null);
  const termInstanceRef = useRef(null);
  const socketRef = useRef(null);
  const activeCommandRef = useRef(null);
  const commandOutputRef = useRef("");
  const promptVisibleRef = useRef(false);
  const shellMetaRef = useRef(buildShellMeta(containerLabel));
  const [terminalStatus, setTerminalStatus] = useState("connecting");
  const [isFocused, setIsFocused] = useState(false);
  const [shellMeta, setShellMeta] = useState(() => buildShellMeta(containerLabel));

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
    const nextShellMeta = buildShellMeta(containerLabel);
    shellMetaRef.current = nextShellMeta;
    setShellMeta(nextShellMeta);
  }, [containerLabel, sessionId]);

  const requestTutorHelp = useCallback((intent = "hint") => {
    const socket = socketRef.current;

    if (!socket || socket.readyState !== WebSocket.OPEN) {
      throw new Error("The tutor is only available while the live shell is connected.");
    }

    socket.send(
      JSON.stringify({
        type: "ask_tutor",
        intent,
      })
    );
  }, []);

  useImperativeHandle(
    ref,
    () => ({
      requestTutorHelp,
      focus() {
        terminalRef.current?.focus();
      },
    }),
    [requestTutorHelp]
  );

  useEffect(() => {
    if (!sessionId || !terminalRef.current) return;

    setTerminalStatus("connecting");
    setIsFocused(false);
    promptVisibleRef.current = false;
    shellMetaRef.current = buildShellMeta(containerLabel);
    setShellMeta(shellMetaRef.current);

    const term = new Terminal({
      cursorBlink: true,
      cursorStyle: "block",
      rows: 20,
      cols: 80,
      convertEol: true,
      fontFamily: '"IBM Plex Mono", "Cascadia Code", "Fira Code", monospace',
      fontSize: 15,
      fontWeight: 500,
      lineHeight: 1.45,
      letterSpacing: 0.2,
      scrollback: 3000,
      theme: {
        background: "#050b14",
        foreground: "#d9f7ff",
        cursor: "#1af2a6",
        cursorAccent: "#050b14",
        selectionBackground: "rgba(36, 168, 255, 0.28)",
        black: "#09101a",
        red: "#ff6b81",
        green: "#1af2a6",
        yellow: "#ffd166",
        blue: "#3ab8ff",
        magenta: "#9a7bff",
        cyan: "#59f1ff",
        white: "#d9f7ff",
        brightBlack: "#6d839f",
        brightRed: "#ff91a3",
        brightGreen: "#67ffc2",
        brightYellow: "#ffe28b",
        brightBlue: "#82d5ff",
        brightMagenta: "#baa6ff",
        brightCyan: "#97fbff",
        brightWhite: "#f5feff",
      },
    });

    const fitAddon = new FitAddon();
    term.loadAddon(fitAddon);
    term.open(terminalRef.current);
    fitAddon.fit();

    termInstanceRef.current = term;

    const authToken = getAuthToken();
    const socketUrl = new URL(buildWebSocketUrl(`/terminal/${sessionId}`));
    if (authToken) {
      socketUrl.searchParams.set("token", authToken);
    }
    const socket = new WebSocket(socketUrl);
    socketRef.current = socket;

    let currentLine = "";
    let isDisposed = false;
    const terminalElement = terminalRef.current;
    const writePrompt = () => {
      term.write(formatShellPrompt(shellMetaRef.current));
      promptVisibleRef.current = true;
    };
    const syncPromptFromOutput = (output) => {
      let promptDetected = false;
      const sanitizedOutput = output.replace(
        BACKEND_PROMPT_PATTERN,
        (match, leadingLineBreak, user, host, path, marker) => {
          const nextShellMeta = {
            user: user || DEFAULT_SHELL_USER,
            host: host || containerLabel || "workspace",
            path: (path || DEFAULT_SHELL_PATH).replace(ANSI_ESCAPE_PATTERN, ""),
            marker: marker || "#",
          };
          promptDetected = true;
          shellMetaRef.current = nextShellMeta;
          setShellMeta(nextShellMeta);
          return leadingLineBreak || "";
        }
      );

      return {
        output: sanitizedOutput,
        promptDetected,
      };
    };

    socket.onopen = () => {
      if (isDisposed) return;
      setTerminalStatus("connected");
      term.writeln(
        `\x1b[1;36m[secure stack connected to session ${sessionId}]\x1b[0m`
      );
      term.writeln(
        "\x1b[1;32m[workspace ready - validate the current guide step here]\x1b[0m"
      );
      writePrompt();
    };

    socket.onmessage = (event) => {
      if (isDisposed) return;

      try {
        const message = JSON.parse(event.data);

        if (message.type === "terminal_output") {
          const { output, promptDetected } = syncPromptFromOutput(message.data);

          if (activeCommandRef.current) {
            commandOutputRef.current += output;
          }

          if (output) {
            term.write(output);
          }

          if (promptDetected) {
            if (promptVisibleRef.current && !currentLine && !activeCommandRef.current) {
              term.write("\r\x1b[2K");
            }

            if (!promptVisibleRef.current || (!currentLine && !activeCommandRef.current)) {
              writePrompt();
            }
          }
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

          if (!promptVisibleRef.current) {
            writePrompt();
          }
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
        const { output, promptDetected } = syncPromptFromOutput(event.data);

        if (output) {
          term.write(output);
        }

        if (promptDetected && !promptVisibleRef.current) {
          writePrompt();
        }
      }
    };

    socket.onclose = () => {
      if (isDisposed) return;
      setTerminalStatus("disconnected");
      promptVisibleRef.current = false;
      term.writeln("\r\n\x1b[1;31m[terminal disconnected]\x1b[0m");
    };

    socket.onerror = () => {
      if (isDisposed) return;
      setTerminalStatus("error");
      promptVisibleRef.current = false;
      term.writeln("\r\n\x1b[1;31m[terminal socket error]\x1b[0m");
    };

    const dataDisposable = term.onData((data) => {
      if (socket.readyState !== WebSocket.OPEN) {
        return;
      }

      const code = data.charCodeAt(0);

      if (!promptVisibleRef.current) {
        return;
      }

      if (code === 13) {
        const submitted = currentLine.trim();

        if (onFeedbackRef.current) onFeedbackRef.current(null);

        if (!submitted) {
          term.write("\r\n");
          currentLine = "";
          promptVisibleRef.current = false;
          writePrompt();
          return;
        }

        if (onCommandSubmittedRef.current) {
          onCommandSubmittedRef.current(submitted);
        }

        activeCommandRef.current = { command: submitted };
        commandOutputRef.current = "";
        promptVisibleRef.current = false;

        socket.send(
          JSON.stringify({
            type: "terminal_input",
            command: currentLine,
          })
        );
        term.write("\r\n");
        currentLine = "";
      } else if (code === 127) {
        if (currentLine.length > 0) {
          currentLine = currentLine.slice(0, -1);
          term.write("\b \b");
        }
      } else if (code >= 32) {
        currentLine += data;
        term.write(data);
      }
    });

    const handleResize = () => fitAddon.fit();
    const handleFocusIn = () => setIsFocused(true);
    const handleFocusOut = () => setIsFocused(false);
    window.addEventListener("resize", handleResize);
    terminalElement.addEventListener("focusin", handleFocusIn);
    terminalElement.addEventListener("focusout", handleFocusOut);

    return () => {
      isDisposed = true;
      window.removeEventListener("resize", handleResize);
      terminalElement.removeEventListener("focusin", handleFocusIn);
      terminalElement.removeEventListener("focusout", handleFocusOut);
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
  }, [containerLabel, sessionId]);

  return (
    <div
      className={`terminal-shell ${isFocused ? "terminal-shell--focused" : ""}`}
    >
      <div className="terminal-shell__chrome">
        <div className="terminal-shell__lights" aria-hidden="true">
          <span />
          <span />
          <span />
        </div>
        <div className="terminal-shell__identity">
          <span className="terminal-shell__prompt">
            {shellMeta.user}@{shellMeta.host}
          </span>
          <span className="terminal-shell__path">:{shellMeta.path}</span>
          <span className="terminal-shell__marker">{shellMeta.marker}</span>
        </div>
        <span
          className={`terminal-shell__status terminal-shell__status--${terminalStatus}`}
        >
          {terminalStatus === "connected"
            ? "Live shell"
            : terminalStatus === "error"
            ? "Connection issue"
            : terminalStatus === "disconnected"
            ? "Disconnected"
            : "Connecting"}
        </span>
      </div>

      <div className="terminal-shell__footer">
        <span>Interactive lab shell</span>
        <span>{isFocused ? "Input active" : "Click terminal to focus"}</span>
      </div>

      <div ref={terminalRef} className="terminal-shell__viewport" />
    </div>
  );
});

export default LiveTerminal;
