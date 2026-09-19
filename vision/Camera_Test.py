#!/usr/bin/env python3
"""
camera_test.py

Quick webcam test:
- Lists / opens a camera by index
- Prints resolution and measured FPS
- Shows a live preview window
- Press SPACE to save a snapshot, 'q' or ESC to quit
- Each run auto-creates a folder named snapshots_<date>_<time>, and every
  snapshot taken during that run is saved into it as snapshot_001.jpg, etc.

Requirements:
    pip install opencv-python

Usage:
    python camera_test.py                  # uses camera index 1 (external USB camera)
    python camera_test.py --index 0        # use a different camera
    python camera_test.py --list           # list available camera indices
    python camera_test.py --out-dir myfolder  # use a fixed folder instead of auto-named
"""

import argparse
import os
import time
import sys
from datetime import datetime

try:
    import cv2
except ImportError:
    sys.exit("OpenCV not found. Install it with:  pip install opencv-python")


def list_cameras(max_index=10):
    print("Scanning for available cameras...")
    found = []
    for i in range(max_index):
        cap = cv2.VideoCapture(i)
        if cap is not None and cap.isOpened():
            w = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
            h = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
            print(f"  Index {i}: available ({w}x{h})")
            found.append(i)
        cap.release()
    if not found:
        print("  No cameras found.")
    return found


def test_camera(index=0, snapshot_dir=None):
    cap = cv2.VideoCapture(index)
    if not cap.isOpened():
        sys.exit(f"Could not open camera at index {index}.")

    width = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
    height = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
    print(f"Camera {index} opened: {width}x{height}")

    # Create a folder named after this session's date/time, e.g. snapshots_2026-09-19_14-32-05
    if snapshot_dir is None:
        session_name = datetime.now().strftime("snapshots_%Y-%m-%d_%H-%M-%S")
        snapshot_dir = os.path.join(os.getcwd(), session_name)
    os.makedirs(snapshot_dir, exist_ok=True)
    print(f"Snapshots will be saved to: {snapshot_dir}")
    print("Press SPACE to save a snapshot, 'q' or ESC to quit.")

    frame_count = 0
    start_time = time.time()
    fps_display = 0.0
    snapshot_count = 0

    while True:
        ret, frame = cap.read()
        if not ret:
            print("Failed to grab frame. Exiting.")
            break

        frame_count += 1
        elapsed = time.time() - start_time
        if elapsed >= 1.0:
            fps_display = frame_count / elapsed
            frame_count = 0
            start_time = time.time()

        overlay = frame.copy()
        cv2.imshow("Camera Test - SPACE to save, Q/ESC to quit", overlay)

        key = cv2.waitKey(1) & 0xFF
        if key in (ord("q"), 27):  # 'q' or ESC
            break
        elif key == ord(" "):
            snapshot_count += 1
            filename = f"snapshot_{snapshot_count:03d}_{datetime.now().strftime('%H-%M-%S')}.jpg"
            snapshot_path = os.path.join(snapshot_dir, filename)
            cv2.imwrite(snapshot_path, frame)
            print(f"Saved snapshot to {snapshot_path}")

    cap.release()
    cv2.destroyAllWindows()


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Simple webcam test tool")
    parser.add_argument("--index", type=int, default=1, help="Camera index to open (default: 1, external USB camera)")
    parser.add_argument("--list", action="store_true", help="List available camera indices and exit")
    parser.add_argument(
        "--out-dir",
        type=str,
        default=None,
        help="Folder to save snapshots into (default: auto-named snapshots_<date>_<time> in the current directory)",
    )
    args = parser.parse_args()

    if args.list:
        list_cameras()
    else:
        test_camera(index=args.index, snapshot_dir=args.out_dir)