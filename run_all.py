import subprocess
import os
import signal
import sys
import time


def main():
    # Paths
    uvicorn_cmd = ["uvicorn", "api:app", "--reload"]
    uvicorn_cwd = os.path.join(os.getcwd(), "backend")

    # On Windows, you may need "http-server.cmd"
    http_server_cmd = ["http-server.cmd", "."]
    http_server_cwd = os.path.join(os.getcwd(), "frontend")

    # Start backend
    backend_proc = subprocess.Popen(uvicorn_cmd, cwd=uvicorn_cwd, shell=False)
    print("Backend started with PID:", backend_proc.pid)

    # Start frontend
    frontend_proc = subprocess.Popen(
        http_server_cmd, cwd=http_server_cwd, shell=True)
    print("Frontend started with PID:", frontend_proc.pid)

    # Keep both processes running until CTRL+C
    try:
        while True:
            time.sleep(1)
    except KeyboardInterrupt:
        print("\nShutting down...")
        for proc in (backend_proc, frontend_proc):
            proc.send_signal(signal.SIGINT)
        time.sleep(2)
        for proc in (backend_proc, frontend_proc):
            proc.kill()
        sys.exit(0)


if __name__ == "__main__":
    main()
