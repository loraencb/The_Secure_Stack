import logging
import queue
import select
import threading

from app.config import settings
from app.services.lab_launcher import get_docker_client

logger = logging.getLogger("securestack.terminal")


class DockerExecProcess:
    def __init__(self, stream, client):
        self.stream = stream
        self.socket = getattr(stream, "_sock", stream)
        self.client = client
        self.returncode = None
        self._closed = False
        self._lock = threading.Lock()

    def poll(self):
        return self.returncode if self._closed else None

    def mark_closed(self, returncode: int = 0):
        with self._lock:
            if self._closed:
                return
            self._closed = True
            self.returncode = returncode

    def terminate(self):
        self._close(returncode=0)

    def wait(self, timeout=None):
        self.mark_closed(0)
        return self.returncode

    def kill(self):
        self._close(returncode=1)

    def _close(self, returncode: int):
        with self._lock:
            if self._closed:
                return
            try:
                self.socket.close()
            except Exception:
                pass
            try:
                self.stream.close()
            except Exception:
                pass
            try:
                self.client.close()
            except Exception:
                pass
            self._closed = True
            self.returncode = returncode


class TerminalSession:
    def __init__(self, process, output_queue):
        self.process = process
        self.output_queue = output_queue


def get_attacker_container_name(session_id: int) -> str:
    return f"attacker-{session_id}"


def _reader_thread(stream, output_queue, process: DockerExecProcess, prefix=""):
    try:
        file_descriptor = process.socket.fileno()
        while process.poll() is None:
            ready, _, _ = select.select([file_descriptor], [], [], 0.1)
            if not ready:
                continue

            data = process.socket.recv(4096)
            if not data:
                break

            output_queue.put(prefix + data.decode("utf-8", errors="replace"))
    except Exception as exc:
        output_queue.put(f"\r\n[reader error] {exc}\r\n")
    finally:
        process.mark_closed(0)


def _get_running_container(container_name: str):
    client = get_docker_client()
    try:
        container = client.containers.get(container_name)
        container.reload()
        if container.status != "running":
            client.close()
            return None
        return client, container
    except Exception:
        client.close()
        raise


def create_terminal_session(session_id: int):
    container_name = get_attacker_container_name(session_id)

    result = _get_running_container(container_name)
    if not result:
        raise RuntimeError(
            f"Attacker container '{container_name}' is not running. Launch the lab first."
        )

    client, container = result
    try:
        exec_result = container.exec_run(
            [settings.container_shell, "-i"],
            stdin=True,
            tty=True,
            socket=True,
            demux=False,
        )
    except Exception:
        client.close()
        raise

    process = DockerExecProcess(exec_result.output, client)
    output_queue = queue.Queue()

    reader = threading.Thread(
        target=_reader_thread,
        args=(exec_result.output, output_queue, process, ""),
        daemon=True,
    )
    reader.start()

    return TerminalSession(process, output_queue)


def write_to_terminal(session: TerminalSession, command: str):
    if session.process.poll() is not None:
        raise RuntimeError(
            f"Terminal process exited with code {session.process.returncode}"
        )

    try:
        session.process.socket.sendall((command + "\n").encode("utf-8"))
    except (BrokenPipeError, OSError, ValueError) as exc:
        session.process.mark_closed(1)
        raise RuntimeError("Terminal process is no longer accepting input.") from exc


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
