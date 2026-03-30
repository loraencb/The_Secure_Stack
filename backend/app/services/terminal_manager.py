import subprocess
import threading
import queue


class TerminalSession:
    def __init__(self, process, output_queue):
        self.process = process
        self.output_queue = output_queue


def _reader_thread(pipe, output_queue, prefix=""):
    try:
        while True:
            data = pipe.readline()
            if not data:
                break
            output_queue.put(prefix + data)
    except Exception as exc:
        output_queue.put(f"\r\n[reader error] {exc}\r\n")

def _container_is_running(container_name: str) -> bool:
    result = subprocess.run(
        ["docker", "inspect", "-f", "{{.State.Running}}", container_name],
        capture_output=True,
        text=True,
    )
    return result.returncode == 0 and result.stdout.strip().lower() == "true"

def create_terminal_session(session_id: int):
    container_name = f"attacker-{session_id}"

    if not _container_is_running(container_name):
        raise RuntimeError(
            f"Attacker container '{container_name}' is not running. Launch the lab first."
        )

    process = subprocess.Popen(
        [
            "docker",
            "exec",
            "-i",
            container_name,
            "bash",
            "-i",
        ],
        stdin=subprocess.PIPE,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        text=True,
        bufsize=1,
    )

    output_queue = queue.Queue()

    stdout_thread = threading.Thread(
        target=_reader_thread,
        args=(process.stdout, output_queue, ""),
        daemon=True,
    )
    stderr_thread = threading.Thread(
        target=_reader_thread,
        args=(process.stderr, output_queue, "[stderr] "),
        daemon=True,
    )

    stdout_thread.start()
    stderr_thread.start()

    return TerminalSession(process, output_queue)


def write_to_terminal(session: TerminalSession, command: str):
    if session.process.poll() is not None:
        raise RuntimeError(
            f"Terminal process exited with code {session.process.returncode}"
        )

    if session.process.stdin is None:
        raise RuntimeError("Terminal stdin is not available")

    session.process.stdin.write(command + "\n")
    session.process.stdin.flush()


def read_from_terminal(session: TerminalSession):
    chunks = []
    while True:
        try:
            chunks.append(session.output_queue.get_nowait())
        except queue.Empty:
            break
    return "".join(chunks)


def cleanup_terminal_session(session: TerminalSession):
    if not session:
        return

    try:
        if session.process.poll() is None:
            session.process.terminate()
            session.process.wait(timeout=3)
    except Exception:
        try:
            session.process.kill()
        except Exception:
            pass